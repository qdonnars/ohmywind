# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Runtime SHOM Atlas C2D registry: spatial index + tide-relative predictor.

Loads the Parquet + JSON artefacts produced by ``scripts/build_shom_c2d.py``
and exposes prediction at any ``(lat, lon, datetime)`` independently of MARC.

Pipeline at query time:

1. Test bbox membership (cheap rectangle test). Outside the SHOM bbox, the
   caller falls back to MARC or SMOC.
2. KDTree-nearest lookup over the ~13 k scattered points → returns the
   point's 4 series (U/V at vives-eaux 95 and mortes-eaux 45) and its
   reference port key.
3. Harmonic prediction at the reference port's M2/S2/N2/K1/O1/M4 constants
   to find the PM (or BM) event nearest to the query time. Yields the
   ``hour_offset`` ∈ [-6, +6] used to linear-interp the 13-sample series.
4. Linear interpolation in time over the 13-hour series, twice (coef 45
   and coef 95), and finally a linear interpolation in coefficient based
   on the tide range predicted at Brest around that instant.

Steps 3 and 4 are evaluated for a whole series at once: both sample the
harmonic on a 5-minute grid around each instant, the grids of neighbouring
instants overlap almost entirely, and the union of them is one call instead of
220 per instant. See the block comment on the scan lattice below.

All harmonic constants live in the JSON file shipped alongside the
Parquet, so this module never imports MARC at runtime — the MARC
dependency is purely build-time. If MARC is dropped in a later iteration,
SHOM C2D keeps working.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np
import polars as pl

from openwind_data.currents.harmonic import predict as harmonic_predict

# Hour offsets covered by the SHOM 13-sample series, in hours relative to
# PM/BM at the reference port.
_HOUR_OFFSETS = np.arange(-6, 7, dtype=float)
# Mean-equinox tidal range at Brest (m). SHOM defines coef 100 as
# 100 x range / 6.1 m. Used here to normalise the day's predicted range
# into a tidal coefficient.
_BREST_MEAN_RANGE_M = 6.1
# How wide a window to scan around the query time when locating a tide
# event. Slightly wider than half the M2 period (12.42 h) so we always
# bracket exactly one PM and one BM.
_TIDE_SCAN_HALFWINDOW = timedelta(hours=7.0)
# Sampling step inside the scan window (minutes). 5-min step gives < 1 min
# of error on the located extremum, well below the harmonic resolution.
_TIDE_SCAN_STEP_MIN = 5

