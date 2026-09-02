# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""MARC PREVIMER atlas runtime loader and predictor.

Reads tiled Parquet datasets produced by ``scripts/build_marc_atlas.py`` (one
per atlas: ATLNE / MANGA / FINIS / MANW / MANE / SUDBZH / AQUI). Provides
height and current predictions at arbitrary (lat, lon, t).

Cascade priority within MARC: rank 2 (250 m, narrow passes) > rank 1 (700 m,
shelf) > rank 0 (2 km, open Atlantic). When a point lies in several emprises,
we pick the finest. Outside any MARC emprise, callers fall back to Open-Meteo
SMOC.

Predictor convention: standard SHOM/Schureman (see ``harmonic.py``). Heights
are around mean sea level (MSL = 0); add the cell's ``z0_hydro_m`` to convert
to chart datum (zéro hydrographique). Current direction follows oceanographic
convention "to" (0° = current setting toward the north).
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache
from pathlib import Path

import numpy as np
import polars as pl

from openwind_data.currents.harmonic import predict as schureman_predict

_TILE_SIZE_DEG = 0.5
# m/s to knots — conversion shared with the runtime adapters layer.
_MS_TO_KN = 1.0 / 0.514444
# Metres per degree of latitude, the flat-earth constant the cell-distance
# check has always used. Named here because the tile-edge search compares
# distances to tile boundaries against distances to cells and the two have to
# be measured with the same ruler.
_M_PER_DEG = 111_000.0


@dataclass(frozen=True, slots=True)
class AtlasMeta:
    """One MARC atlas as discovered on disk."""

    name: str
    rank: int
    resolution_m: int
    parquet_dir: Path
    bbox: tuple[float, float, float, float]  # (lat_min, lon_min, lat_max, lon_max)
    constituents_h: tuple[str, ...]
    constituents_u: tuple[str, ...]
    constituents_v: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class CellPrediction:
    """All MARC outputs at a single grid cell, ready for harmonic reconstruction."""

    atlas_name: str
    lat: float
    lon: float
    z0_hydro_m: float | None
    h_constants: dict[str, tuple[float, float]]
    u_constants: dict[str, tuple[float, float]]
    v_constants: dict[str, tuple[float, float]]


def _scan_atlas(parquet_dir: Path) -> AtlasMeta | None:
    """Load one atlas from a directory containing ``metadata.json`` + tiles."""
    meta_file = parquet_dir / "metadata.json"
    if not meta_file.exists():
        return None
    meta = json.loads(meta_file.read_text())
    coverage = parquet_dir / "coverage.geojson"
    if coverage.exists():
        cov = json.loads(coverage.read_text())
        coords = cov["features"][0]["geometry"]["coordinates"][0]
        lons = [c[0] for c in coords]
        lats = [c[1] for c in coords]
        bbox = (min(lats), min(lons), max(lats), max(lons))
    else:
        # Fallback: scan tile names. Not robust against partial atlas builds.
        bbox = (-90.0, -180.0, 90.0, 180.0)
    return AtlasMeta(
        name=meta["atlas"],
        rank=meta["rank"],
        resolution_m=meta["resolution_m"],
        parquet_dir=parquet_dir,
        bbox=bbox,
        constituents_h=tuple(meta.get("constituents_h", meta.get("constituents", []))),
        constituents_u=tuple(meta.get("constituents_u", [])),
        constituents_v=tuple(meta.get("constituents_v", [])),
    )


def _bbox_contains(bbox: tuple[float, float, float, float], lat: float, lon: float) -> bool:
    return bbox[0] <= lat <= bbox[2] and bbox[1] <= lon <= bbox[3]


@lru_cache(maxsize=128)
def _read_tile(parquet_path: str) -> pl.DataFrame | None:
    """LRU-cached tile reader. Returns None if the tile file is missing."""
    if not Path(parquet_path).exists():
        return None
    return pl.read_parquet(parquet_path)


def _tile_origin_of(lat: float, lon: float) -> tuple[float, float]:
    """South-west corner of the tile a point falls in, in degrees."""
    return (
        float(np.floor(lat / _TILE_SIZE_DEG) * _TILE_SIZE_DEG),
        float(np.floor(lon / _TILE_SIZE_DEG) * _TILE_SIZE_DEG),
    )


