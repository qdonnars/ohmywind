#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars
"""Build the land tile archive the route repair reads (see ``land_tiles.py``).

From the OSM land polygons published by osmdata.openstreetmap.de (split,
EPSG:4326, read from the zip on disk), plus, where a directory of Overpass
answers is given, the OSM breakwaters, groynes and dams burnt in with
``all_touched`` (a breakwater is thinner than a pixel and seldom part of the
coastline).

    # France and the coasts around it, the archive shipped in the package
    uv run --no-project --with rasterio --with shapely --with pyogrio --with numpy \\
        scripts/build_land_tiles.py --bbox 38.5 -10.5 52.0 12.5 \\
        --piers ~/ohmywind-route-spike-data/piers_tiles --out land_tiles.bin

    # The world (about twenty minutes on sixteen cores)
    ... scripts/build_land_tiles.py --out land_tiles_world.bin

``--fetch-piers`` downloads the Overpass answers first, one file per 2°
square that holds some coast, skipping those already on disk (about a
minute a square on the public server, which often answers 502: the script
waits and asks again).
"""

from __future__ import annotations

import argparse
import datetime
import http.client
import importlib.util
import json
import math
import multiprocessing
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np

# Loaded by path: the lattice module needs numpy alone, its package the whole project.
_SPEC = importlib.util.spec_from_file_location(
    "land_tiles",
    Path(__file__).resolve().parents[1]
    / "packages/data-adapters/src/openwind_data/routing/auto_route/land_tiles.py",
)
lt = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(lt)

OSM_ZIP = Path.home() / "ohmywind-route-spike-data/osm_raw/land-polygons-split-4326.zip"
OVERPASS = "https://overpass-api.de/api/interpreter"
PIER_SQUARE_DEG = 2

# Read by the workers after the fork.
_POLYS = None
_POLY_TREE = None
_LINES = None
_LINE_TREE = None


def _to_lattice(coords: np.ndarray) -> np.ndarray:
    lat = np.clip(coords[:, 1], -lt.MAX_LAT, lt.MAX_LAT)
    return np.column_stack([lt.cols_of(coords[:, 0]), lt.rows_of(lat)])


def read_polygons(bbox):
    import shapely
    from pyogrio import raw

    vsi = f"/vsizip/{OSM_ZIP}/land-polygons-split-4326/land_polygons.shp"
    kwargs = {}
    if bbox is not None:
        lat_min, lon_min, lat_max, lon_max = bbox
        kwargs["bbox"] = (lon_min, lat_min, lon_max, lat_max)
    geoms = shapely.from_wkb(raw.read(vsi, read_geometry=True, **kwargs)[2])
    return shapely.transform(geoms, _to_lattice)


def pier_file(directory: Path, square: tuple[int, int]) -> Path:
    lat, lon = square
    return directory / f"piers_{lat:+03d}_{lon:+04d}.json"


def coastal_squares(states: np.ndarray) -> list[tuple[int, int]]:
    """The squares of ``PIER_SQUARE_DEG`` degrees that hold a mixed tile, south-west corners.

    A breakwater matters where the sea meets the land: a square all inland
    is not asked for, and those are the slow ones (every dam of the Alps).
    """
    s = PIER_SQUARE_DEG
    out: set[tuple[int, int]] = set()
    for ty, tx in zip(*np.nonzero(states == lt.MIXED), strict=True):
        lat0, lat1 = lt.lat_of(ty * lt.TILE_PX), lt.lat_of((ty + 1) * lt.TILE_PX)
        lon0, lon1 = lt.lon_of(tx * lt.TILE_PX), lt.lon_of((tx + 1) * lt.TILE_PX)
        for lat in range(math.floor(lat0 / s) * s, math.ceil(lat1), s):
            for lon in range(math.floor(lon0 / s) * s, math.ceil(lon1), s):
                out.add((lat, lon))
    return sorted(out)


