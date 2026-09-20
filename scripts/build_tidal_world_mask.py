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
THRESHOLDS_KN = (0.5, 1.5)


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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--atlas-dir", type=Path, default=Path("build/marc/ATLNE"))
    parser.add_argument(
        "--out", type=Path, default=Path("docs/tidal-world/map/mask_atlne.geojson")
    )
    parser.add_argument(
        "--grid-deg", type=float, default=0.02, help="raster pitch for contouring"
    )
    parser.add_argument("--simplify-deg", type=float, default=0.01)
    parser.add_argument("--days", type=int, default=15)
    parser.add_argument(
        "--min-area-deg2",
        type=float,
        default=0.003,
        help="drop speckles smaller than this (0.003 deg^2 is about 7 pixels at 0.02 deg)",
    )
    args = parser.parse_args(argv)

    meta = json.loads((args.atlas_dir / "metadata.json").read_text())
    src = meta.get("source")
    source_label = (
        f"{src.get('name') if isinstance(src, dict) else src or meta.get('label') or meta['atlas']}"
        ", harmonic atlas in the standard format (docs/harmonic_atlas_format.md)"
    )
    t0 = time.perf_counter()
    start = datetime(
        2026, 3, 1, tzinfo=UTC
    )  # any start: a full spring/neap cycle follows
    times = [start + timedelta(hours=h) for h in range(24 * args.days)]
    x_cache: dict = {}
    lats, lons, speeds = [], [], []
    tiles = sorted(args.atlas_dir.glob("tile_lat=*/tile_lon=*/data.parquet"))
    for i, tile in enumerate(tiles):
        df = pl.read_parquet(tile)
        if df.height == 0:
            continue
        s = max_speed_of_tile(df, x_cache, times)
        lats.append(df["lat"].to_numpy())
        lons.append(df["lon"].to_numpy())
        speeds.append(s)
        if i % 200 == 0:
            print(
                f"  {i}/{len(tiles)} tiles, {time.perf_counter() - t0:.0f} s",
                file=sys.stderr,
            )
    lat = np.concatenate(lats)
    lon = np.concatenate(lons)
    kn = np.concatenate(speeds) * MS_TO_KN
    print(
        f"{lat.size} cells; max {np.nanmax(kn):.2f} kt; p50 {np.nanmedian(kn):.2f} kt",
        file=sys.stderr,
    )

    # Rasterise on a regular grid (max per pixel), then contour.
    g = args.grid_deg
    lat_edges = np.arange(np.floor(lat.min()), np.ceil(lat.max()) + g, g)
    lon_edges = np.arange(np.floor(lon.min()), np.ceil(lon.max()) + g, g)
    iy = np.clip(((lat - lat_edges[0]) / g).astype(int), 0, lat_edges.size - 2)
    ix = np.clip(((lon - lon_edges[0]) / g).astype(int), 0, lon_edges.size - 2)
    raster = np.full((lat_edges.size - 1, lon_edges.size - 1), np.nan)
    flat = iy * raster.shape[1] + ix
    order = np.argsort(kn)
    raster.ravel()[flat[order]] = kn[order]  # last write wins: the max
    filled = np.where(np.isfinite(raster), raster, 0.0)

    from rasterio import features
    from rasterio.transform import from_origin
    from shapely.geometry import shape

    # A pixel with no cell (the atlas pitch in longitude exceeds the raster
    # pitch at high latitude, or a land-locked gap) would cut the mask into
    # stripes: close one-pixel holes with a 3x3 dilation followed by a 3x3
    # erosion before contouring.
    filled = _closing(filled)
    # Row 0 of ``filled`` is the southernmost row; rasterio expects north-up.
    north_up = filled[::-1]
    transform = from_origin(lon_edges[0], lat_edges[-1], g, g)
    features_out = []
    for thr in THRESHOLDS_KN:
        above = (north_up >= thr).astype(np.uint8)
        polys = [
            shape(geom)
            for geom, value in features.shapes(
                above, mask=above.astype(bool), transform=transform
            )
            if value == 1
        ]
        polys = [p for p in polys if p.area >= args.min_area_deg2]
        merged = unary_union(polys).simplify(args.simplify_deg, preserve_topology=True)
        if merged.is_empty:
            merged = MultiPolygon([])
        elif merged.geom_type == "Polygon":
            merged = MultiPolygon([merged])
        features_out.append(
            {
                "type": "Feature",
                "properties": {
                    "threshold_kt": thr,
                    "atlas": meta.get("atlas"),
                    "resolution_m": meta.get("resolution_m"),
                    "method": f"max speed over {args.days} days hourly, all constituents",
                    "area_deg2": round(merged.area, 2),
                },
                "geometry": mapping(merged),
            }
        )
        print(
            f"  {thr} kt: {len(merged.geoms)} polygons, area {merged.area:.1f} deg^2",
            file=sys.stderr,
        )
    features = features_out
    args.out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "type": "FeatureCollection",
        "name": f"tidal_current_mask_{meta.get('atlas', 'atlas').lower()}",
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "source": source_label,
        "features": features,
    }
    args.out.write_text(json.dumps(payload, separators=(",", ":")))
    print(
        f"wrote {args.out} ({args.out.stat().st_size / 1e3:.0f} kB) in {time.perf_counter() - t0:.0f} s",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