def _tile_path_at(atlas: AtlasMeta, tile_lat: float, tile_lon: float) -> Path:
    return (
        atlas.parquet_dir / f"tile_lat={tile_lat:.1f}" / f"tile_lon={tile_lon:.1f}" / "data.parquet"
    )


def _neighbour_tiles(lat: float, lon: float) -> list[tuple[float, float, float]]:
    """The eight tiles around the one holding ``(lat, lon)``, nearest first.

    Each entry is ``(tile_lat, tile_lon, floor_distance_m)`` where the floor is
    the shortest possible distance from the query point to *any* point of that
    tile: the distance to the shared edge for a side neighbour, the diagonal
    to the shared corner for a diagonal one. That floor is what makes the
    search exact and cheap at the same time. A cell in a neighbour cannot be
    nearer than the floor, so a caller holding a cell closer than the floor
    can skip the tile without opening it, and a caller holding nothing has a
    sound order to try them in.

    Distances use the same flat-earth ruler as the cell-distance check, so a
    tile is never opened for a cell the threshold would then reject.
    """
    tile_lat, tile_lon = _tile_origin_of(lat, lon)
    m_per_deg_lon = _M_PER_DEG * float(np.cos(np.deg2rad(lat)))
    to_south = (lat - tile_lat) * _M_PER_DEG
    to_north = (tile_lat + _TILE_SIZE_DEG - lat) * _M_PER_DEG
    to_west = (lon - tile_lon) * m_per_deg_lon
    to_east = (tile_lon + _TILE_SIZE_DEG - lon) * m_per_deg_lon

    out: list[tuple[float, float, float]] = []
    for di, d_lat_m in ((-1, to_south), (0, 0.0), (1, to_north)):
        for dj, d_lon_m in ((-1, to_west), (0, 0.0), (1, to_east)):
            if di == 0 and dj == 0:
                continue
            floor_m = float(np.hypot(d_lat_m if di else 0.0, d_lon_m if dj else 0.0))
            out.append(
                (
                    tile_lat + di * _TILE_SIZE_DEG,
                    tile_lon + dj * _TILE_SIZE_DEG,
                    floor_m,
                )
            )
    out.sort(key=lambda t: t[2])
    return out


# One rectangle in degrees, ``(lat_min, lon_min, lat_max, lon_max)``, same
# order as ``AtlasMeta.bbox``.
_Box = tuple[float, float, float, float]
_Boxes = tuple[_Box, ...]


def _tile_origin(dir_name: str) -> float | None:
    """Read the degree value out of a ``tile_lat=48.0`` / ``tile_lon=-5.0`` name."""
    _, _, raw = dir_name.partition("=")
    try:
        return float(raw)
    except ValueError:
        return None


def _tile_has_rows(parquet_path: Path) -> bool:
    """Whether a tile holds at least one cell, from the footer alone.

    ``pl.len()`` over a scan is answered from the Parquet metadata: measured
    1.0 ms on a 41 MB tile against 52 ms for a full read, and the same 0.9 ms
    on a 3-row tile, so the cost is the file open and not the payload. Reading
    the columns here would be catastrophic: a single 250 m tile is 30 k cells
    x 183 columns, and an atlas has thousands of tiles.
    """
    try:
        return pl.scan_parquet(parquet_path).select(pl.len()).collect().item() > 0
    except Exception:
        # A truncated or half-written tile is not coverage. ``covers`` would
        # skip it too (``_read_tile`` -> empty frame -> next candidate), so
        # dropping it here keeps the two consistent.
        return False


def _merge_tiles_into_rectangles(tiles: Iterable[tuple[float, float]]) -> _Boxes:
    """Coalesce ``(tile_lat, tile_lon)`` origins into as few boxes as possible.

    Run-length along longitude inside each latitude row: a row of adjacent
    tiles becomes one rectangle, a gap starts a new one. Rows stay separate,
    which keeps the merge O(n log n) and its output stable whatever order the
    filesystem hands the tiles back.

    Boxes are ``(lat_min, lon_min, lat_max, lon_max)``, sorted by latitude
    then longitude, and closed on all four sides where a tile is half-open on
    its upper edges. That makes a point on a seam belong to both neighbours
    rather than to neither, which is the direction that never loses coverage.
    """
    rows: dict[float, list[float]] = {}
    for tile_lat, tile_lon in tiles:
        rows.setdefault(tile_lat, []).append(tile_lon)

    boxes: list[_Box] = []
    for tile_lat in sorted(rows):
        lons = sorted(rows[tile_lat])
        run_start = run_end = lons[0]
        for lon in lons[1:]:
            if abs(lon - run_end - _TILE_SIZE_DEG) < 1e-9:
                run_end = lon
                continue
            boxes.append((tile_lat, run_start, tile_lat + _TILE_SIZE_DEG, run_end + _TILE_SIZE_DEG))
            run_start = run_end = lon
        boxes.append((tile_lat, run_start, tile_lat + _TILE_SIZE_DEG, run_end + _TILE_SIZE_DEG))
    return tuple(boxes)


