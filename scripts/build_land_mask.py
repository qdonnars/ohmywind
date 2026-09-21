#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars
# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy>=1.26", "shapely>=2.0", "rasterio>=1.3", "openwind-data"]
#
# [tool.uv.sources]
# openwind-data = { path = "../packages/data-adapters", editable = true }
# ///
"""Build the land mask the tidal overlay refuses to answer on.

Rasterises a public ocean polygon (Natural Earth 10 m, public domain,
``build/natural_earth/ne_10m_ocean.geojson``) on a regular lat/lon grid over
the objective zone, marks a pixel as sea as soon as any of it touches the
ocean, then dilates the sea by one pixel: at a 1 km pitch, a harbour, a
river mouth or a shoreline the 1:10M line draws a little off stays at sea.
Land is what is left. Written as ``land_mask.npz`` in the standard packed
form (``openwind_data.currents.land_mask``), to ship in the atlas dataset.

Usage::

    uv run scripts/build_land_mask.py --out build/land/land_mask.npz
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
from openwind_data.currents.land_mask import pack


def dilate(sea: np.ndarray, pixels: int) -> np.ndarray:
    out = sea.copy()
    for _ in range(pixels):
        grown = out.copy()
        grown[1:] |= out[:-1]
        grown[:-1] |= out[1:]
        grown[:, 1:] |= out[:, :-1]
        grown[:, :-1] |= out[:, 1:]
        out = grown
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--ocean", type=Path, default=Path("build/natural_earth/ne_10m_ocean.geojson")
    )
    parser.add_argument("--out", type=Path, default=Path("build/land/land_mask.npz"))
    parser.add_argument(
        "--bbox",
        type=float,
        nargs=4,
        metavar=("LAT_MIN", "LON_MIN", "LAT_MAX", "LON_MAX"),
        default=[25.0, -25.0, 72.0, 40.0],
        help="grid extent (default: the objective zone, Iceland and Norway to Israel and Morocco)",
    )
    parser.add_argument("--pitch-deg", type=float, default=0.01)
    parser.add_argument(
        "--dilate-px", type=int, default=1, help="pixels of sea grown over the shore"
    )
    args = parser.parse_args(argv)

    from rasterio import features
    from rasterio.transform import from_origin
    from shapely.geometry import shape
    from shapely.ops import unary_union

    t0 = time.perf_counter()
    fc = json.loads(args.ocean.read_text())
    ocean = unary_union([shape(f["geometry"]) for f in fc["features"]])
    lat_min, lon_min, lat_max, lon_max = args.bbox
    g = args.pitch_deg
    n_lat = int(round((lat_max - lat_min) / g))
    n_lon = int(round((lon_max - lon_min) / g))
    transform = from_origin(lon_min, lat_max, g, g)  # north-up
    sea = features.rasterize(
        [(ocean, 1)],
        out_shape=(n_lat, n_lon),
        transform=transform,
        fill=0,
        all_touched=True,
        dtype="uint8",
    ).astype(bool)[::-1]  # south-up, row 0 at lat_min
    sea = dilate(sea, args.dilate_px)
    land = ~sea
    source = (
        f"Natural Earth 10 m ocean (public domain), pitch {g} deg, sea dilated by "
        f"{args.dilate_px} px, built {datetime.now(UTC).date().isoformat()}"
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        args.out, **pack(land, lat0=lat_min, lon0=lon_min, pitch_deg=g, source=source)
    )
    print(
        f"{n_lon}x{n_lat} px, {100 * land.mean():.1f} % land, "
        f"{args.out.stat().st_size / 1e6:.1f} MB in {time.perf_counter() - t0:.0f} s -> {args.out}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