# ---------------------------------------------------------------------------
# The scan lattice
#
# Both searches below sample the same harmonic on a regular grid around each
# query time: the tide event every 5 minutes over +-7 h, the day's range every
# 30 minutes over +-12.5 h. Done one query at a time, that is 169 + 51 = 220
# harmonic predictions per instant, and a 30-day hourly series pays it 721
# times over. Measured 1.4 ms per instant, 1.03 s for the series (audit C2),
# on the event loop, blocking every other request on the single worker.
#
# The windows of neighbouring instants overlap almost entirely, and they all
# fall on one 5-minute lattice: 30 minutes is 6 steps of it, and every query
# time in a series is a whole number of steps from the first. So the whole
# series needs the harmonic evaluated once, on the union of its windows, and
# everything after that is indexing. Same samples, same order, same numbers.
# ---------------------------------------------------------------------------
_LATTICE_STEP = timedelta(minutes=_TIDE_SCAN_STEP_MIN)
_LATTICE_STEP_US = _TIDE_SCAN_STEP_MIN * 60 * 1_000_000
# Lattice offsets of the tide-event window: +-7 h in 5-minute steps.
_EVENT_HALF_STEPS = int(_TIDE_SCAN_HALFWINDOW.total_seconds() / 60 / _TIDE_SCAN_STEP_MIN)
_EVENT_STEPS = np.arange(-_EVENT_HALF_STEPS, _EVENT_HALF_STEPS + 1)
# Lattice offsets of the coefficient window: +-12.5 h in 30-minute steps,
# which is +-25 steps of 6. A 25 h span covers two semi-diurnal cycles.
_COEF_STEPS = np.arange(-25, 26) * (30 // _TIDE_SCAN_STEP_MIN)
# How many lattice samples the harmonic sees at once. 16 384 keeps its
# working set around 30 MB whatever the caller asks for, and is well past the
# 9 000 a 30-day hourly series needs, so the common case runs in one block.
_HARMONIC_BLOCK = 16384


def _as_utc(t: datetime) -> datetime:
    """Match what the scalar helpers did: assume UTC when the caller was vague."""
    return t if t.tzinfo is not None else t.replace(tzinfo=UTC)


@dataclass(frozen=True, slots=True)
class _ScanGroup:
    """Query times that share one 5-minute lattice, and where each one sits on it.

    A series is normally one group: Open-Meteo answers on the hour, and the
    overlay endpoint steps by whole minutes from a single start. Two instants
    land in different groups only when they are not a whole number of
    5-minute steps apart, which costs nothing but a second, smaller lattice.
    """

    at: np.ndarray  # indices into the caller's list of times
    origin: datetime  # lattice point zero
    steps: np.ndarray  # lattice step of each query time, int64


def _scan_groups(times: list[datetime]) -> list[_ScanGroup]:
    """Partition ``times`` into groups sharing a 5-minute lattice.

    Integer microseconds throughout: a residual computed in floating-point
    seconds would scatter a perfectly regular series across groups on the
    rounding of a millisecond.

    Naive instants are read as UTC here rather than at each call site, which
    is what the scalar helpers this replaced did one by one.
    """
    times = [_as_utc(t) for t in times]
    anchor = times[0]
    deltas = np.array(
        [(t - anchor) // timedelta(microseconds=1) for t in times],
        dtype=np.int64,
    )
    residuals = deltas % _LATTICE_STEP_US
    groups: list[_ScanGroup] = []
    for residual in np.unique(residuals):
        at = np.flatnonzero(residuals == residual)
        groups.append(
            _ScanGroup(
                at=at,
                origin=anchor + timedelta(microseconds=int(residual)),
                steps=deltas[at] // _LATTICE_STEP_US,
            )
        )
    return groups


def _sampled_windows(
    group: _ScanGroup,
    offsets: np.ndarray,
    constants: dict[str, tuple[float, float]],
) -> np.ndarray:
    """Harmonic heights over each query's window, shape ``(len(group), len(offsets))``.

    The union of the windows is evaluated once. For a 30-day hourly series
    that is about 9 000 samples instead of 721 x 169.

    Evaluated in blocks, because the predictor allocates several
    ``(samples, 60)`` float64 arrays and the overlay endpoint accepts 800
    steps of up to 6 h: a 4 800 h span sampled every 5 minutes is 57 000
    points, and letting one anonymous request allocate a quarter of a
    gigabyte in a container sized for a single worker is a denial of service
    with extra steps. Blocking changes nothing about the values: each sample's
    harmonic depends on its own instant and on nothing else.
    """
    wanted = group.steps[:, None] + offsets
    needed = np.unique(wanted)
    heights = np.empty(needed.size, dtype=float)
    for begin in range(0, needed.size, _HARMONIC_BLOCK):
        block = needed[begin : begin + _HARMONIC_BLOCK]
        heights[begin : begin + block.size] = harmonic_predict(
            [group.origin + int(step) * _LATTICE_STEP for step in block], constants
        )
    return heights[np.searchsorted(needed, wanted)]


@dataclass(frozen=True, slots=True)
class _RefPortMeta:
    display_name: str
    lat: float
    lon: float
    ref_tide: str  # "PM" or "BM"
    constants: dict[str, tuple[float, float]]


@dataclass(frozen=True, slots=True)
class ShomC2dRegistry:
    """All SHOM C2D points + reference-port constants, indexed for fast lookup.

    Construct via :meth:`from_directory` once at server startup; callers
    keep a long-lived instance and call :meth:`predict_current_series`
    repeatedly. The struct holds ~5 MB of numpy arrays plus the KDTree.

    Field semantics:

    - ``lats`` / ``lons``: WGS84 in degrees, shape ``(N,)`` of float32.
    - ``u_ve`` / ``v_ve`` / ``u_me`` / ``v_me``: shape ``(N, 13)`` float32,
      hour offsets ``-6h..+6h``, in knots. ``ve`` = vives-eaux (coef 95),
      ``me`` = mortes-eaux (coef 45).
    - ``ref_port_keys``: per-point lookup key into ``ref_ports`` (object
      dtype, shape ``(N,)``).
    - ``zone_names``: per-point zone label, e.g. ``"MORBIHAN"``. Used in
      ``current_source`` provenance strings.
    - ``atlas_ids``: per-point SHOM atlas number (557..565), int16.
    - ``ref_ports``: dict ``key → _RefPortMeta`` for tide-event prediction.
    - ``bbox``: ``(lat_min, lon_min, lat_max, lon_max)`` for fast pre-filter.

    Spatial nearest-neighbour is brute-force vectorised numpy: a single
    query computes squared distance to all ~13 k points (~80 µs) and
    returns the minimum index. A KDTree would be faster asymptotically
    but adds a scipy dependency and saves microseconds we don't need at
    this scale. The per-query cost is dominated by the harmonic
    prediction at the reference port, not by the spatial lookup.
    """

    lats: np.ndarray  # shape (N,), float32
    lons: np.ndarray
    u_ve: np.ndarray  # shape (N, 13)
    v_ve: np.ndarray
    u_me: np.ndarray
    v_me: np.ndarray
    ref_port_keys: np.ndarray  # shape (N,), object
    zone_names: np.ndarray
    atlas_ids: np.ndarray  # shape (N,), int16
    ref_ports: dict[str, _RefPortMeta]
    bbox: tuple[float, float, float, float]
    _cos_mean_lat: float  # cached for query-side projection

    @classmethod
    def from_directory(cls, root: Path | str) -> ShomC2dRegistry:
        """Load the Parquet + JSON pair from a build artefact directory.

        Returns an empty registry (zero points, ``bbox`` collapsed to
        ``(0, 0, 0, 0)``, an empty tree) if the directory is missing or
        the artefacts are absent. The runtime treats an empty registry as
        "not covered anywhere", so the cascade falls back to MARC / SMOC.
        """
        root = Path(root)
        points_path = root / "shom_c2d_points.parquet"
        ports_path = root / "shom_c2d_ref_ports.json"
        if not points_path.exists() or not ports_path.exists():
            return cls._empty()

        df = pl.read_parquet(points_path)
        if df.height == 0:
            return cls._empty()

        lats = df["lat"].to_numpy().astype(np.float32, copy=False)
        lons = df["lon"].to_numpy().astype(np.float32, copy=False)
        u_ve = np.array(df["u_ve_kn"].to_list(), dtype=np.float32)
        v_ve = np.array(df["v_ve_kn"].to_list(), dtype=np.float32)
        u_me = np.array(df["u_me_kn"].to_list(), dtype=np.float32)
        v_me = np.array(df["v_me_kn"].to_list(), dtype=np.float32)
        ref_port_keys = df["ref_port_key"].to_numpy()
        zone_names = df["zone"].to_numpy()
        atlas_ids = df["atlas_id"].to_numpy().astype(np.int16, copy=False)

        raw_ports = json.loads(ports_path.read_text())
        ref_ports = {
            key: _RefPortMeta(
                display_name=v["display_name"],
                lat=float(v["lat"]),
                lon=float(v["lon"]),
                ref_tide=str(v["ref_tide"]),
                constants={k: (float(amp), float(g)) for k, (amp, g) in v["constants"].items()},
            )
            for key, v in raw_ports.items()
        }

        cos_mean_lat = float(np.cos(np.deg2rad(lats.mean())))
        bbox = (
            float(lats.min()),
            float(lons.min()),
            float(lats.max()),
            float(lons.max()),
        )
        return cls(
            lats=lats,
            lons=lons,
            u_ve=u_ve,
            v_ve=v_ve,
            u_me=u_me,
            v_me=v_me,
            ref_port_keys=ref_port_keys,
            zone_names=zone_names,
            atlas_ids=atlas_ids,
            ref_ports=ref_ports,
            bbox=bbox,
            _cos_mean_lat=cos_mean_lat,
        )

    @classmethod
    def _empty(cls) -> ShomC2dRegistry:
        return cls(
            lats=np.zeros(0, dtype=np.float32),
            lons=np.zeros(0, dtype=np.float32),
            u_ve=np.zeros((0, 13), dtype=np.float32),
            v_ve=np.zeros((0, 13), dtype=np.float32),
            u_me=np.zeros((0, 13), dtype=np.float32),
            v_me=np.zeros((0, 13), dtype=np.float32),
            ref_port_keys=np.zeros(0, dtype=object),
            zone_names=np.zeros(0, dtype=object),
            atlas_ids=np.zeros(0, dtype=np.int16),
            ref_ports={},
            bbox=(0.0, 0.0, 0.0, 0.0),
            _cos_mean_lat=1.0,
        )

    # ------------------------------------------------------------------
    # Spatial coverage
    # ------------------------------------------------------------------

    # Maximum acceptable distance (km) between a query point and the nearest
    # SHOM C2D point for us to claim coverage. Beyond this, the query
    # falls back through the cascade — even though the bbox might still
    # contain it, the SHOM zone is too sparse to make the value meaningful.
    _MAX_NEAREST_KM = 5.0

    # Tolerance applied to the bbox short-circuit so float32-derived bbox
    # bounds don't reject queries that sit exactly on the edge of the
    # cloud. ~0.01° ≈ 1 km, well below the nearest-point distance gate.
    _BBOX_SLACK_DEG = 0.01

    def covers(self, lat: float, lon: float) -> bool:
        """Whether SHOM C2D has a point within ``_MAX_NEAREST_KM`` of (lat, lon).

        SHOM C2D is a scattered point cloud, not a regular grid: a query
        can fall well inside the bbox of the Morbihan cartouche yet sit
        on land or in a region SHOM didn't sample. The bbox test alone
        would over-claim. We pair it with a real distance check.
        """
        if not self.lats.size:
            return False
        lat_min, lon_min, lat_max, lon_max = self.bbox
        s = self._BBOX_SLACK_DEG
        if not (lat_min - s <= lat <= lat_max + s and lon_min - s <= lon <= lon_max + s):
            return False
        idx, dist_km = self._nearest(lat, lon)
        return idx is not None and dist_km <= self._MAX_NEAREST_KM

    def coverage_zones(self) -> tuple[tuple[str, tuple[float, float, float, float]], ...]:
        """One bounding box per SHOM zone, sorted by zone name.

        Exists so a caller can decide *not* to ask. The point cloud covers a
        few French Atlantic cartouches and nothing else, so a client planning
        in the Mediterranean can skip the round trip entirely rather than
        collect ``covered: false`` once per corridor point.

        Each box is the zone's own extent padded by the same tolerance
        :meth:`covers` applies, which buys the invariant that makes the
        endpoint safe to trust: **a point outside every returned box is a
        point ``covers`` refuses**. The converse does not hold, and cannot:
        the cloud is scattered, so a box contains land and gaps that
        ``covers`` rejects on the distance test. Skipping outside the boxes
        loses nothing; a call inside one may still come back uncovered.

        Boxes are ``(lat_min, lon_min, lat_max, lon_max)`` in WGS84 degrees,
        matching :attr:`bbox` and ``AtlasMeta.bbox`` on the MARC side.
        Returns an empty tuple for an empty registry.
        """
        if not self.lats.size:
            return ()
        # The tolerance is expressed in the same scaled space _nearest uses:
        # latitude degrees straight, longitude degrees divided by the mean
        # cosine. Padding in that space is what keeps the invariant exact
        # rather than approximately right.
        lat_pad = self._MAX_NEAREST_KM / 111.0
        lon_pad = lat_pad / max(self._cos_mean_lat, 1e-6)
        boxes: list[tuple[str, tuple[float, float, float, float]]] = []
        for name in sorted({str(z) for z in self.zone_names}):
            mask = self.zone_names == name
            lats = self.lats[mask]
            lons = self.lons[mask]
            boxes.append(
                (
                    name,
                    (
                        float(lats.min()) - lat_pad,
                        float(lons.min()) - lon_pad,
                        float(lats.max()) + lat_pad,
                        float(lons.max()) + lon_pad,
                    ),
                )
            )
        return tuple(boxes)

    def _nearest(self, lat: float, lon: float) -> tuple[int | None, float]:
        """Index of the nearest C2D point + distance in km, or ``(None, inf)``.

        Brute-force vectorised distance over the full point set in a
        local-tangent-plane projection (degrees-lon scaled by mean
        ``cos(lat)`` so the metric is roughly isotropic in km). At ~13 k
        points this runs in ~80 µs per query; no spatial index needed.
        """
        if not self.lats.size:
            return None, float("inf")
        dlat = self.lats - lat
        dlon = (self.lons - lon) * self._cos_mean_lat
        d2 = dlat * dlat + dlon * dlon  # squared distance in scaled degrees
        idx = int(np.argmin(d2))
        d_deg = float(np.sqrt(d2[idx]))
        # 1° in our scaled space ≈ 111 km on the ground (lat scale dominant).
        return idx, d_deg * 111.0

    # ------------------------------------------------------------------
    # Tide-event helpers (PM / BM at reference ports)
    # ------------------------------------------------------------------

    def _event_offsets_h(self, port: _RefPortMeta, times: list[datetime]) -> np.ndarray:
        """Hours from each query time to its nearest ``port.ref_tide`` event.

        The event is the global maximum (PM) or minimum (BM) of the harmonic
        over a +-7 h window sampled every 5 minutes: a 14 h span exceeds the
        M2 period (12.42 h), so it always contains exactly one of each. The
        result is what indexes the SHOM 13-sample series, which runs from
        -6 h to +6 h around the event.

        Sign convention: the offset is ``query - event``, negative before the
        event, matching the series' own axis.
        """
        offsets = np.empty(len(times), dtype=float)
        take = np.argmax if port.ref_tide == "PM" else np.argmin
        for group in _scan_groups(times):
            windows = _sampled_windows(group, _EVENT_STEPS, port.constants)
            picked = _EVENT_STEPS[take(windows, axis=1)]
            # ``(query - event).total_seconds() / 3600`` written out: the
            # event sits ``picked`` lattice steps *after* the query, so the
            # offset is the negative of that, in hours.
            offsets[group.at] = -(picked * _LATTICE_STEP.total_seconds()) / 3600.0
        return offsets

    def tide_coefficient(self, target_t: datetime) -> int:
        """National tidal coefficient (Brest-anchored) at ``target_t``.

        Returns an integer in [20, 120] matching the SHOM annuaire's daily
        coefficient. The French tidal coefficient is defined by convention
        at Brest (100 = mean-equinox vives-eaux range = 6.1 m), so the
        same value applies nationwide regardless of where the query point
        sits. Internally delegates to :meth:`_coefficient_for_day`, which
        already anchors on Brest's harmonic constants.

        Used by the web client to render the "Coef 87 — vives-eaux" pill
        next to the tide chart, and by the MCP layer to surface the coef
        of the departure day in ``plan_passage``.
        """
        brest = self.ref_ports.get("BREST")
        if brest is None:
            # Defensive: Brest should always be among the ref ports since
            # it anchors atlas 560. Falling back to coef 20 is intentionally
            # conservative — better than crashing the response.
            return 20
        return round(self._coefficient_for_day(brest, target_t))

    def _coefficient_for_day(self, port: _RefPortMeta, target_t: datetime) -> float:
        """National tidal coefficient (Brest-anchored) at ``target_t``.

        The French tidal coefficient is defined **at Brest** by convention:
        100 = mean-equinox spring range = 6.1 m. The same coefficient
        applies nationwide regardless of where you are — at Port-Navalo
        a 95-coef day still has the local Port-Navalo range, smaller than
        Brest's, but the coefficient itself is 95.

        Predicting the range at the local reference port and dividing by
        Brest's 6.1 m therefore produces a systematic underestimate (the
        local range is smaller than Brest's), which led to currents being
        scaled with an effective coef ~50-60 even on vives-eaux days.

        Fix: always use Brest's harmonic constants for this calculation
        when they're available in the ref-ports table; fall back to the
        local port only when Brest is absent (defensive — should never
        happen in practice since Brest is one of the SHOM ref ports).
        """
        return float(self._coefficients(port, [target_t])[0])

    def _coefficients(self, port: _RefPortMeta, times: list[datetime]) -> np.ndarray:
        """The coefficient at each of ``times``, vectorised over the series.

        Not once per calendar day: the window is a rolling 25 h centred on
        each instant, so two instants an hour apart see slightly different
        ranges. Rounding that to one value per day would move every current
        on the shoulders of a springs-to-neaps transition, which is where the
        coefficient matters most. Sampling it per instant costs nothing now
        that the harmonic is evaluated once for the whole series.
        """
        brest = self.ref_ports.get("BREST")
        anchor = brest if brest is not None else port
        coefs = np.empty(len(times), dtype=float)
        for group in _scan_groups(times):
            windows = _sampled_windows(group, _COEF_STEPS, anchor.constants)
            ranges = windows.max(axis=1) - windows.min(axis=1)
            coefs[group.at] = np.clip(100.0 * ranges / _BREST_MEAN_RANGE_M, 20.0, 120.0)
        return coefs

    # ------------------------------------------------------------------
    # Public predictor
    # ------------------------------------------------------------------

    def predict_current_series(
        self, lat: float, lon: float, times: list[datetime]
    ) -> tuple[np.ndarray, np.ndarray, str] | None:
        """Predict (speeds_kn, dirs_to_deg, source_label) at (lat, lon) for ``times``.

        Returns ``None`` when the query point is outside SHOM coverage
        (caller falls back to MARC / SMOC). The source label embeds the
        atlas id and zone name so downstream code can attribute the value,
        e.g. ``"shom_c2d_558_morbihan"``.

        Each query time still gets its own nearest tide event and its own
        rolling coefficient window; what changed in PR 2.4 is that the
        harmonic behind both is evaluated once for the whole series instead
        of 220 times per instant. Same samples, same numbers, ~40x less time.
        """
        idx, dist_km = self._nearest(lat, lon)
        if idx is None or dist_km > self._MAX_NEAREST_KM:
            return None

        port_key = str(self.ref_port_keys[idx])
        port = self.ref_ports.get(port_key)
        if port is None:
            return None  # build artefact mismatch — fail closed

        atlas_id = int(self.atlas_ids[idx])
        zone = str(self.zone_names[idx])
        source_label = f"shom_c2d_{atlas_id}_{zone.lower()}"
        if not times:
            return (
                np.empty(0, dtype=np.float32),
                np.empty(0, dtype=np.float32),
                source_label,
            )

        # Clamp to the sampled range; np.interp already clips at the ends,
        # but clamping explicitly keeps the intent clear.
        offsets_h = np.clip(self._event_offsets_h(port, times), -6.0, 6.0)
        u_ve_t = np.interp(offsets_h, _HOUR_OFFSETS, self.u_ve[idx])
        v_ve_t = np.interp(offsets_h, _HOUR_OFFSETS, self.v_ve[idx])
        u_me_t = np.interp(offsets_h, _HOUR_OFFSETS, self.u_me[idx])
        v_me_t = np.interp(offsets_h, _HOUR_OFFSETS, self.v_me[idx])

        w = (self._coefficients(port, times) - 45.0) / 50.0
        u = u_me_t + w * (u_ve_t - u_me_t)
        v = v_me_t + w * (v_ve_t - v_me_t)
        speeds = np.hypot(u, v).astype(np.float32)
        # Convert (u east, v north) to compass "to" direction.
        dirs = (np.rad2deg(np.arctan2(u, v)) % 360.0).astype(np.float32)
        return speeds, dirs, source_label