@lru_cache(maxsize=32)
def _atlas_coverage_cells(parquet_dir: str) -> _Boxes:
    """Rectangles covering the non-empty tiles of one atlas directory.

    Module-level cache rather than per-instance state on purpose: the
    registries are built twice in the current deployment (once for the REST
    routes, once inside ``build_server``), and both copies of the same atlas
    directory should pay the directory walk once between them. Keyed by path,
    so a test building a fresh atlas under a new ``tmp_path`` never reads a
    previous one's answer.
    """
    root = Path(parquet_dir)
    if not root.is_dir():
        return ()
    tiles: list[tuple[float, float]] = []
    for lat_dir in sorted(root.glob("tile_lat=*")):
        tile_lat = _tile_origin(lat_dir.name)
        if tile_lat is None or not lat_dir.is_dir():
            continue
        for lon_dir in sorted(lat_dir.glob("tile_lon=*")):
            tile_lon = _tile_origin(lon_dir.name)
            if tile_lon is None:
                continue
            parquet = lon_dir / "data.parquet"
            if parquet.is_file() and _tile_has_rows(parquet):
                tiles.append((tile_lat, tile_lon))
    return _merge_tiles_into_rectangles(tiles)


def _nearest_cell_with_distance(
    df: pl.DataFrame, lat: float, lon: float, required_col: str | None = None
) -> tuple[int, float] | None:
    """Metric-nearest cell of one tile and its distance in metres, or None.

    Uses local-tangent-plane distance: degrees-lon are scaled by cos(lat) so
    we don't bias toward longitudinal neighbours at high latitude. When
    ``required_col`` is given, only cells with a finite value in that column
    are considered — this matters for currents because MARC's Arakawa C-grid
    offsets U and V by half a step from XE, so the metric-nearest XE cell can
    have an on-land U face (NaN) even when XE itself is valid sea. ~50 cells
    in FINIS exhibit this; routing through a slightly further cell with
    finite U/V is a sub-resolution shift, well within harmonic precision.

    Selection is exactly what it always was. The distance is the same
    flat-earth hypotenuse the caller used to recompute on the winning row,
    returned here so the tile-edge search can rank candidates coming from
    different tiles without redoing the trigonometry each time.
    """
    lats = df["lat"].to_numpy()
    lons = df["lon"].to_numpy()
    if len(lats) == 0:
        return None
    cos_lat = np.cos(np.deg2rad(lat))
    d2 = ((lats - lat) ** 2) + ((lons - lon) * cos_lat) ** 2
    if required_col is not None and required_col in df.columns:
        valid = np.isfinite(df[required_col].to_numpy())
        if not valid.any():
            return None
        d2 = np.where(valid, d2, np.inf)
    idx = int(np.argmin(d2))
    dlat_m = (float(lats[idx]) - lat) * _M_PER_DEG
    dlon_m = (float(lons[idx]) - lon) * _M_PER_DEG * cos_lat
    return idx, float(np.hypot(dlat_m, dlon_m))


def _extract_constants(df: pl.DataFrame, idx: int, suffix: str) -> dict[str, tuple[float, float]]:
    """Pull constituent (amp, phase) pairs from one cell row.

    ``suffix`` is one of ``"h"``, ``"u"``, ``"v"`` — selects which trio of
    columns (e.g. ``M2_h_amp`` / ``M2_h_g``) to read.
    """
    out: dict[str, tuple[float, float]] = {}
    amp_suffix = f"_{suffix}_amp"
    g_suffix = f"_{suffix}_g"
    for col in df.columns:
        if not col.endswith(amp_suffix):
            continue
        cname = col[: -len(amp_suffix)]
        amp = float(df[col][idx])
        phase_col = f"{cname}{g_suffix}"
        if phase_col not in df.columns:
            continue
        phase = float(df[phase_col][idx])
        if np.isfinite(amp) and np.isfinite(phase):
            out[cname] = (amp, phase)
    return out