def fetch_piers(directory: Path, squares, endpoint: str = OVERPASS) -> None:
    """One Overpass answer per square, kept on disk; a square already there is not asked again."""
    directory.mkdir(parents=True, exist_ok=True)
    for lat, lon in squares:
        out = pier_file(directory, (lat, lon))
        if out.exists():
            continue
        box = f"{lat},{lon},{lat + PIER_SQUARE_DEG},{lon + PIER_SQUARE_DEG}"
        query = (
            "[out:json][timeout:180];("
            f'way["man_made"~"^(breakwater|groyne)$"]({box});'
            f'way["waterway"="dam"]({box});'
            ");out geom;"
        )
        for attempt in range(6):
            try:
                req = urllib.request.Request(
                    endpoint,
                    data=urllib.parse.urlencode({"data": query}).encode(),
                    headers={"User-Agent": "land-tiles-build/1.0"},
                )
                with urllib.request.urlopen(req, timeout=240) as resp:
                    body = resp.read()
                json.loads(body)
                out.write_bytes(body)
                print(f"piers {out.name}: {len(body) / 1e3:.0f} kB", flush=True)
                break
            # A refusal, a timeout, a connection cut short or an answer that
            # is not JSON: Overpass does all four under load.
            except (OSError, http.client.HTTPException, ValueError) as exc:
                wait = 20 * (attempt + 1)
                print(f"piers {out.name}: {exc!r}, retry in {wait} s", flush=True)
                time.sleep(wait)
        else:
            print(f"piers {out.name}: GIVEN UP", flush=True)
        time.sleep(2)


def read_piers(directory: Path):
    """The breakwaters, groynes and dams of every answer on disk, on the lattice."""
    import shapely

    lines = []
    seen: set[int] = set()
    for path in sorted(directory.glob("piers_*.json")):
        for e in json.loads(path.read_text())["elements"]:
            tags = e.get("tags", {})
            # Pontoons and piers (man_made=pier) are left out: burnt in, the
            # pontoons of a marina fill its basin and close the way out.
            fixed = (
                tags.get("man_made") in ("breakwater", "groyne")
                or tags.get("waterway") == "dam"
            )
            if (
                fixed
                and e["type"] == "way"
                and e["id"] not in seen
                and len(e.get("geometry") or []) >= 2
            ):
                seen.add(e["id"])
                lines.append(
                    shapely.LineString([(g["lon"], g["lat"]) for g in e["geometry"]])
                )
    return shapely.transform(np.array(lines, dtype=object), _to_lattice)


def build_tile(key: tuple[int, int]) -> tuple[int, int, int, bytes | None]:
    """``(tx, ty, state, payload)`` of one tile."""
    import shapely
    from affine import Affine
    from rasterio import features

    tx, ty = key
    px = lt.TILE_PX
    box = shapely.box(tx * px, ty * px, (tx + 1) * px, (ty + 1) * px)
    polys = _POLYS[_POLY_TREE.query(box, predicate="intersects")]
    lines = (
        _LINES[_LINE_TREE.query(box, predicate="intersects")]
        if _LINE_TREE is not None
        else []
    )
    if len(polys) == 0 and len(lines) == 0:
        return tx, ty, lt.SEA, None
    # North-up for the rasteriser, flipped after: row 0 of a tile is its south.
    transform = Affine(1.0, 0.0, tx * px, 0.0, -1.0, (ty + 1) * px)
    land = np.zeros((px, px), dtype=np.uint8)
    if len(polys):
        land = features.rasterize(
            [(g, 1) for g in polys],
            out_shape=(px, px),
            transform=transform,
            fill=0,
            dtype="uint8",
        )
    if len(lines):
        land |= features.rasterize(
            [(g, 1) for g in lines],
            out_shape=(px, px),
            transform=transform,
            fill=0,
            all_touched=True,
            dtype="uint8",
        )
    land = land.astype(bool)[::-1]
    if land.all():
        return tx, ty, lt.LAND, None
    if not land.any():
        return tx, ty, lt.SEA, None
    return tx, ty, lt.MIXED, lt.encode_tile(land)


