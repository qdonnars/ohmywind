#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars
# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "numpy>=1.26",
#   "polars>=1.0",
#   "pyarrow>=16",
#   "shapely>=2.0",
#   "rasterio>=1.3",
#   "openwind-data",
# ]
#
# [tool.uv.sources]
# openwind-data = { path = "../packages/data-adapters", editable = true }
# ///
"""Where tidal currents matter: a mask computed from a harmonic atlas.

Walks the tiles of one atlas in the standard layout (default: MARC ATLNE,
2 km, north-east Atlantic), reconstructs the tidal current at every cell
over one spring/neap cycle (15 days, hourly, all constituents the cell
carries), keeps the maximum speed, rasterises it on a regular grid and
contours it at the thresholds a sailor cares about (0.5 kt: worth checking,
1.5 kt: plan around it). Output: ``docs/tidal-world/map/mask_<atlas>.geojson``
with one MultiPolygon feature per threshold, simplified so the file stays
small enough to version.

The mask is a *derivative* of the atlas at 2 km, so it says nothing about a
pass narrower than that; that is what the gazetteer layer is for. It is not
a navigation product.

Usage::

    uv run scripts/build_tidal_world_mask.py --atlas-dir build/marc/ATLNE \\
        --out docs/tidal-world/map/mask_atlne.geojson
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np
import polars as pl
from openwind_data.currents.harmonic import _canonical
from openwind_data.currents.harmonic_analysis import design_matrix
from shapely.geometry import MultiPolygon, mapping
from shapely.ops import unary_union

MS_TO_KN = 1.0 / 0.514444
# The bands of the map's green gradient: 0.5 kt is "worth a look", 1.5 kt
# "plan around it", 5 kt and above the great races. Nested features, one per
# threshold; the map builder turns them into disjoint bands.
THRESHOLDS_KN = (0.5, 1.0, 1.5, 2.0, 3.0, 5.0)


def _cell_columns(df: pl.DataFrame, comp: str) -> list[str]:
    names = []
    for c in df.columns:
        if c.endswith(f"_{comp}_amp"):
            name = c[: -len(f"_{comp}_amp")]
            if _canonical(name) is not None and f"{name}_{comp}_g" in df.columns:
                names.append(name)
    return names


def max_speed_of_tile(
    df: pl.DataFrame, x_by_names: dict, times: list[datetime]
) -> np.ndarray:
    """Max reconstructed speed (m/s) per row of a tile over ``times``."""
    names_u, names_v = _cell_columns(df, "u"), _cell_columns(df, "v")
    if not names_u or not names_v:
        return np.full(df.height, np.nan)
    out = {}
    for comp, names in (("u", names_u), ("v", names_v)):
        key = tuple(names)
        if key not in x_by_names:
            x_by_names[key] = design_matrix(times, list(key))[0][
                :, 1:
            ]  # drop Z0 column
        x = x_by_names[key]
        amp = np.column_stack([df[f"{n}_{comp}_amp"].to_numpy() for n in names]).astype(
            float
        )
        g = np.deg2rad(
            np.column_stack([df[f"{n}_{comp}_g"].to_numpy() for n in names]).astype(
                float
            )
        )
        amp = np.nan_to_num(amp)
        g = np.nan_to_num(g)
        coef = np.empty((2 * len(names), df.height))
        coef[0::2] = (amp * np.cos(g)).T
        coef[1::2] = (amp * np.sin(g)).T
        out[comp] = x @ coef  # (n_times, n_cells)
    return np.hypot(out["u"], out["v"]).max(axis=0)


def _shift_max(a: np.ndarray, reducer) -> np.ndarray:
    """3x3 neighbourhood reduce (max or min) with edge replication."""
    padded = np.pad(a, 1, mode="edge")
    stack = [
        padded[1 + dy : padded.shape[0] - 1 + dy, 1 + dx : padded.shape[1] - 1 + dx]
        for dy in (-1, 0, 1)
        for dx in (-1, 0, 1)
    ]
    return reducer(np.stack(stack), axis=0)


def _closing(a: np.ndarray) -> np.ndarray:
    return _shift_max(_shift_max(a, np.max), np.min)


def _auto_grid_deg(resolution_m: float | None) -> float:
    """Raster pitch of about one and a half atlas cells, never finer than 100 m."""
    res = float(resolution_m or 2000.0)
    return max(0.001, round(res * 1.5 / 111_000.0, 4))


def mask_of_atlas(
    atlas_dir: Path,
    *,
    grid_deg: float | None,
    days: int,
    min_area_deg2: float | None,
    simplify_deg: float | None,
    extent: bool = True,
) -> tuple[dict, dict[float, MultiPolygon]]:
    """``(metadata, {threshold_kt: MultiPolygon})`` for one atlas.

    With ``extent``, the dictionary also carries the key ``0.0``: the area
    where the atlas has cells at all, at the raster pitch. The map builder
    layers the masks with it, so a coarser atlas only speaks where a finer
    one has no cell, not merely no tile: MANGA holds a few cells in the
    0.5 degree tile of the Bristol Channel and once silenced the Copernicus
    mask over the whole tile.

    The raster pitch, the speckle floor and the simplification default to
    the atlas resolution, so a 250 m atlas draws the goulet de Brest and a
    7 km one draws the world without a quarter of a billion pixels. The
    result is clipped to the atlas ``validity_bbox`` when it declares one:
    a mask from ATLNE in the North Sea would show tide where the atlas is
    not trusted.
    """
    from rasterio import features
    from rasterio.transform import from_origin
    from shapely.geometry import box, shape

    meta = json.loads((atlas_dir / "metadata.json").read_text())
    g = grid_deg or _auto_grid_deg(meta.get("resolution_m"))
    min_area = min_area_deg2 if min_area_deg2 is not None else 7 * g * g
    simplify = simplify_deg if simplify_deg is not None else g / 2
    t0 = time.perf_counter()
    start = datetime(2026, 3, 1, tzinfo=UTC)  # any start: a spring/neap cycle follows
    times = [start + timedelta(hours=h) for h in range(24 * days)]
    x_cache: dict = {}
    lats, lons, speeds = [], [], []
    tiles = sorted(atlas_dir.glob("tile_lat=*/tile_lon=*/data.parquet"))
    for i, tile in enumerate(tiles):
        df = pl.read_parquet(tile)
        if df.height == 0:
            continue
        lats.append(df["lat"].to_numpy())
        lons.append(df["lon"].to_numpy())
        speeds.append(max_speed_of_tile(df, x_cache, times))
        if i % 200 == 0 and i:
            print(
                f"  {i}/{len(tiles)} tiles, {time.perf_counter() - t0:.0f} s",
                file=sys.stderr,
            )
    if not lats:
        return meta, {thr: MultiPolygon([]) for thr in THRESHOLDS_KN}
    lat = np.concatenate(lats)
    lon = np.concatenate(lons)
    kn = np.concatenate(speeds) * MS_TO_KN
    print(
        f"[{meta.get('atlas')}] {lat.size} cells at {g} deg; max {np.nanmax(kn):.2f} kt; "
        f"p50 {np.nanmedian(kn):.2f} kt",
        file=sys.stderr,
    )
    # Rasterise on a regular grid (max per pixel), then contour.
    lat_edges = np.arange(np.floor(lat.min()), np.ceil(lat.max()) + g, g)
    lon_edges = np.arange(np.floor(lon.min()), np.ceil(lon.max()) + g, g)
    iy = np.clip(((lat - lat_edges[0]) / g).astype(int), 0, lat_edges.size - 2)
    ix = np.clip(((lon - lon_edges[0]) / g).astype(int), 0, lon_edges.size - 2)
    raster = np.full((lat_edges.size - 1, lon_edges.size - 1), np.nan)
    flat = iy * raster.shape[1] + ix
    order = np.argsort(kn)
    raster.ravel()[flat[order]] = kn[order]  # last write wins: the max
    filled = np.where(np.isfinite(raster), raster, 0.0)
    # A pixel with no cell (the atlas pitch in longitude exceeds the raster
    # pitch at high latitude, or a land-locked gap) would cut the mask into
    # stripes: close one-pixel holes with a 3x3 dilation followed by a 3x3
    # erosion before contouring.
    filled = _closing(filled)
    north_up = filled[::-1]  # row 0 is the southernmost row; rasterio expects north-up
    transform = from_origin(lon_edges[0], lat_edges[-1], g, g)
    clip = None
    vb = meta.get("validity_bbox")
    if vb:
        clip = box(vb[1], vb[0], vb[3], vb[2])
    out: dict[float, MultiPolygon] = {}
    has_cell = _closing(np.where(np.isfinite(raster), 1.0, 0.0))[::-1]
    for thr in (0.0, *THRESHOLDS_KN) if extent else THRESHOLDS_KN:
        above = (
            (has_cell if thr == 0.0 else north_up) >= (1.0 if thr == 0.0 else thr)
        ).astype(np.uint8)
        polys = [
            shape(geom)
            for geom, value in features.shapes(
                above, mask=above.astype(bool), transform=transform
            )
            if value == 1
        ]
        polys = [p for p in polys if p.area >= min_area]
        merged = unary_union(polys).simplify(simplify, preserve_topology=True)
        if clip is not None:
            merged = merged.intersection(clip)
        if merged.is_empty:
            merged = MultiPolygon([])
        elif merged.geom_type == "Polygon":
            merged = MultiPolygon([merged])
        elif merged.geom_type == "GeometryCollection":
            merged = MultiPolygon([p for p in merged.geoms if p.geom_type == "Polygon"])
        out[thr] = merged
        print(
            f"  {thr} kt: {len(merged.geoms)} polygons, area {merged.area:.2f} deg^2",
            file=sys.stderr,
        )
    return meta, out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--atlas-dir",
        type=Path,
        nargs="+",
        default=[Path("build/marc/ATLNE")],
        help="one or more atlases; their masks are merged per threshold",
    )
    parser.add_argument(
        "--out", type=Path, default=Path("docs/tidal-world/map/mask_atlne.geojson")
    )
    parser.add_argument(
        "--name", default=None, help="mask name (default: from the first atlas)"
    )
    parser.add_argument(
        "--grid-deg",
        type=float,
        default=None,
        help="raster pitch (default: 1.5 atlas cells)",
    )
    parser.add_argument("--simplify-deg", type=float, default=None)
    parser.add_argument("--days", type=int, default=15)
    parser.add_argument(
        "--no-extent",
        action="store_true",
        help="skip the threshold 0 feature (where the atlas has cells), useless for the coarsest atlas",
    )
    parser.add_argument(
        "--min-area-deg2",
        type=float,
        default=None,
        help="drop speckles smaller than this (default: about 7 pixels)",
    )
    args = parser.parse_args(argv)

    t0 = time.perf_counter()
    metas = []
    thresholds = THRESHOLDS_KN if args.no_extent else (0.0, *THRESHOLDS_KN)
    per_thr: dict[float, list] = {thr: [] for thr in thresholds}
    for atlas_dir in args.atlas_dir:
        meta, masks = mask_of_atlas(
            atlas_dir,
            grid_deg=args.grid_deg,
            days=args.days,
            min_area_deg2=args.min_area_deg2,
            simplify_deg=args.simplify_deg,
            extent=not args.no_extent,
        )
        metas.append(meta)
        for thr, geom in masks.items():
            if not geom.is_empty:
                per_thr[thr].append(geom)
    features_out = []
    for thr in thresholds:
        merged = unary_union(per_thr[thr]) if per_thr[thr] else MultiPolygon([])
        if merged.geom_type == "Polygon":
            merged = MultiPolygon([merged])
        features_out.append(
            {
                "type": "Feature",
                "properties": {
                    "threshold_kt": thr,
                    "kind": "extent" if thr == 0.0 else "mask",
                    "atlas": ", ".join(str(m.get("atlas")) for m in metas),
                    "resolution_m": min(
                        int(m.get("resolution_m") or 10**9) for m in metas
                    ),
                    "method": f"max speed over {args.days} days hourly, all constituents",
                    "area_deg2": round(merged.area, 2),
                },
                "geometry": mapping(merged),
            }
        )
    sources = []
    for m in metas:
        src = m.get("source")
        sources.append(
            str(
                src.get("name")
                if isinstance(src, dict)
                else src or m.get("label") or m["atlas"]
            )
        )
    name = args.name or str(metas[0].get("atlas", "atlas")).lower()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "type": "FeatureCollection",
        "name": f"tidal_current_mask_{name}",
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "source": "; ".join(sources)
        + ", harmonic atlases in the standard format (docs/harmonic_atlas_format.md)",
        "features": features_out,
    }
    args.out.write_text(json.dumps(payload, separators=(",", ":")))
    print(
        f"wrote {args.out} ({args.out.stat().st_size / 1e3:.0f} kB) in {time.perf_counter() - t0:.0f} s",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