@dataclass(frozen=True, slots=True)
class MarcAtlasRegistry:
    """All atlases discovered on disk. Picks the finest covering each query."""

    atlases: tuple[AtlasMeta, ...]

    @classmethod
    def from_directory(cls, root: Path | str) -> MarcAtlasRegistry:
        root = Path(root)
        if not root.exists():
            return cls(atlases=())
        found: list[AtlasMeta] = []
        for sub in sorted(root.iterdir()):
            if not sub.is_dir():
                continue
            atlas = _scan_atlas(sub)
            if atlas is not None:
                found.append(atlas)
        return cls(atlases=tuple(found))

    def coverage_cells(self) -> tuple[tuple[str, _Boxes], ...]:
        """Where each atlas actually holds data, as rectangles of whole tiles.

        Exists because :attr:`AtlasMeta.bbox` is far too coarse to decide with.
        The build writes coverage polygons as bounding boxes, so ATLNE's runs
        from 39.98 N to 64.99 N and from 20.03 W to 15.00 E: it swallows the
        entire Mediterranean, where the model has no valid cell at all. A
        client filtering on ``bbox`` alone skips nothing in the Med, which is
        precisely the case worth skipping (14 uncovered answers out of 14 in
        the live measurement).

        The contract, and it is exact rather than approximate: **a point
        outside every rectangle is a point :meth:`covers` refuses**;
        :attr:`AtlasMeta.bbox` stays the outer envelope. ``covers`` reads the
        single tile the point falls in and moves on when that tile is missing
        or empty, so a point outside every non-empty tile cannot be covered.
        The converse still does not hold: a tile is 0.5 degrees wide and
        contains land, so a point inside a rectangle may sit further than the
        distance threshold from any real cell.

        Result is ``(atlas name, boxes)`` per atlas, boxes as
        ``(lat_min, lon_min, lat_max, lon_max)``, ordered by latitude then
        longitude. Cached for the life of the process, keyed by atlas
        directory: the walk reads one Parquet footer per tile and nothing
        else, but that is still thousands of file opens on a large atlas.
        """
        return tuple((a.name, _atlas_coverage_cells(str(a.parquet_dir))) for a in self.atlases)

    # Tolerance for "the nearest cell is close enough to be considered valid".
    # Coverage polygons are bbox-only at build time, so the bbox can extend
    # beyond actual sea cells (e.g. ATLNE bbox includes parts of the Med where
    # the model has no valid cells).
    _MAX_CELL_DISTANCE_M = 5000.0  # 5 km, generous

    def _cell_threshold_m(self, atlas: AtlasMeta) -> float:
        """How far a cell may sit from the query and still answer for it."""
        return max(self._MAX_CELL_DISTANCE_M, 5.0 * atlas.resolution_m)

    def _best_cell(
        self,
        atlas: AtlasMeta,
        lat: float,
        lon: float,
        required_col: str | None = None,
        *,
        neighbours: bool = False,
    ) -> tuple[pl.DataFrame, int] | None:
        """Nearest qualifying cell of ``atlas``, optionally across tile seams.

        Returns the frame it was found in and its row index, or ``None`` when
        no cell with a finite ``required_col`` sits within
        ``max(5 km, 5x atlas resolution)`` of the query.

        Tiles are 0.5 degrees, so a point can sit a few hundred metres inside
        one and have its true nearest cell in the next: reading only the
        containing tile, which is what this did everywhere until now, handed
        such a point a cell further away than the one it should have got,
        precisely along the coastlines where the 250 m atlases are worth
        having. The audit filed this as Mo4.

        ``neighbours`` is what fixes it, and it is deliberately off by
        default. Two invariants would break if the seam search also decided
        *whether* a point is covered:

        - :meth:`coverage_cells` publishes whole non-empty tiles and promises
          that a point outside all of them is a point :meth:`covers` refuses.
          The web client skips its request on that promise, so a neighbour
          rescuing a point standing in an empty tile would make the server
          answer where the client has already been told not to ask.
        - the cascade picks the finest atlas that covers, so letting a
          neighbour tile establish coverage would promote a fine atlas whose
          nearest cell is kilometres away over a coarser one with a cell a few
          hundred metres away. Measured on the real atlases: 40 points of an
          Iroise grid would have moved from MANGA at 160 to 280 m to FINIS at
          3 to 5 km. Finer grid, worse answer.

        So coverage stays decided by the containing tile alone, exactly as
        before, and the seam search only changes *which* cell answers inside
        coverage. That makes the effect provably one-directional: the search
        starts from the containing tile's own candidate and replaces it only
        with something strictly nearer, so a cell can never come out further
        than it used to be.

        When it does look around, neighbours are visited in order of their
        floor distance (see `_neighbour_tiles`) and the loop stops as soon as
        the best cell held is nearer than the next tile could possibly offer.
        The usual case, a dense grid with a cell a few dozen metres away,
        opens exactly one tile.
        """
        threshold = self._cell_threshold_m(atlas)
        tile_lat, tile_lon = _tile_origin_of(lat, lon)
        df = _read_tile(str(_tile_path_at(atlas, tile_lat, tile_lon)))
        if df is None or df.height == 0:
            return None
        best: tuple[pl.DataFrame, int] | None = None
        best_d = threshold
        found = _nearest_cell_with_distance(df, lat, lon, required_col=required_col)
        if found is not None and found[1] <= best_d:
            best, best_d = (df, found[0]), found[1]
        if not neighbours:
            return best
        for n_lat, n_lon, floor_m in _neighbour_tiles(lat, lon):
            if floor_m >= best_d:
                # Sorted by floor distance, so nothing further can win either.
                break
            n_df = _read_tile(str(_tile_path_at(atlas, n_lat, n_lon)))
            if n_df is None or n_df.height == 0:
                continue
            found = _nearest_cell_with_distance(n_df, lat, lon, required_col=required_col)
            if found is not None and found[1] < best_d:
                best, best_d = (n_df, found[0]), found[1]
        return best

    def covers(self, lat: float, lon: float) -> AtlasMeta | None:
        """Return the finest atlas with actual data near (lat, lon), or None.

        Filters by bbox first, then verifies the nearest cell in the matching
        tile is within distance threshold. This catches false bbox matches
        (e.g. ATLNE bbox spuriously covering the Mediterranean).

        Reads the containing tile only, on purpose: see `_best_cell` for why
        the seam search must not reach the coverage decision.
        """
        candidates = [a for a in self.atlases if _bbox_contains(a.bbox, lat, lon)]
        if not candidates:
            return None
        candidates.sort(key=lambda a: (-a.rank, a.resolution_m))
        for atlas in candidates:
            # Use the unfiltered metric-nearest as the coverage signal; the
            # variable-specific lookup happens at predict time.
            if self._best_cell(atlas, lat, lon, required_col=None) is not None:
                return atlas
        return None

    def cell_at(self, lat: float, lon: float) -> CellPrediction | None:
        """Return the nearest cells (per-variable) across the best covering atlas.

        MARC's Arakawa C-grid stores XE / U / V on offset half-step grids.
        The metric-nearest XE cell may have an on-land U or V face (NaN);
        in that case we fall back to the nearest cell whose U / V is finite.
        Anchor lat/lon and z0 come from the height cell.

        Memoised per ``(atlas registry, lat, lon)``: one overlay request calls
        this three times for the same point (once directly, once through each
        of the height and current series), and the tidal router twice more.
        The key is the exact pair of floats the caller passed, never a rounded
        one, so the memo can only return what a recomputation would.
        """
        return _cell_at_cached(self, lat, lon)

    def _cell_at_uncached(self, lat: float, lon: float) -> CellPrediction | None:
        atlas = self.covers(lat, lon)
        if atlas is None:
            return None
        # Per-variable nearest cell with finite data. M2 is the canonical
        # proxy (always present in every MARC atlas). Each may land in a
        # different tile when the query sits near a boundary, so each carries
        # the frame it was found in.
        h_found = self._best_cell(atlas, lat, lon, required_col="M2_h_amp", neighbours=True)
        u_found = self._best_cell(atlas, lat, lon, required_col="M2_u_amp", neighbours=True)
        v_found = self._best_cell(atlas, lat, lon, required_col="M2_v_amp", neighbours=True)
        anchor = h_found if h_found is not None else (u_found or v_found)
        if anchor is None:
            return None
        anchor_df, anchor_idx = anchor
        cell_lat = float(anchor_df["lat"].to_numpy()[anchor_idx])
        cell_lon = float(anchor_df["lon"].to_numpy()[anchor_idx])
        z0_hydro = (
            anchor_df.get_column("z0_hydro_m").to_numpy()[anchor_idx]
            if "z0_hydro_m" in anchor_df.columns
            else None
        )
        return CellPrediction(
            atlas_name=atlas.name,
            lat=cell_lat,
            lon=cell_lon,
            z0_hydro_m=(
                float(z0_hydro) if z0_hydro is not None and np.isfinite(z0_hydro) else None
            ),
            h_constants=_extract_constants(h_found[0], h_found[1], "h") if h_found else {},
            u_constants=_extract_constants(u_found[0], u_found[1], "u") if u_found else {},
            v_constants=_extract_constants(v_found[0], v_found[1], "v") if v_found else {},
        )

    def predict_height(self, lat: float, lon: float, t: datetime) -> tuple[float, str] | None:
        """Tide height in metres above MSL at (lat, lon, t).

        Returns ``(h_m, atlas_name)`` or ``None`` outside any MARC coverage
        or when the cell has no height constants.
        """
        cell = self.cell_at(lat, lon)
        if cell is None or not cell.h_constants:
            return None
        h = float(schureman_predict([t], cell.h_constants)[0])
        return h, cell.atlas_name

    def predict_current(
        self, lat: float, lon: float, t: datetime
    ) -> tuple[float, float, str] | None:
        """Current at (lat, lon, t) as ``(speed_kn, direction_to_deg, atlas_name)``.

        ``direction_to_deg`` follows oceanographic convention (0° = setting
        toward the north). Returns ``None`` outside MARC coverage or when
        the cell has no U/V constants.
        """
        cell = self.cell_at(lat, lon)
        if cell is None or not cell.u_constants or not cell.v_constants:
            return None
        u_ms = float(schureman_predict([t], cell.u_constants)[0])
        v_ms = float(schureman_predict([t], cell.v_constants)[0])
        # MARS2D: u is zonal (east+), v is meridional (north+). Convert to
        # speed + nautical "to" direction (compass, 0° = north, 90° = east).
        speed_ms = float(np.hypot(u_ms, v_ms))
        speed_kn = speed_ms * _MS_TO_KN
        direction_to_deg = float((np.rad2deg(np.arctan2(u_ms, v_ms))) % 360.0)
        return speed_kn, direction_to_deg, cell.atlas_name

    def predict_height_series(
        self, lat: float, lon: float, times: list[datetime]
    ) -> tuple[np.ndarray, str] | None:
        """Vectorised tide height for many times (single cell)."""
        cell = self.cell_at(lat, lon)
        if cell is None or not cell.h_constants:
            return None
        return schureman_predict(times, cell.h_constants), cell.atlas_name

    def predict_current_series(
        self, lat: float, lon: float, times: list[datetime]
    ) -> tuple[np.ndarray, np.ndarray, str] | None:
        """Vectorised current for many times: (speeds_kn, dirs_to_deg, atlas_name)."""
        cell = self.cell_at(lat, lon)
        if cell is None or not cell.u_constants or not cell.v_constants:
            return None
        u_ms = schureman_predict(times, cell.u_constants)
        v_ms = schureman_predict(times, cell.v_constants)
        speeds_kn = np.hypot(u_ms, v_ms) * _MS_TO_KN
        dirs_to_deg = (np.rad2deg(np.arctan2(u_ms, v_ms))) % 360.0
        return speeds_kn, dirs_to_deg, cell.atlas_name


@lru_cache(maxsize=512)
def _cell_at_cached(registry: MarcAtlasRegistry, lat: float, lon: float) -> CellPrediction | None:
    """Process-wide memo behind :meth:`MarcAtlasRegistry.cell_at`.

    Module-level rather than per-instance because the registry is a frozen
    dataclass and because the same atlas directory is opened by both shells:
    keying on the registry itself lets the two share one answer. Bounded at
    512 points, roughly twenty corridors' worth, and never keyed on anything
    the caller did not pass verbatim.
    """
    return registry._cell_at_uncached(lat, lon)
