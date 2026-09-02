# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The synthetic tidal atlases the API tests plan and overlay against.

Three builders, written once because three modules now want them: the golden
responses (a one-cell MARC atlas off Brest), the live-currents wiring test (a
MARC atlas and a SHOM zone over the same Morbihan water, so the cascade
composes) and the overlay batch (all three at once, one point per tier).

They are the same shapes the real datasets have, small enough to write per
test. Nothing here asserts anything: the numbers they produce are pinned where
the predictors live.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import polars as pl

# Where each synthetic dataset actually holds data. Exported so a test asks
# about the water the fixture covers rather than re-typing a coordinate that
# has to agree with one written forty lines away.
FINIS_CELL = (48.35, -4.80)
MORBIHAN_POINTS = ((47.50, -2.90), (47.51, -2.89), (47.49, -2.91))
MORBIHAN_MARC_CELL = (47.505, -2.895)


def write_finis_atlas(out: Path) -> Path:
    """A one-cell FINIS atlas off Brest, M2 only, height and current.

    Far from the Morbihan zone below, which is what lets a batch ask for a
    MARC-covered point that SHOM does not reach.
    """
    atlas_dir = out / "FINIS"
    atlas_dir.mkdir(parents=True, exist_ok=True)
    (atlas_dir / "metadata.json").write_text(
        json.dumps(
            {
                "atlas": "FINIS",
                "rank": 2,
                "resolution_m": 250,
                "constituents_h": ["M2"],
                "constituents_u": ["M2"],
                "constituents_v": ["M2"],
                "schema_version": 2,
            }
        )
    )
    (atlas_dir / "coverage.geojson").write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {"atlas": "FINIS"},
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [
                                [
                                    [-5.5, 47.5],
                                    [-4.5, 47.5],
                                    [-4.5, 49.0],
                                    [-5.5, 49.0],
                                    [-5.5, 47.5],
                                ]
                            ],
                        },
                    }
                ],
            }
        )
    )
    tile_dir = atlas_dir / "tile_lat=48.0" / "tile_lon=-5.0"
    tile_dir.mkdir(parents=True)
    pl.DataFrame(
        {
            "lat": [FINIS_CELL[0]],
            "lon": [FINIS_CELL[1]],
            "z0_hydro_m": [-3.85],
            "M2_h_amp": [2.05],
            "M2_h_g": [108.0],
            "M2_u_amp": [0.5],
            "M2_u_g": [80.0],
            "M2_v_amp": [0.3],
            "M2_v_g": [120.0],
        }
    ).write_parquet(tile_dir / "data.parquet", compression="zstd")
    return out


def write_shom_registry(out: Path) -> Path:
    """Three points on one zone, referred to Brest. Mirrors the domain fixture."""
    out.mkdir(parents=True, exist_ok=True)
    hours = list(range(-6, 7))
    u_ve = [math.sin(math.pi * h / 6.0) for h in hours]
    rows = [
        {
            "atlas_id": 558,
            "zone": "TEST_ZONE",
            "ref_port_key": "BREST",
            "ref_tide": "PM",
            "lat": lat,
            "lon": lon,
            "u_ve_kn": u_ve,
            "v_ve_kn": [0.0 for _ in hours],
            "u_me_kn": [0.5 * v for v in u_ve],
            "v_me_kn": [0.0 for _ in hours],
        }
        for lat, lon in MORBIHAN_POINTS
    ]
    pl.DataFrame(rows).with_columns(
        pl.col("atlas_id").cast(pl.Int16),
        pl.col("lat").cast(pl.Float32),
        pl.col("lon").cast(pl.Float32),
        pl.col("u_ve_kn").cast(pl.List(pl.Float32)),
        pl.col("v_ve_kn").cast(pl.List(pl.Float32)),
        pl.col("u_me_kn").cast(pl.List(pl.Float32)),
        pl.col("v_me_kn").cast(pl.List(pl.Float32)),
    ).write_parquet(out / "shom_c2d_points.parquet")
    (out / "shom_c2d_ref_ports.json").write_text(
        json.dumps(
            {
                "BREST": {
                    "display_name": "Brest",
                    "lat": 48.3833,
                    "lon": -4.4956,
                    "ref_tide": "PM",
                    "constants": {"M2": [2.0, 150.0], "S2": [0.7, 200.0]},
                }
            },
            ensure_ascii=False,
        )
    )
    return out


def write_marc_atlas(out: Path) -> Path:
    """One 250 m cell covering the same water, so the cascade composes."""
    atlas = out / "MORBI"
    tile = atlas / "tile_lat=47.5" / "tile_lon=-3.0"
    tile.mkdir(parents=True, exist_ok=True)
    (atlas / "metadata.json").write_text(
        json.dumps(
            {
                "atlas": "MORBI",
                "rank": 2,
                "resolution_m": 250,
                "constituents_h": ["M2"],
                "constituents_u": ["M2"],
                "constituents_v": ["M2"],
            }
        )
    )
    (atlas / "coverage.geojson").write_text(
        json.dumps(
            {
                "features": [
                    {
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [
                                [[-3.0, 47.4], [-2.8, 47.4], [-2.8, 47.6], [-3.0, 47.6]]
                            ],
                        }
                    }
                ]
            }
        )
    )
    pl.DataFrame(
        {
            "lat": [MORBIHAN_MARC_CELL[0]],
            "lon": [MORBIHAN_MARC_CELL[1]],
            "z0_hydro_m": [-3.10],
            "M2_h_amp": [2.05],
            "M2_h_g": [108.0],
            "M2_u_amp": [0.5],
            "M2_u_g": [80.0],
            "M2_v_amp": [0.3],
            "M2_v_g": [120.0],
        }
    ).write_parquet(tile / "data.parquet", compression="zstd")
    return out
