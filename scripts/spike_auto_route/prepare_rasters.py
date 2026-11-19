#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars
"""Build the per-case rasters of the auto-route spike, outside the repository.

For each case extent, on one grid of square pixels (``--pitch-m``, 45 m by
default), rasterises three shorelines and resamples one bathymetry:

- ``land_osm``: OSM land polygons (osmdata.openstreetmap.de, split, EPSG:4326),
  read straight from the zip with a bbox filter;
- ``land_gshhg``: GSHHG 2.3.7 full resolution, level 1;
- ``land_ne``: the mask the server ships today (Natural Earth 10 m at 0.01 deg,
  sea dilated), resampled nearest;
- ``elev``: EMODnet DTM mean, metres to LAT (negative = water depth), nearest.

A pixel is land when its centre is inside a land polygon. Run with
``uv run --with rasterio --with shapely --with pyogrio``; data dir defaults to
``~/ohmywind-route-spike-data``.
"""

from __future__ import annotations

import argparse
import math
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cases import CASES

DATA = Path.home() / "ohmywind-route-spike-data"
OSM_ZIP = DATA / "osm_raw" / "land-polygons-split-4326.zip"
GSHHG_ZIP = DATA / "gshhg_raw" / "gshhg-shp-2.3.7.zip"
NE_MASK = Path("/home/qdonnars/projects/open_wind/build/land/land_mask.npz")


def read_polys(vsi: str, bbox: tuple[float, float, float, float]):
    import shapely
    from pyogrio import raw

    lat_min, lon_min, lat_max, lon_max = bbox
    out = raw.read(vsi, bbox=(lon_min, lat_min, lon_max, lat_max), read_geometry=True)
    geoms = shapely.from_wkb(out[2])
    box = shapely.box(lon_min, lat_min, lon_max, lat_max)
    return [g for g in shapely.intersection(geoms, box) if not g.is_empty]


def rasterize(polys, shape, transform) -> np.ndarray:
    from rasterio import features

    if not polys:
        return np.zeros(shape, dtype=bool)
    arr = features.rasterize(
        [(p, 1) for p in polys], out_shape=shape, transform=transform, fill=0, dtype="uint8"
    )
    return arr.astype(bool)[::-1]  # row 0 at the south edge


def main(argv: list[str] | None = None) -> int:
    from rasterio.transform import from_origin

    from openwind_data.currents.land_mask import LandMask

    ap = argparse.ArgumentParser()
    ap.add_argument("--pitch-m", type=float, default=45.0)
    ap.add_argument("--only", nargs="*")
    args = ap.parse_args(argv)
    ne = LandMask.from_directory(NE_MASK.parent)
    for case in CASES:
        if args.only and case.key not in args.only:
            continue
        if "_" in case.key:  # a variant reuses its base case's rasters
            continue
        t0 = time.perf_counter()
        lat_min, lon_min, lat_max, lon_max = case.bbox
        lat_c = 0.5 * (lat_min + lat_max)
        dlat = args.pitch_m / 111_195.0
        dlon = dlat / math.cos(math.radians(lat_c))
        n_lat = math.ceil((lat_max - lat_min) / dlat)
        n_lon = math.ceil((lon_max - lon_min) / dlon)
        transform = from_origin(lon_min, lat_min + n_lat * dlat, dlon, dlat)
        shape = (n_lat, n_lon)
        osm = read_polys(f"/vsizip/{OSM_ZIP}/land-polygons-split-4326/land_polygons.shp", case.bbox)
        land_osm = rasterize(osm, shape, transform)
        gs = read_polys(f"/vsizip/{GSHHG_ZIP}/GSHHS_shp/f/GSHHS_f_L1.shp", case.bbox)
        land_gshhg = rasterize(gs, shape, transform)
        rivers_json = DATA / "osm_rivers" / f"{case.key}.json"
        land_osmriv = None
        if rivers_json.exists():
            water = river_polys(rivers_json)
            land_osmriv = land_osm & ~rasterize(water, shape, transform)
        # Breakwaters, piers and groynes are OSM lines outside the land
        # polygons (Toulon's Grande Jetee); burnt in with all_touched so a
        # 20 m wide jetty is never thinner than a pixel.
        piers_json = DATA / "osm_piers" / f"{case.key}.json"
        land_plus = None
        if piers_json.exists():
            lines = pier_lines(piers_json)
            land_plus = (land_osmriv if land_osmriv is not None else land_osm) | rasterize_lines(
                lines, shape, transform
            )
        lats = lat_min + (np.arange(n_lat) + 0.5) * dlat
        lons = lon_min + (np.arange(n_lon) + 0.5) * dlon
        glat, glon = np.meshgrid(lats, lons, indexing="ij")
        land_ne = ne.is_land_many(glat, glon)
        elev = sample_emodnet(DATA / "emodnet" / f"{case.key}.tif", glat, glon)
        out = DATA / "grids" / f"{case.key}_{int(args.pitch_m)}m.npz"
        np.savez_compressed(
            out,
            land_osm=np.packbits(land_osm, axis=1),
            land_gshhg=np.packbits(land_gshhg, axis=1),
            land_ne=np.packbits(land_ne, axis=1),
            **({"land_osmplus": np.packbits(land_plus, axis=1)} if land_plus is not None else {}),
            **(
                {"land_osmriv": np.packbits(land_osmriv, axis=1)} if land_osmriv is not None else {}
            ),
            elev=elev.astype(np.float32),
            meta=np.array([lat_min, lon_min, dlat, dlon, n_lat, n_lon], dtype=np.float64),
        )
        print(
            f"{case.key}: {n_lat}x{n_lon} px, osm {land_osm.mean():.1%} land, "
            f"+piers {land_plus.mean() if land_plus is not None else float('nan'):.1%} "
            f"({len(osm)} polys), gshhg {land_gshhg.mean():.1%}, ne {land_ne.mean():.1%}, "
            f"elev nan {np.isnan(elev).mean():.1%}, {out.stat().st_size / 1e6:.1f} MB, "
            f"{time.perf_counter() - t0:.1f} s"
        )
    return 0


