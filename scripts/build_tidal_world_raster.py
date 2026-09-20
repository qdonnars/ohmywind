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
#   "pillow>=10",
#   "openwind-data",
# ]
#
# [tool.uv.sources]
# openwind-data = { path = "../packages/data-adapters", editable = true }
# ///
"""The maximum tidal current of every served atlas cell, as an image per atlas.

The methodology map used to draw the covered water as polygons cut at a few
thresholds and simplified; at the scale of a pass the bands turned into
facets and the simplification into steps. The data is a grid with one
maximum per cell, so it ships as a grid: one 8-bit PNG per atlas at its
native pitch, rows resampled to Web Mercator so Leaflet can stretch it
between two corners without distortion, pixel value ``1 + round(kt * 40)``
(0 is no cell, 255 caps at 6.35 kt), and a manifest ``rasters.json`` with
the bounds. The page colours the pixels itself and reads the value under
a click.

Rules, the same as the masks: the maximum is reconstructed hourly over one
spring/neap cycle from all the constituents of the cell; land pixels are
removed with the Natural Earth 10 m ocean polygon (the regridded MARC
atlases carry extrapolated values over land); where a finer atlas has a
cell, the coarser atlas is blanked, so the finest atlas wins everywhere.

Usage::

    uv run scripts/build_tidal_world_raster.py --atlas-dir build/marc/FINIS build/marc/MANGA ... \\
        --ocean build/natural_earth/ne_10m_ocean.geojson \\
        --out-dir packages/web/public/methodologie/tidal/raster
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np
import polars as pl

MS_TO_KN = 1.0 / 0.514444
SCALE = 40  # pixel = 1 + round(kt * SCALE); 255 caps at 6.35 kt
HERE = Path(__file__).resolve().parent


def _mask_module():
    """``max_speed_of_tile`` and friends from the mask builder, one source of truth."""
    spec = importlib.util.spec_from_file_location(
        "tidal_mask", HERE / "build_tidal_world_mask.py"
    )
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _pitch(values: np.ndarray) -> float:
    u = np.unique(values)
    d = np.diff(u)
    return float(np.median(d[d > 1e-6]))


def atlas_grid(
    atlas_dir: Path, days: int, mask_mod
) -> tuple[dict, np.ndarray, np.ndarray, np.ndarray]:
    """``(metadata, lats, lons, kt[nlat, nlon])`` on the atlas's own regular grid, NaN where no cell."""
    meta = json.loads((atlas_dir / "metadata.json").read_text())
    start = datetime(2026, 3, 1, tzinfo=UTC)
    times = [start + timedelta(hours=h) for h in range(24 * days)]
    x_cache: dict = {}
    lats, lons, speeds = [], [], []
    for tile in sorted(atlas_dir.glob("tile_lat=*/tile_lon=*/data.parquet")):
        df = pl.read_parquet(tile)
        if df.height == 0:
            continue
        lats.append(df["lat"].to_numpy())
        lons.append(df["lon"].to_numpy())
        speeds.append(mask_mod.max_speed_of_tile(df, x_cache, times))
    lat = np.concatenate(lats)
    lon = np.concatenate(lons)
    kt = np.concatenate(speeds) * MS_TO_KN
    grid = meta.get("grid") or {}
    dlat = float(grid.get("dlat_deg") or _pitch(lat))
    dlon = float(grid.get("dlon_deg") or _pitch(lon))
    lat0, lon0 = float(lat.min()), float(lon.min())
    iy = np.rint((lat - lat0) / dlat).astype(int)
    ix = np.rint((lon - lon0) / dlon).astype(int)
    arr = np.full((iy.max() + 1, ix.max() + 1), np.nan)
    arr[iy, ix] = kt
    rows = lat0 + dlat * np.arange(arr.shape[0])
    cols = lon0 + dlon * np.arange(arr.shape[1])
    return meta, rows, cols, arr


def fill_pinholes(arr: np.ndarray) -> np.ndarray:
    """A NaN pixel with at least five valid neighbours takes their mean: the
    regridded MARC lattices miss a cell here and there, which would show as
    a hole in the colour."""
    out = arr.copy()
    padded = np.pad(arr, 1, constant_values=np.nan)
    neigh = np.stack(
        [
            padded[1 + dy : padded.shape[0] - 1 + dy, 1 + dx : padded.shape[1] - 1 + dx]
            for dy in (-1, 0, 1)
            for dx in (-1, 0, 1)
            if (dy, dx) != (0, 0)
        ]
    )
    count = np.isfinite(neigh).sum(axis=0)
    mean = np.nanmean(np.where(np.isfinite(neigh), neigh, np.nan), axis=0)
    fill = np.isnan(arr) & (count >= 5)
    out[fill] = mean[fill]
    return out


def ocean_mask(rows: np.ndarray, cols: np.ndarray, ocean) -> np.ndarray:
    """True where the pixel centre is at sea."""
    from rasterio import features
    from rasterio.transform import from_origin

    dlat = float(rows[1] - rows[0]) if rows.size > 1 else 0.01
    dlon = float(cols[1] - cols[0]) if cols.size > 1 else 0.01
    # north-up transform over the pixel edges
    transform = from_origin(cols[0] - dlon / 2, rows[-1] + dlat / 2, dlon, dlat)
    burned = features.rasterize(
        [(ocean, 1)],
        out_shape=(rows.size, cols.size),
        transform=transform,
        fill=0,
        dtype="uint8",
    )
    return burned[::-1].astype(bool)  # back to south-up


