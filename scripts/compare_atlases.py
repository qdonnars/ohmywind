#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars
# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy>=1.26", "polars>=1.0", "pyarrow>=16", "openwind-data"]
#
# [tool.uv.sources]
# openwind-data = { path = "../packages/data-adapters", editable = true }
# ///
"""Compare the M2 (or any) current ellipse of one atlas set against another.

Random points are drawn where both registries answer; for each, the ellipse
of the constituent is computed from the constants each registry serves at
that point (so the comparison is exactly what the cascade would serve), and
the differences are summarised per pair of atlases: median and 90th
percentile of the semi-major axis ratio, of the inclination difference and
of the phase difference. Two ellipses that differ by 180 degrees of
inclination and 180 degrees of phase are the same ellipse; the phase is
compared after that ambiguity is removed.

Usage::

    uv run scripts/compare_atlases.py --candidate build/cmems/atlas --reference build/marc \\
        --bbox 48 -6 51.5 2 --points 400
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
from openwind_data.currents.harmonic_analysis import current_ellipse
from openwind_data.currents.marc_atlas import MarcAtlasRegistry

MS_TO_KN = 1.0 / 0.514444


def ellipse_of(cell, name: str):
    u = cell.u_constants.get(name)
    v = cell.v_constants.get(name)
    if u is None or v is None:
        return None
    return current_ellipse(u, v)


def phase_gap(a, b) -> float:
    """Phase difference in degrees once the 180/180 ambiguity is removed."""
    inc = (b.inclination_deg - a.inclination_deg + 90.0) % 180.0 - 90.0
    flip = abs((b.inclination_deg - a.inclination_deg) % 360.0 - 180.0) < 90.0
    ph = b.phase_deg - a.phase_deg + (180.0 if flip else 0.0)
    return float((ph + 180.0) % 360.0 - 180.0), float(inc)


def compare(
    candidate: MarcAtlasRegistry,
    reference: MarcAtlasRegistry,
    bbox: tuple[float, float, float, float],
    n_points: int,
    constituent: str,
    seed: int,
) -> dict:
    rng = np.random.default_rng(seed)
    lat_min, lon_min, lat_max, lon_max = bbox
    rows: dict[tuple[str, str], list] = defaultdict(list)
    tried = 0
    while sum(len(v) for v in rows.values()) < n_points and tried < 50 * n_points:
        tried += 1
        lat = float(rng.uniform(lat_min, lat_max))
        lon = float(rng.uniform(lon_min, lon_max))
        c = candidate.cell_at(lat, lon)
        r = reference.cell_at(lat, lon)
        if c is None or r is None:
            continue
        ec, er = ellipse_of(c, constituent), ellipse_of(r, constituent)
        if ec is None or er is None or er.semi_major <= 0.05 or ec.semi_major <= 0:
            continue  # below 0.1 kt in the reference, ratios mean nothing
        ph, inc = phase_gap(er, ec)
        rows[(c.atlas_name, r.atlas_name)].append(
            (
                lat,
                lon,
                er.semi_major,
                ec.semi_major,
                ec.semi_major / er.semi_major,
                inc,
                ph,
            )
        )
    out = {"constituent": constituent, "bbox": list(bbox), "pairs": []}
    for (cand, ref), pts in sorted(rows.items(), key=lambda kv: -len(kv[1])):
        a = np.array(pts)
        out["pairs"].append(
            {
                "candidate": cand,
                "reference": ref,
                "points": int(len(pts)),
                "reference_semi_major_kn_median": round(
                    float(np.median(a[:, 2])) * MS_TO_KN, 2
                ),
                "ratio_median": round(float(np.median(a[:, 4])), 3),
                "ratio_p10": round(float(np.percentile(a[:, 4], 10)), 3),
                "ratio_p90": round(float(np.percentile(a[:, 4], 90)), 3),
                "inclination_abs_median_deg": round(
                    float(np.median(np.abs(a[:, 5]))), 1
                ),
                "inclination_abs_p90_deg": round(
                    float(np.percentile(np.abs(a[:, 5]), 90)), 1
                ),
                "phase_median_deg": round(float(np.median(a[:, 6])), 1),
                "phase_abs_p90_deg": round(
                    float(np.percentile(np.abs(a[:, 6]), 90)), 1
                ),
            }
        )
    return out


def markdown(result: dict) -> str:
    lines = [
        f"| candidat | référence | points | {result['constituent']} réf. (kt, médiane) | rapport d'amplitude (p10 / médiane / p90) | écart d'inclinaison (médiane / p90) | écart de phase (médiane / p90 abs.) |",
        "|---|---|---|---|---|---|---|",
    ]
    for p in result["pairs"]:
        lines.append(
            f"| {p['candidate']} | {p['reference']} | {p['points']} | {p['reference_semi_major_kn_median']:.2f} | "
            f"{p['ratio_p10']:.2f} / {p['ratio_median']:.2f} / {p['ratio_p90']:.2f} | "
            f"{p['inclination_abs_median_deg']:.0f}° / {p['inclination_abs_p90_deg']:.0f}° | "
            f"{p['phase_median_deg']:+.0f}° / {p['phase_abs_p90_deg']:.0f}° |"
        )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--reference", type=Path, required=True)
    parser.add_argument(
        "--bbox",
        type=float,
        nargs=4,
        metavar=("LAT_MIN", "LON_MIN", "LAT_MAX", "LON_MAX"),
        required=True,
    )
    parser.add_argument("--points", type=int, default=300)
    parser.add_argument("--constituent", default="M2")
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--json", type=Path, default=None)
    args = parser.parse_args(argv)
    result = compare(
        MarcAtlasRegistry.from_directory(args.candidate),
        MarcAtlasRegistry.from_directory(args.reference),
        tuple(args.bbox),
        args.points,
        args.constituent,
        args.seed,
    )
    if args.json:
        args.json.write_text(json.dumps(result, indent=2))
    print(markdown(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