def pier_lines(path: Path):
    import json

    import shapely

    out = []
    for e in json.loads(path.read_text())["elements"]:
        if e["type"] == "way" and e.get("geometry") and len(e["geometry"]) >= 2:
            out.append(shapely.LineString([(g["lon"], g["lat"]) for g in e["geometry"]]))
    return out


def rasterize_lines(lines, shape, transform) -> np.ndarray:
    from rasterio import features

    if not lines:
        return np.zeros(shape, dtype=bool)
    arr = features.rasterize(
        [(ln, 1) for ln in lines],
        out_shape=shape,
        transform=transform,
        fill=0,
        all_touched=True,
        dtype="uint8",
    )
    return arr.astype(bool)[::-1]


def river_polys(path: Path):
    """Water polygons (rivers, riverbanks) from an Overpass ``out geom`` answer.

    Closed ways are polygons; multipolygon relations are rebuilt by
    polygonising their outer members and removing their inner ones.
    """
    import json

    import shapely
    from shapely.ops import polygonize, unary_union

    els = json.loads(path.read_text())["elements"]
    out = []
    for e in els:
        if e["type"] == "way" and e.get("geometry"):
            pts = [(g["lon"], g["lat"]) for g in e["geometry"]]
            if len(pts) >= 4 and pts[0] == pts[-1]:
                out.append(shapely.Polygon(pts))
        elif e["type"] == "relation":
            outer, inner = [], []
            for m in e.get("members", []):
                if m.get("type") != "way" or not m.get("geometry"):
                    continue
                line = shapely.LineString([(g["lon"], g["lat"]) for g in m["geometry"]])
                (inner if m.get("role") == "inner" else outer).append(line)
            polys = unary_union(list(polygonize(unary_union(outer))))
            if inner:
                polys = polys.difference(unary_union(list(polygonize(unary_union(inner)))))
            if not polys.is_empty:
                out.append(polys)
    return [p.buffer(0) for p in out]


def sample_emodnet(path: Path, glat: np.ndarray, glon: np.ndarray) -> np.ndarray:
    import rasterio

    with rasterio.open(path) as ds:
        a = ds.read(1).astype(np.float64)
        nod = ds.nodata
        t = ds.transform
    if nod is not None:
        a[a == nod] = np.nan
    a[np.abs(a) > 1e5] = np.nan
    cols = np.floor((glon - t.c) / t.a).astype(np.int64)
    rows = np.floor((glat - t.f) / t.e).astype(np.int64)
    ok = (rows >= 0) & (rows < a.shape[0]) & (cols >= 0) & (cols < a.shape[1])
    out = np.full(glat.shape, np.nan)
    out[ok] = a[rows[ok], cols[ok]]
    return out


if __name__ == "__main__":
    sys.exit(main())