def blank_under_finer(
    rows: np.ndarray,
    cols: np.ndarray,
    arr: np.ndarray,
    finer: list[tuple[np.ndarray, np.ndarray, np.ndarray]],
) -> np.ndarray:
    """NaN where any finer atlas has a cell at this pixel's centre."""
    out = arr.copy()
    lat_c, lon_c = np.meshgrid(rows, cols, indexing="ij")
    for f_rows, f_cols, f_arr in finer:
        dlat = float(f_rows[1] - f_rows[0])
        dlon = float(f_cols[1] - f_cols[0])
        iy = np.rint((lat_c - f_rows[0]) / dlat).astype(int)
        ix = np.rint((lon_c - f_cols[0]) / dlon).astype(int)
        inside = (iy >= 0) & (iy < f_arr.shape[0]) & (ix >= 0) & (ix < f_arr.shape[1])
        hit = np.zeros_like(inside)
        hit[inside] = np.isfinite(f_arr[iy[inside], ix[inside]])
        out[hit] = np.nan
    return out


def to_mercator_rows(
    rows: np.ndarray, arr: np.ndarray
) -> tuple[np.ndarray, float, float]:
    """Resample the latitude axis to equal steps of Web Mercator y.

    Leaflet stretches an image overlay linearly between its projected
    corners, so a lat/lon-regular image is off by 1/cos(lat) across its
    height: 25 % between 40 and 53 degrees north. Rows are re-sampled by
    nearest neighbour at a pitch equal to the native one at mid-latitude.
    """
    dlat = float(rows[1] - rows[0])
    south = float(rows[0] - dlat / 2)
    north = float(rows[-1] + dlat / 2)

    def merc(lat_deg: float) -> float:
        return float(np.log(np.tan(np.pi / 4 + np.deg2rad(lat_deg) / 2)))

    y0, y1 = merc(south), merc(north)
    mid = np.deg2rad((south + north) / 2)
    dy = np.deg2rad(dlat) / np.cos(mid)
    n = max(1, int(round((y1 - y0) / dy)))
    ys = y0 + (np.arange(n) + 0.5) * (y1 - y0) / n
    lats = np.rad2deg(2 * np.arctan(np.exp(ys)) - np.pi / 2)
    src = np.clip(np.rint((lats - rows[0]) / dlat).astype(int), 0, rows.size - 1)
    return arr[src], south, north


def encode(arr: np.ndarray) -> np.ndarray:
    px = np.zeros(arr.shape, dtype=np.uint8)
    ok = np.isfinite(arr)
    px[ok] = np.clip(1 + np.rint(arr[ok] * SCALE), 1, 255).astype(np.uint8)
    return px[::-1]  # PNG rows run north to south


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--atlas-dir", type=Path, nargs="+", required=True)
    parser.add_argument(
        "--ocean", type=Path, default=Path("build/natural_earth/ne_10m_ocean.geojson")
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("packages/web/public/methodologie/tidal/raster"),
    )
    parser.add_argument("--days", type=int, default=15)
    args = parser.parse_args(argv)

    from PIL import Image
    from shapely.geometry import shape
    from shapely.ops import unary_union

    mask_mod = _mask_module()
    t0 = time.perf_counter()
    ocean = None
    if args.ocean.exists():
        fc = json.loads(args.ocean.read_text())
        ocean = unary_union([shape(f["geometry"]) for f in fc["features"]])
    else:
        print(
            f"WARNING: no ocean polygon at {args.ocean}, land not removed",
            file=sys.stderr,
        )

    grids = []
    for atlas_dir in args.atlas_dir:
        meta, rows, cols, arr = atlas_grid(atlas_dir, args.days, mask_mod)
        arr = fill_pinholes(arr)
        if ocean is not None:
            arr = np.where(ocean_mask(rows, cols, ocean), arr, np.nan)
        grids.append((meta, rows, cols, arr))
        print(
            f"[{meta['atlas']}] {arr.shape[1]}x{arr.shape[0]} px, {int(np.isfinite(arr).sum())} cells, "
            f"max {np.nanmax(arr):.1f} kt ({time.perf_counter() - t0:.0f} s)",
            file=sys.stderr,
        )
    grids.sort(key=lambda g: int(g[0]["resolution_m"]))  # finest first
    args.out_dir.mkdir(parents=True, exist_ok=True)
    for old in args.out_dir.glob("*.png"):
        old.unlink()
    manifest = []
    for i, (meta, rows, cols, arr) in enumerate(grids):
        finer = [(r, c, a) for _m, r, c, a in grids[:i]]
        arr = blank_under_finer(rows, cols, arr, finer) if finer else arr
        img, south, north = to_mercator_rows(rows, arr)
        dlon = float(cols[1] - cols[0])
        name = meta["atlas"].lower()
        Image.fromarray(encode(img), mode="L").save(
            args.out_dir / f"{name}.png", optimize=True
        )
        manifest.append(
            {
                "atlas": meta["atlas"],
                "label": meta.get("label") or meta["atlas"],
                "resolution_m": int(meta["resolution_m"]),
                "file": f"raster/{name}.png",
                "bounds": [
                    [south, float(cols[0] - dlon / 2)],
                    [north, float(cols[-1] + dlon / 2)],
                ],
                "scale": SCALE,
                "cells": int(np.isfinite(arr).sum()),
            }
        )
    manifest.sort(
        key=lambda m: -m["resolution_m"]
    )  # draw order: coarse first, fine on top
    (args.out_dir / "rasters.json").write_text(
        json.dumps(
            {
                "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
                "scale": SCALE,
                "method": f"max speed over {args.days} days hourly, all constituents, native pitch, Mercator rows",
                "rasters": manifest,
            },
            ensure_ascii=False,
        )
    )
    total = sum(p.stat().st_size for p in args.out_dir.glob("*.png"))
    print(
        f"{len(manifest)} rasters, {total / 1e3:.0f} kB of PNG in {time.perf_counter() - t0:.0f} s",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
