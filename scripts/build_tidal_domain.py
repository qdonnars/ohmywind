#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars
# /// script
# requires-python = ">=3.12"
# dependencies = ["xarray>=2024.1", "netCDF4>=1.6", "numpy>=1.26", "rasterio>=1.3", "shapely>=2.0"]
# ///
"""The wet domain of an ocean model, as a polygon, from one of its raw files.

The atlas builders keep only the cells whose reconstructed tidal current
reaches 0.2 kt: everywhere else the model was computed, found no tide worth
planning around, and the cell was dropped. The map needs that area. Without
it, the Baltic, the Kattegat and the open Mediterranean read as holes in the
data, when they are water a model covers and finds without tide.

The domain is read from the land-sea mask of a single time step of one raw
file, the file the atlas was built from: no download. ``build_tidal_world_map``
subtracts the served atlases' own cells from it to draw the "covered, tide
not significant" colour.

Usage::

    uv run scripts/build_tidal_domain.py --file build/cmems/med_2025-09.nc \\
        --atlas CMEMS_MED --out docs/tidal-world/map/domain_cmems_med.geojson
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import xarray as xr

_U_NAMES = ("uo", "u_eastward", "vxo")


def wet_points(path: Path) -> tuple[np.ndarray, np.ndarray]:
    """``(lat, lon)`` of every cell with a value at the first instant."""
    with xr.open_dataset(path) as ds:
        name = next(n for n in _U_NAMES if n in ds.data_vars)
        u = ds[name].isel(time=0)
        if "depth" in u.dims:
            u = u.isel(depth=0)
        wet = np.isfinite(u.values)
        if "latitude" in ds.coords and ds["latitude"].ndim == 1:
            lat2, lon2 = np.meshgrid(
                ds["latitude"].values, ds["longitude"].values, indexing="ij"
            )
        else:
            lat2, lon2 = ds["lat"].values, ds["lon"].values
    return lat2[wet].astype(float), lon2[wet].astype(float)


def domain_polygon(lat: np.ndarray, lon: np.ndarray, grid_deg: float):
    """Union of the raster pixels holding a wet cell, one-pixel holes closed."""
    from rasterio import features
    from rasterio.transform import from_origin
    from shapely.geometry import shape
    from shapely.ops import unary_union

    lat0, lon0 = np.floor(lat.min()) - grid_deg, np.floor(lon.min()) - grid_deg
    ny = int(np.ceil((lat.max() - lat0) / grid_deg)) + 2
    nx = int(np.ceil((lon.max() - lon0) / grid_deg)) + 2
    raster = np.zeros((ny, nx), dtype=np.uint8)
    iy = ((lat - lat0) / grid_deg).astype(int)
    ix = ((lon - lon0) / grid_deg).astype(int)
    raster[iy, ix] = 1
    # 3x3 closing: a curvilinear grid leaves one-pixel gaps between its rows.
    pad = np.pad(raster, 1)
    dil = np.max(
        [
            pad[1 + dy : 1 + dy + ny, 1 + dx : 1 + dx + nx]
            for dy in (-1, 0, 1)
            for dx in (-1, 0, 1)
        ],
        axis=0,
    )
    pad = np.pad(dil, 1, constant_values=1)
    closed = np.min(
        [
            pad[1 + dy : 1 + dy + ny, 1 + dx : 1 + dx + nx]
            for dy in (-1, 0, 1)
            for dx in (-1, 0, 1)
        ],
        axis=0,
    )
    # Rows run north to south for rasterio.
    flipped = closed[::-1].astype(np.uint8)
    transform = from_origin(lon0, lat0 + ny * grid_deg, grid_deg, grid_deg)
    polys = [
        shape(g)
        for g, v in features.shapes(flipped, mask=flipped == 1, transform=transform)
        if v == 1
    ]
    return unary_union(polys)


def main(argv: list[str] | None = None) -> int:
    from shapely.geometry import box, mapping

    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--file", type=Path, required=True, help="one raw model file")
    parser.add_argument(
        "--atlas", nargs="+", required=True, help="atlas names built from it"
    )
    parser.add_argument("--grid-deg", type=float, default=0.05)
    parser.add_argument(
        "--validity-bbox",
        type=float,
        nargs=4,
        metavar=("LAT_MIN", "LON_MIN", "LAT_MAX", "LON_MAX"),
        default=None,
        help="clip to where the runtime may serve the atlas",
    )
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)
    lat, lon = wet_points(args.file)
    geom = domain_polygon(lat, lon, args.grid_deg)
    if args.validity_bbox:
        a, b, c, d = args.validity_bbox
        geom = geom.intersection(box(b, a, d, c))
    geom = geom.simplify(args.grid_deg / 2)
    fc = {
        "type": "FeatureCollection",
        "name": "tidal_model_domain",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "kind": "domain",
                    "atlases": args.atlas,
                    "source_file": args.file.name,
                    "wet_cells": int(lat.size),
                    "grid_deg": args.grid_deg,
                    "area_deg2": round(geom.area, 2),
                },
                "geometry": mapping(geom),
            }
        ],
    }
    args.out.write_text(json.dumps(fc, separators=(",", ":")))
    print(
        f"{args.out.name}: {lat.size} wet cells, {geom.area:.1f} deg2, {args.out.stat().st_size / 1e3:.0f} kB"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
