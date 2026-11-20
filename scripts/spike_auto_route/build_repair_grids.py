#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars
"""Build the regional land grids the route repair prototype reads.

One grid per region, square pixels of ``--pitch-m`` (45 m by default): OSM
land polygons (osmdata.openstreetmap.de, split, EPSG:4326, read from the zip
on disk) plus OSM breakwaters, groynes and dams burnt in with
``all_touched`` (fetched once from Overpass into ``repair/piers_<region>.json``).
Saved as ``repair/<region>.npz``: ``land`` packed along rows (row 0 at the
south edge) and ``meta`` = lat0, lon0, dlat, dlon, n_lat, n_lon.

Run with ``uv run --with rasterio --with shapely --with pyogrio``.
"""

from __future__ import annotations

import argparse
import math
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prepare_rasters import OSM_ZIP, pier_lines, rasterize, rasterize_lines, read_polys

DATA = Path.home() / "ohmywind-route-spike-data"
OUT = DATA / "repair"

# lat_min, lon_min, lat_max, lon_max: the bench's trips with some room around.
REGIONS = {
    "bsud": (46.0, -4.9, 48.5, -1.0),  # Brest to La Rochelle and Yeu
    "manche": (48.55, -3.0, 49.8, -1.0),  # Saint-Malo, Channel Islands, Cherbourg
    "provence": (42.9, 3.8, 43.65, 6.8),  # Port-Camargue to Le Lavandou
}


def main(argv: list[str] | None = None) -> int:
    from rasterio.transform import from_origin

    ap = argparse.ArgumentParser()
    ap.add_argument("--pitch-m", type=float, default=45.0)
    ap.add_argument("--only", nargs="*")
    args = ap.parse_args(argv)
    for name, bbox in REGIONS.items():
        if args.only and name not in args.only:
            continue
        t0 = time.perf_counter()
        lat_min, lon_min, lat_max, lon_max = bbox
        dlat = args.pitch_m / 111_195.0
        dlon = dlat / math.cos(math.radians(0.5 * (lat_min + lat_max)))
        n_lat = math.ceil((lat_max - lat_min) / dlat)
        n_lon = math.ceil((lon_max - lon_min) / dlon)
        transform = from_origin(lon_min, lat_min + n_lat * dlat, dlon, dlat)
        shape = (n_lat, n_lon)
        polys = read_polys(f"/vsizip/{OSM_ZIP}/land-polygons-split-4326/land_polygons.shp", bbox)
        land = rasterize(polys, shape, transform)
        piers = OUT / f"piers_{name}.json"
        if piers.exists():
            land |= rasterize_lines(pier_lines(piers), shape, transform)
        out = OUT / f"{name}.npz"
        np.savez_compressed(
            out,
            land=np.packbits(land, axis=1),
            meta=np.array([lat_min, lon_min, dlat, dlon, n_lat, n_lon], dtype=np.float64),
        )
        print(
            f"{name}: {n_lat}x{n_lon} px, {land.mean():.1%} land, "
            f"{out.stat().st_size / 1e6:.1f} MB, {time.perf_counter() - t0:.1f} s"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