def main(argv: list[str] | None = None) -> int:
    global _POLYS, _POLY_TREE, _LINES, _LINE_TREE
    import shapely

    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--bbox", nargs=4, type=float, metavar=("LAT0", "LON0", "LAT1", "LON1")
    )
    ap.add_argument("--piers", type=Path, help="directory of Overpass answers")
    ap.add_argument("--fetch-piers", action="store_true")
    ap.add_argument(
        "--overpass", default=OVERPASS, help="Overpass endpoint to fetch from"
    )
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument(
        "--workers", type=int, default=max(1, multiprocessing.cpu_count() - 2)
    )
    args = ap.parse_args(argv)
    t0 = time.perf_counter()

    if args.bbox:
        lat0, lon0, lat1, lon1 = args.bbox
        tx0, tx1 = (
            int(lt.col_of(lon0) // lt.TILE_PX),
            int(lt.col_of(lon1) // lt.TILE_PX) + 1,
        )
        ty0, ty1 = (
            int(lt.row_of(lat0) // lt.TILE_PX),
            int(lt.row_of(lat1) // lt.TILE_PX) + 1,
        )
        # The polygons of the whole tiles, not of the bbox asked for.
        bbox = (
            lt.lat_of(ty0 * lt.TILE_PX),
            lt.lon_of(tx0 * lt.TILE_PX),
            lt.lat_of(ty1 * lt.TILE_PX),
            lt.lon_of(tx1 * lt.TILE_PX),
        )
    else:
        tx0, ty0, tx1, ty1 = 0, 0, lt.TILES, lt.TILES
        bbox = None
    _POLYS = read_polygons(bbox)
    _POLY_TREE = shapely.STRtree(_POLYS)
    print(f"{len(_POLYS)} land polygons, {time.perf_counter() - t0:.0f} s", flush=True)
    keys = [(tx, ty) for ty in range(ty0, ty1) for tx in range(tx0, tx1)]

    def build() -> tuple[np.ndarray, dict[tuple[int, int], bytes]]:
        states = np.zeros((lt.TILES, lt.TILES), dtype=np.uint8)
        payloads: dict[tuple[int, int], bytes] = {}
        with multiprocessing.get_context("fork").Pool(args.workers) as pool:
            for n, (tx, ty, state, payload) in enumerate(
                pool.imap_unordered(build_tile, keys, chunksize=64), 1
            ):
                states[ty, tx] = state
                if payload is not None:
                    payloads[(tx, ty)] = payload
                if n % 20000 == 0:
                    print(
                        f"{n}/{len(keys)} tiles, {time.perf_counter() - t0:.0f} s",
                        flush=True,
                    )
        return states, payloads

    if args.fetch_piers:
        if not args.piers:
            ap.error("--fetch-piers needs --piers")
        # A first pass on the land alone says where the coast is.
        fetch_piers(args.piers, coastal_squares(build()[0]), args.overpass)
    if args.piers:
        _LINES = read_piers(args.piers)
        _LINE_TREE = shapely.STRtree(_LINES) if len(_LINES) else None
        print(f"{len(_LINES)} breakwaters, groynes and dams", flush=True)
    states, payloads = build()
    breakwaters = "none"
    if args.piers:
        coastal = coastal_squares(states)
        missing = [sq for sq in coastal if not pier_file(args.piers, sq).exists()]
        breakwaters = (
            f"OSM breakwaters, groynes and dams in {len(coastal) - len(missing)} "
            f"of {len(coastal)} coastal squares of {PIER_SQUARE_DEG} degrees"
        )
        print(breakwaters, flush=True)

    ordered = [
        payloads[(tx, ty)]
        for ty, tx in zip(*np.nonzero(states == lt.MIXED), strict=True)
    ]
    meta = {
        "built": datetime.date.today().isoformat(),
        "source": "OpenStreetMap land polygons (osmdata.openstreetmap.de)",
        "attribution": "© OpenStreetMap contributors, ODbL 1.0",
        "breakwaters": breakwaters,
    }
    lt.write_archive(args.out, states, ordered, (tx0, ty0, tx1, ty1), meta)
    sizes = np.array([len(p) for p in ordered])
    print(
        f"{args.out}: {args.out.stat().st_size / 1e6:.2f} MB, {len(ordered)} mixed tiles of "
        f"{len(keys)} (mean {sizes.mean():.0f} B, max {sizes.max()} B), "
        f"{int((states == lt.LAND).sum())} land, {time.perf_counter() - t0:.0f} s"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
