#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars
# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "eccodes>=2.37",
#   "numpy>=1.26",
#   "polars>=1.0",
#   "pyarrow>=16",
#   "openwind-data",
# ]
#
# [tool.uv.sources]
# openwind-data = { path = "../packages/data-adapters", editable = true }
# ///
"""Validate the BSH-derived atlases: hold-out day, ATLNE at the same cells, HF radar.

Three checks, each answering a different question:

1. **Hold-out** (``--holdout-atlas-dir``): an atlas fitted without one day is
   asked to reconstruct that day; the truth is the freshest BSH forecast for
   it. Answers "does a three-day fit extrapolate one day ahead?" and puts a
   number on the weather part the harmonic model cannot carry.
2. **ATLNE at the same cells**: the MARC atlas the cascade uses today is
   evaluated against the same truth. Answers "how much better than what we
   ship?" and, with the zero-current baseline, "is either of them skilful?".
3. **HF radar** (``--hfr-dir``): three years of COSYNA surface-current
   observations at a few points, analysed with the same code, give observed
   ``M2`` and ``S2`` ellipses. The only check independent of any model.
   Radar sees the top 0.3 to 2.5 m; BSH averages 0 to 5 m; ATLNE is
   depth-averaged: expect the radar to run hottest.

Writes ``report.json`` and prints a Markdown summary.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import polars as pl

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_bsh_atlas import choose_best_lead, read_file, scan_archive
from openwind_data.currents.harmonic import _canonical
from openwind_data.currents.harmonic_analysis import (
    analyze,
    current_ellipse,
    design_matrix,
    select_constituents,
)
from openwind_data.currents.marc_atlas import MarcAtlasRegistry

MS_TO_KN = 1.0 / 0.514444
HFR_POINTS = {
    "helgoland": (54.18, 7.90),
    "elbe_approach": (54.00, 8.10),
    "bight_mid": (54.30, 7.30),
    "elbe_mouth": (53.95, 8.40),
    "amrum_bank": (54.50, 8.20),
    "norderney": (53.75, 7.20),
}
NAMED_POINTS = {
    "CuxBru": {
        "Cuxhaven roads": (53.885, 8.705),
        "Medemgrund": (53.905, 8.88),
        "Brunsbüttel": (53.89, 9.13),
    },
    "AusAlt": {"Elbe approach (Scharhörn)": (53.98, 8.30), "Altenbruch": (53.86, 8.72)},
    "idb": {
        "Helgoland S": (54.15, 7.90),
        "Mid passage": (54.03, 8.30),
        "Cuxhaven roads": (53.885, 8.705),
    },
    "db": {"Helgoland S": (54.15, 7.90), "Mid passage": (54.03, 8.30)},
}


def load_atlas(atlas_dir: Path) -> tuple[pl.DataFrame, dict]:
    meta = json.loads((atlas_dir / "metadata.json").read_text())
    tiles = sorted(atlas_dir.glob("tile_lat=*/tile_lon=*/data.parquet"))
    return pl.concat([pl.read_parquet(t) for t in tiles], how="diagonal"), meta


def constants_columns(df: pl.DataFrame, comp: str) -> list[str]:
    return [
        c[: -len(f"_{comp}_amp")]
        for c in df.columns
        if c.endswith(f"_{comp}_amp")
        and _canonical(c[: -len(f"_{comp}_amp")]) is not None
    ]


def predict_cells(
    df: pl.DataFrame, times: list[datetime], comp: str, with_mean: bool
) -> np.ndarray:
    """Series ``(n_times, n_cells)`` of one component from a wide atlas frame."""
    names = constants_columns(df, comp)
    x = design_matrix(times, names)[0]
    amp = np.nan_to_num(
        np.column_stack([df[f"{n}_{comp}_amp"].to_numpy() for n in names]).astype(float)
    )
    g = np.deg2rad(
        np.nan_to_num(
            np.column_stack([df[f"{n}_{comp}_g"].to_numpy() for n in names]).astype(
                float
            )
        )
    )
    coef = np.zeros((1 + 2 * len(names), df.height))
    if with_mean and f"z0_{comp}_ms" in df.columns:
        coef[0] = np.nan_to_num(df[f"z0_{comp}_ms"].to_numpy())
    coef[1::2] = (amp * np.cos(g)).T
    coef[2::2] = (amp * np.sin(g)).T
    return x @ coef


def marc_series(
    registry: MarcAtlasRegistry,
    lats: np.ndarray,
    lons: np.ndarray,
    times: list[datetime],
):
    """ATLNE u/v series at many points, one registry lookup per distinct ~1 km key."""
    keys = np.round(np.column_stack([lats, lons]) / 0.01) * 0.01
    cache: dict[tuple[float, float], tuple[np.ndarray, np.ndarray] | None] = {}
    u = np.full((len(times), lats.size), np.nan)
    v = np.full((len(times), lats.size), np.nan)
    from openwind_data.currents.harmonic import predict

    for i, (klat, klon) in enumerate(map(tuple, keys)):
        key = (float(klat), float(klon))
        if key not in cache:
            cell = registry.cell_at(*key)
            if cell is None or not cell.u_constants or not cell.v_constants:
                cache[key] = None
            else:
                cache[key] = (
                    predict(times, cell.u_constants),
                    predict(times, cell.v_constants),
                )
        got = cache[key]
        if got is not None:
            u[:, i], v[:, i] = got
    return u, v


def metrics(tu, tv, pu, pv) -> dict:
    ok = np.isfinite(tu) & np.isfinite(tv) & np.isfinite(pu) & np.isfinite(pv)
    if not ok.any():
        return {}
    ts, ps = np.hypot(tu, tv), np.hypot(pu, pv)
    err_u, err_v = (pu - tu)[ok], (pv - tv)[ok]
    rmse_vec = float(np.sqrt(np.mean(err_u**2 + err_v**2)))
    rms_truth = float(np.sqrt(np.mean(tu[ok] ** 2 + tv[ok] ** 2)))
    return {
        "n": int(ok.sum()),
        "rmse_vector_kn": round(rmse_vec * MS_TO_KN, 3),
        "rms_truth_kn": round(rms_truth * MS_TO_KN, 3),
        "skill_vector": round(1.0 - rmse_vec**2 / rms_truth**2, 3)
        if rms_truth > 0
        else None,
        "rmse_speed_kn": round(
            float(np.sqrt(np.mean((ps - ts)[ok] ** 2))) * MS_TO_KN, 3
        ),
        "bias_speed_kn": round(float(np.mean((ps - ts)[ok])) * MS_TO_KN, 3),
        "mean_truth_max_speed_kn": round(
            float(np.nanmean(np.nanmax(np.where(ok, ts, np.nan), axis=0))) * MS_TO_KN, 3
        ),
        "mean_pred_max_speed_kn": round(
            float(np.nanmean(np.nanmax(np.where(ok, ps, np.nan), axis=0))) * MS_TO_KN, 3
        ),
    }


def holdout_check(
    area: str, holdout_dir: Path, archive_dir: Path, registry: MarcAtlasRegistry
) -> dict:
    df, meta = load_atlas(holdout_dir)
    excluded = meta["analysis"]["excluded_dates"]
    files = scan_archive(archive_dir, area, set())
    plan = choose_best_lead(files)
    test_times = [t for t in plan if (t.strftime("%Y-%m-%d") in excluded)]
    by_file: dict[Path, list[datetime]] = {}
    for t in test_times:
        by_file.setdefault(plan[t].path, []).append(t)
    grid = None
    truth: dict[datetime, dict[int, np.ndarray]] = {}
    for path, ts in by_file.items():
        g, msgs = read_file(path, set(ts))
        grid = grid or g
        truth.update(msgs)
    assert grid is not None
    times = sorted(truth)
    iy = np.rint(
        (df["lat"].to_numpy() - grid.lats[0]) / (grid.lats[1] - grid.lats[0])
    ).astype(int)
    ix = np.rint(
        (df["lon"].to_numpy() - grid.lons[0]) / (grid.lons[1] - grid.lons[0])
    ).astype(int)
    tu = np.stack([truth[t][2][iy, ix] for t in times]).astype(float)
    tv = np.stack([truth[t][3][iy, ix] for t in times]).astype(float)
    pu, pv = (
        predict_cells(df, times, "u", with_mean=False),
        predict_cells(df, times, "v", with_mean=False),
    )
    pu_m, pv_m = (
        predict_cells(df, times, "u", with_mean=True),
        predict_cells(df, times, "v", with_mean=True),
    )
    mu, mv = marc_series(registry, df["lat"].to_numpy(), df["lon"].to_numpy(), times)
    lead_h = [(t - plan[t].run).total_seconds() / 3600 for t in times]
    out = {
        "area": area,
        "fit_record_hours": meta["analysis"]["record_hours"],
        "fit_resolved": meta["analysis"]["resolved"],
        "fit_inferred": [i["name"] for i in meta["analysis"]["inferred_u"]],
        "test_dates": excluded,
        "test_instants": len(times),
        "test_lead_hours": [round(min(lead_h), 1), round(max(lead_h), 1)],
        "cells": int(df.height),
        "bsh_atlas_tidal_only": metrics(tu, tv, pu, pv),
        "bsh_atlas_with_mean": metrics(tu, tv, pu_m, pv_m),
        "marc_atlne": metrics(tu, tv, mu, mv),
        "zero_current": metrics(tu, tv, np.zeros_like(tu), np.zeros_like(tv)),
        "named_points": {},
    }
    lats, lons = df["lat"].to_numpy(), df["lon"].to_numpy()
    for label, (plat, plon) in NAMED_POINTS.get(area, {}).items():
        d2 = (lats - plat) ** 2 + ((lons - plon) * np.cos(np.deg2rad(plat))) ** 2
        j = int(np.argmin(d2))
        if np.sqrt(d2[j]) > 0.01:
            continue
        rows = {}
        for key, (su, sv) in (
            ("truth", (tu, tv)),
            ("bsh_atlas", (pu, pv)),
            ("marc_atlne", (mu, mv)),
        ):
            sp = np.hypot(su[:, j], sv[:, j])
            if np.all(np.isnan(sp)):
                rows[key] = None
                continue
            k = int(np.nanargmax(sp))
            rows[key] = {
                "max_speed_kn": round(float(np.nanmax(sp)) * MS_TO_KN, 2),
                "time_of_max": times[k].strftime("%H:%M"),
                "dir_to_at_max_deg": round(
                    float(np.degrees(np.arctan2(su[k, j], sv[k, j])) % 360), 0
                ),
            }
        out["named_points"][label] = {
            "cell": [round(float(lats[j]), 4), round(float(lons[j]), 4)],
            **rows,
        }
    return out


def read_hfr(paths: list[Path]) -> tuple[list[datetime], np.ndarray, np.ndarray]:
    times, us, vs = [], [], []
    for path in paths:
        with path.open() as fh:
            for row in csv.reader(fh):
                if len(row) < 6 or row[0][:2] != "20":
                    continue
                try:
                    u, v = float(row[4]), float(row[5])
                except ValueError:
                    continue
                if not (np.isfinite(u) and np.isfinite(v)):
                    continue
                times.append(
                    datetime.strptime(row[0], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)
                )
                us.append(u)
                vs.append(v)
    order = np.argsort([t.timestamp() for t in times])
    return [times[i] for i in order], np.array(us)[order], np.array(vs)[order]


def ellipse_row(consts_u: dict, consts_v: dict, name: str) -> dict | None:
    if name not in consts_u or name not in consts_v:
        return None
    e = current_ellipse(consts_u[name], consts_v[name])
    return {
        "semi_major_kn": round(e.semi_major * MS_TO_KN, 3),
        "semi_minor_kn": round(e.semi_minor * MS_TO_KN, 3),
        "inclination_deg": round(e.inclination_deg, 1),
        "phase_deg": round(e.phase_deg, 1),
    }


def nearest_constants(
    df: pl.DataFrame, lat: float, lon: float
) -> tuple[dict, dict, float] | None:
    lats, lons = df["lat"].to_numpy(), df["lon"].to_numpy()
    d2 = (lats - lat) ** 2 + ((lons - lon) * np.cos(np.deg2rad(lat))) ** 2
    j = int(np.argmin(d2))
    dist_km = float(np.sqrt(d2[j])) * 111.0
    if dist_km > 3.0:
        return None
    row = df.row(j, named=True)
    cu = {n: (row[f"{n}_u_amp"], row[f"{n}_u_g"]) for n in constants_columns(df, "u")}
    cv = {n: (row[f"{n}_v_amp"], row[f"{n}_v_g"]) for n in constants_columns(df, "v")}
    return cu, cv, dist_km


def hfr_check(
    hfr_dir: Path, atlases: dict[str, pl.DataFrame], registry: MarcAtlasRegistry
) -> dict:
    out = {}
    wanted = (
        "M2",
        "S2",
        "N2",
        "K1",
        "O1",
        "M4",
        "MS4",
        "K2",
        "P1",
        "Q1",
        "MN4",
        "M6",
        "2N2",
        "NU2",
        "L2",
        "MU2",
    )
    for name, (lat, lon) in HFR_POINTS.items():
        paths = sorted(hfr_dir.glob(f"hfr_{name}*.csv"))
        if not paths:
            continue
        times, u, v = read_hfr(paths)
        if len(times) < 1000:
            out[name] = {"error": f"only {len(times)} samples"}
            continue
        hours = (times[-1] - times[0]).total_seconds() / 3600
        consts = select_constituents(hours, wanted)
        ru, rv = analyze(times, u, consts), analyze(times, v, consts)
        entry = {
            "lat": lat,
            "lon": lon,
            "samples": len(times),
            "span_days": round(hours / 24, 0),
            "coverage_pct": round(100 * len(times) / (hours * 3), 1),  # 20-min cadence
            "variance_explained_u": round(ru.variance_explained, 3),
            "variance_explained_v": round(rv.variance_explained, 3),
            "observed": {
                c: ellipse_row(ru.constants, rv.constants, c)
                for c in ("M2", "S2", "N2", "M4")
            },
            "observed_mean_kn": [
                round(ru.z0 * MS_TO_KN, 3),
                round(rv.z0 * MS_TO_KN, 3),
            ],
        }
        for atlas_name, df in atlases.items():
            near = nearest_constants(df, lat, lon)
            if near is None:
                continue
            cu, cv, dist = near
            entry[atlas_name] = {
                "cell_distance_km": round(dist, 2),
                **{c: ellipse_row(cu, cv, c) for c in ("M2", "S2", "N2", "M4")},
            }
        cell = registry.cell_at(lat, lon)
        if cell is not None and cell.u_constants:
            entry["marc_atlne"] = {
                "cell_distance_km": round(
                    float(
                        np.hypot(
                            (cell.lat - lat) * 111,
                            (cell.lon - lon) * 111 * np.cos(np.deg2rad(lat)),
                        )
                    ),
                    2,
                ),
                **{
                    c: ellipse_row(cell.u_constants, cell.v_constants, c)
                    for c in ("M2", "S2", "N2", "M4")
                },
            }
        out[name] = entry
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--archive-dir", type=Path, default=Path("build/bsh/archive"))
    parser.add_argument(
        "--holdout-atlas-dir", type=Path, default=Path("build/bsh/atlas_holdout")
    )
    parser.add_argument("--atlas-dir", type=Path, default=Path("build/bsh/atlas"))
    parser.add_argument("--reference-atlas-dir", type=Path, default=Path("build/marc"))
    parser.add_argument("--hfr-dir", type=Path, default=Path("build/bsh/validation"))
    parser.add_argument(
        "--out", type=Path, default=Path("build/bsh/validation/report.json")
    )
    args = parser.parse_args(argv)

    registry = MarcAtlasRegistry.from_directory(args.reference_atlas_dir)
    report: dict = {
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "holdout": [],
        "hfr": {},
    }
    for sub in sorted(args.holdout_atlas_dir.glob("BSH_*")):
        area = json.loads((sub / "metadata.json").read_text())["source"][
            "product"
        ].removeprefix("Current_")
        print(f"[holdout] {area}", file=sys.stderr)
        report["holdout"].append(holdout_check(area, sub, args.archive_dir, registry))
    atlases = {}
    for sub in sorted(args.atlas_dir.glob("BSH_*")):
        atlases[sub.name.lower()] = load_atlas(sub)[0]
    if args.hfr_dir.exists():
        print("[hfr]", file=sys.stderr)
        report["hfr"] = hfr_check(args.hfr_dir, atlases, registry)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2, ensure_ascii=False))

    print("\n## Hold-out (RMSE vectoriel en nœuds, skill = 1 - MSE/var)")
    print(
        "| zone | fit h | test | BSH atlas (tidal) | BSH atlas (+moy.) | MARC ATLNE | courant nul |"
    )
    print("|---|---|---|---|---|---|---|")
    for h in report["holdout"]:
        f = lambda m: (
            f"{m['rmse_vector_kn']:.2f} kt (skill {m['skill_vector']})" if m else "n/a"
        )
        print(
            f"| {h['area']} | {h['fit_record_hours']:.0f} | {','.join(h['test_dates'])} ({h['test_lead_hours'][0]:.0f}-{h['test_lead_hours'][1]:.0f} h) "
            f"| {f(h['bsh_atlas_tidal_only'])} | {f(h['bsh_atlas_with_mean'])} | {f(h['marc_atlne'])} | {h['zero_current']['rms_truth_kn']:.2f} kt |"
        )
        for label, pt in h["named_points"].items():
            print(
                f"|   {label} | | | "
                + " | ".join(
                    f"{pt[k]['max_speed_kn']:.2f} kt @ {pt[k]['time_of_max']} ({pt[k]['dir_to_at_max_deg']:.0f}°)"
                    if pt.get(k)
                    else "n/a"
                    for k in ("truth", "bsh_atlas", "marc_atlne")
                )
                + " | |"
            )
    print(
        "\n## Radar HF COSYNA (ellipse M2, demi-grand axe en nœuds / inclinaison / phase G)"
    )
    print(
        "| point | échantillons | observé M2 | BSH atlas M2 | ATLNE M2 | observé S2 | BSH S2 | ATLNE S2 |"
    )
    print("|---|---|---|---|---|---|---|---|")
    for name, e in report["hfr"].items():
        if "error" in e:
            print(f"| {name} | {e['error']} |")
            continue

        def fmt(src, c, entry=e):
            r = entry.get(src, {}).get(c) if isinstance(entry.get(src), dict) else None
            return (
                f"{r['semi_major_kn']:.2f} / {r['inclination_deg']:.0f}° / {r['phase_deg']:.0f}°"
                if r
                else "n/a"
            )

        bsh = next((k for k in e if k.startswith("bsh_")), None)
        print(
            f"| {name} | {e['samples']} ({e['coverage_pct']:.0f} %) | {fmt('observed', 'M2')} | {fmt(bsh, 'M2') if bsh else 'n/a'} | {fmt('marc_atlne', 'M2')} | {fmt('observed', 'S2')} | {fmt(bsh, 'S2') if bsh else 'n/a'} | {fmt('marc_atlne', 'S2')} |"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
