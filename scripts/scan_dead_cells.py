# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""List the clusters of tide-dead cells in harmonic atlases: candidates for unknown zones.

A cell whose M2 height amplitude is near zero inside an atlas of a tidal
coast is water the model cut off from the tide: a basin behind a barrage
(the Rance under MARC MANW), a lock-controlled estuary, or land filled with
zeros. None of them is a current anyone should add to a boat speed, but the
scan only proposes: a zone enters ``unknown_zones.geojson`` with a source
that says why, never on the scan alone (``docs/tidal-world/zones-inconnues.md``).

Usage, from the repository root:

    env -u VIRTUAL_ENV uv run --project packages/data-adapters \\
        python scripts/scan_dead_cells.py build/marc --max-m2 0.05
"""

from __future__ import annotations

import argparse
from pathlib import Path

import polars as pl

from openwind_data.currents.marc_atlas import MarcAtlasRegistry


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("atlas_dir", type=Path, help="directory holding one sub-directory per atlas")
    ap.add_argument(
        "--max-m2",
        type=float,
        default=0.05,
        help="M2 height amplitude under which a cell is dead (m)",
    )
    ap.add_argument("--cluster-deg", type=float, default=0.1, help="grouping cell size (deg)")
    ap.add_argument("--top", type=int, default=12, help="clusters listed per atlas")
    args = ap.parse_args()

    registry = MarcAtlasRegistry.from_directory(args.atlas_dir)
    for atlas in registry.atlases:
        frames = []
        for tile in sorted(Path(atlas.parquet_dir).glob("**/data.parquet")):
            df = pl.read_parquet(tile)
            if "M2_h_amp" not in df.columns:
                continue
            dead = df.filter(pl.col("M2_h_amp") < args.max_m2).select("lat", "lon", "M2_h_amp")
            if dead.height:
                frames.append(dead)
        if not frames:
            print(f"{atlas.name}: no dead cell")
            continue
        cells = pl.concat(frames)
        k = 1.0 / args.cluster_deg
        clusters = (
            cells.with_columns(
                (pl.col("lat") * k).floor().alias("glat"), (pl.col("lon") * k).floor().alias("glon")
            )
            .group_by("glat", "glon")
            .agg(
                pl.len().alias("cells"),
                pl.col("lat").mean().round(4).alias("lat"),
                pl.col("lon").mean().round(4).alias("lon"),
                pl.col("M2_h_amp").max().alias("max_m2_m"),
            )
            .sort("cells", descending=True)
        )
        print(
            f"{atlas.name} ({atlas.resolution_m} m): {cells.height} dead cells, {clusters.height} clusters"
        )
        for row in clusters.head(args.top).iter_rows(named=True):
            print(
                f"  {row['cells']:>6}  {row['lat']:>9.4f} {row['lon']:>9.4f}  max M2 {row['max_m2_m']:.4f} m"
            )


if __name__ == "__main__":
    main()
