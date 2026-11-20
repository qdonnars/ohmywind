#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars
"""Size a two-level OSM land mask over metropolitan France and Corsica.

Level 0 is today's 0.01 deg grid with three classes (sea, land, coast); only
the coast tiles carry a fine bitmap at the routing pitch. Counts the coast
tiles from the OSM land polygons (their boundaries rasterised with
``all_touched``), and estimates the file and memory of the fine level, plus
an EMODnet int16 band within ``--band-nm`` of the shore.
"""

from __future__ import annotations

import math
import sys
import time
from pathlib import Path

DATA = Path.home() / "ohmywind-route-spike-data"
BBOX = (41.3, -5.3, 51.2, 9.7)  # lat_min, lon_min, lat_max, lon_max


def main() -> int:
    import shapely
    from pyogrio import raw
    from rasterio import features
    from rasterio.transform import from_origin

    t0 = time.perf_counter()
    lat_min, lon_min, lat_max, lon_max = BBOX
    out = raw.read(
        f"/vsizip/{DATA}/osm_raw/land-polygons-split-4326.zip/land-polygons-split-4326/land_polygons.shp",
        bbox=(lon_min, lat_min, lon_max, lat_max),
    )
    geoms = shapely.from_wkb(out[2])
    t1 = time.perf_counter()
    g = 0.01
    n_lat = round((lat_max - lat_min) / g)
    n_lon = round((lon_max - lon_min) / g)
    tr = from_origin(lon_min, lat_max, g, g)
    # The split polygons have artificial edges on a 1-degree grid; the
    # boundary still marks a few tiles there, a small overcount.
    bounds = shapely.boundary(geoms)
    coast = features.rasterize(
        [(b, 1) for b in bounds],
        out_shape=(n_lat, n_lon),
        transform=tr,
        all_touched=True,
        dtype="uint8",
    ).astype(bool)
    n_coast = int(coast.sum())
    print(f"{len(geoms)} polygons read in {t1 - t0:.0f} s; {n_coast} coast tiles of 0.01 deg")
    for pitch_m in (90.0, 45.0, 30.0):
        dlat = pitch_m / 111_195.0
        px_lat = math.ceil(g / dlat)
        px_lon = math.ceil(g * math.cos(math.radians(46.5)) / dlat)
        bytes_tile = math.ceil(px_lat * px_lon / 8)
        mb = n_coast * bytes_tile / 1e6
        print(f"  fine level at {pitch_m:.0f} m: {px_lat}x{px_lon} px per tile, {mb:.1f} MB raw")
    # EMODnet band: tiles within band of a coast tile.
    band_nm = 12
    grow = math.ceil(band_nm * 1852 / (g * 111_195))
    band = coast.copy()
    for _ in range(grow):
        b2 = band.copy()
        b2[1:] |= band[:-1]
        b2[:-1] |= band[1:]
        b2[:, 1:] |= band[:, :-1]
        b2[:, :-1] |= band[:, 1:]
        band = b2
    cells_per_tile = (g * 960) ** 2  # EMODnet 1/960 deg
    print(
        f"  EMODnet int16 within {band_nm} nm: {int(band.sum())} tiles, "
        f"{band.sum() * cells_per_tile * 2 / 1e6:.0f} MB raw"
    )
    print(f"done in {time.perf_counter() - t0:.0f} s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
