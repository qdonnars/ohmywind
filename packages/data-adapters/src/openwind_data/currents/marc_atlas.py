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


def _tile_path(atlas: AtlasMeta, lat: float, lon: float) -> Path:
    tile_lat = np.floor(lat / _TILE_SIZE_DEG) * _TILE_SIZE_DEG
    tile_lon = np.floor(lon / _TILE_SIZE_DEG) * _TILE_SIZE_DEG
    return (
        atlas.parquet_dir / f"tile_lat={tile_lat:.1f}" / f"tile_lon={tile_lon:.1f}" / "data.parquet"
    )


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


def _nearest_cell_in_tile(
    df: pl.DataFrame, lat: float, lon: float, required_col: str | None = None
) -> int | None:
    """Return index of metric-nearest cell, or None if no valid cell qualifies.

    Uses local-tangent-plane distance: degrees-lon are scaled by cos(lat) so
    we don't bias toward longitudinal neighbours at high latitude. When
    ``required_col`` is given, only cells with a finite value in that column
    are considered — this matters for currents because MARC's Arakawa C-grid
    offsets U and V by half a step from XE, so the metric-nearest XE cell can
    have an on-land U face (NaN) even when XE itself is valid sea. ~50 cells
    in FINIS exhibit this; routing through a slightly further cell with
    finite U/V is a sub-resolution shift, well within harmonic precision.
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
    return int(np.argmin(d2))


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

    def _cell_with_finite(
        self,
        atlas: AtlasMeta,
        df: pl.DataFrame,
        lat: float,
        lon: float,
        required_col: str | None = None,
    ) -> int | None:
        """Return idx of the nearest cell within distance threshold whose
        ``required_col`` is finite (when given). Returns None if the closest
        valid cell is beyond max(5 km, 5x atlas resolution) of the query.
        """
        idx = _nearest_cell_in_tile(df, lat, lon, required_col=required_col)
        if idx is None:
            return None
        cell_lat = float(df["lat"].to_numpy()[idx])
        cell_lon = float(df["lon"].to_numpy()[idx])
        dlat_m = (cell_lat - lat) * 111_000
        dlon_m = (cell_lon - lon) * 111_000 * np.cos(np.deg2rad(lat))
        d_m = np.hypot(dlat_m, dlon_m)
        threshold = max(self._MAX_CELL_DISTANCE_M, 5.0 * atlas.resolution_m)
        return idx if d_m <= threshold else None

    def covers(self, lat: float, lon: float) -> AtlasMeta | None:
        """Return the finest atlas with actual data near (lat, lon), or None.

        Filters by bbox first, then verifies the nearest cell in the matching
        tile is within distance threshold. This catches false bbox matches
        (e.g. ATLNE bbox spuriously covering the Mediterranean).
        """
        candidates = [a for a in self.atlases if _bbox_contains(a.bbox, lat, lon)]
        if not candidates:
            return None
        candidates.sort(key=lambda a: (-a.rank, a.resolution_m))
        for atlas in candidates:
            df = _read_tile(str(_tile_path(atlas, lat, lon)))
            if df is None or df.height == 0:
                continue
            # Use the unfiltered metric-nearest as the coverage signal; the
            # variable-specific lookup happens at predict time.
            if self._cell_with_finite(atlas, df, lat, lon, required_col=None) is not None:
                return atlas
        return None

    def cell_at(self, lat: float, lon: float) -> CellPrediction | None:
        """Return the nearest cells (per-variable) across the best covering atlas.

        MARC's Arakawa C-grid stores XE / U / V on offset half-step grids.
        The metric-nearest XE cell may have an on-land U or V face (NaN);
        in that case we fall back to the nearest cell whose U / V is finite.
        Anchor lat/lon and z0 come from the height cell.
        """
        atlas = self.covers(lat, lon)
        if atlas is None:
            return None
        df = _read_tile(str(_tile_path(atlas, lat, lon)))
        if df is None or df.height == 0:
            return None
        # Per-variable nearest cell with finite data. M2 is the canonical
        # proxy (always present in every MARC atlas).
        h_idx = self._cell_with_finite(atlas, df, lat, lon, required_col="M2_h_amp")
        u_idx = self._cell_with_finite(atlas, df, lat, lon, required_col="M2_u_amp")
        v_idx = self._cell_with_finite(atlas, df, lat, lon, required_col="M2_v_amp")
        anchor = h_idx if h_idx is not None else (u_idx if u_idx is not None else v_idx)
        if anchor is None:
            return None
        cell_lat = float(df["lat"].to_numpy()[anchor])
        cell_lon = float(df["lon"].to_numpy()[anchor])
        z0_hydro = (
            df.get_column("z0_hydro_m").to_numpy()[anchor] if "z0_hydro_m" in df.columns else None
        )
        return CellPrediction(
            atlas_name=atlas.name,
            lat=cell_lat,
            lon=cell_lon,
            z0_hydro_m=(
                float(z0_hydro) if z0_hydro is not None and np.isfinite(z0_hydro) else None
            ),
            h_constants=_extract_constants(df, h_idx, "h") if h_idx is not None else {},
            u_constants=_extract_constants(df, u_idx, "u") if u_idx is not None else {},
            v_constants=_extract_constants(df, v_idx, "v") if v_idx is not None else {},
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
