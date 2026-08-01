"""3-way bench: SHOM Atlas C2D vs MARC PREVIMER vs Open-Meteo SMOC.

Samples a small number of SHOM C2D points (one per zone to ensure
geographic spread), queries each source at the same 24 hourly times,
and reports pairwise speed/direction disagreement.

Three deltas, three questions:

- ``shom_vs_marc`` — MARC harmonic engine vs SHOM reference. If close,
  MARC is calibrated. If far, MARC's harmonic core is suspect.
- ``shom_vs_smoc`` — SHOM (harmonic) vs SMOC (harmonic + wind-driven).
  The wind component contributes; this delta isn't pure error.
- ``marc_vs_smoc`` — the one that decides Step 3. If MARC ≈ SMOC,
  MARC adds nothing over SMOC once SHOM is in place and the 5 GB
  payload becomes unjustifiable. If MARC differs significantly,
  we need to know which of MARC or SMOC is closer to truth (Step 2b
  with HF radar) before deciding.

Output: ``docs/bench/currents_3way_<datestamp>.json`` (raw per-point
records) plus a markdown summary at the same stem. Both are written
into a gitignored ``docs/bench/`` directory.

Run from repo root::

    uv run --project packages/data-adapters --with httpx \\
        python scripts/bench_currents_3way.py

The script needs MARC atlases in ``build/marc/`` and SHOM artefacts in
``build/shom_c2d/``; build them first via the existing builders. No
HF credentials required — SMOC is fetched live via Open-Meteo's public
API (~150 requests for the default sample, well under any free-tier
cap).
"""

from __future__ import annotations

import asyncio
import json
import random
import statistics
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np
import polars as pl

from openwind_data.adapters.openmeteo import OpenMeteoAdapter
from openwind_data.currents.marc_atlas import MarcAtlasRegistry
from openwind_data.currents.shom_c2d_registry import ShomC2dRegistry

REPO_ROOT = Path(__file__).resolve().parents[1]
MARC_DIR = REPO_ROOT / "build" / "marc"
SHOM_DIR = REPO_ROOT / "build" / "shom_c2d"
OUT_DIR = REPO_ROOT / "docs" / "bench"

# Bench parameters.
SAMPLE_SIZE = 120  # points uniformly sampled across SHOM zones
HOURS_PER_POINT = 24
BASE_TIME = datetime(2026, 5, 15, 0, 0, tzinfo=UTC)  # mid-vives-eaux period
RANDOM_SEED = 42  # reproducible sampling


def _wrap_180(deg: float) -> float:
    """Wrap an angular delta into [-180, 180]."""
    return ((deg + 180.0) % 360.0) - 180.0


def _dir_delta(a: float, b: float) -> float:
    """Smallest unsigned angular distance between two compass bearings (deg)."""
    return abs(_wrap_180(a - b))


def _sample_points(shom: ShomC2dRegistry, n: int) -> list[tuple[float, float, str, str]]:
    """Spread the sample across SHOM zones so no single zone dominates.

    Returns a list of ``(lat, lon, atlas_id, zone)`` tuples. We take
    roughly ``n / number_of_zones`` per zone (rounded up) then truncate
    to ``n``, so zones with few points contribute proportionally less
    while every zone gets at least one representative.
    """
    rng = random.Random(RANDOM_SEED)
    by_zone: dict[tuple[int, str], list[int]] = {}
    for i, key in enumerate(zip(shom.atlas_ids, shom.zone_names, strict=True)):
        by_zone.setdefault((int(key[0]), str(key[1])), []).append(i)
    zones = sorted(by_zone)
    per_zone = max(1, n // len(zones) + 1)
    picked: list[int] = []
    for zone_key in zones:
        pool = by_zone[zone_key]
        k = min(per_zone, len(pool))
        picked.extend(rng.sample(pool, k))
    rng.shuffle(picked)
    picked = picked[:n]
    return [
        (
            float(shom.lats[i]),
            float(shom.lons[i]),
            str(shom.atlas_ids[i]),
            str(shom.zone_names[i]),
        )
        for i in picked
    ]


async def _smoc_speeds_dirs(
    upstream: OpenMeteoAdapter,
    lat: float,
    lon: float,
    times: list[datetime],
) -> tuple[list[float | None], list[float | None]]:
    """Fetch SMOC currents from Open-Meteo at all ``times`` for (lat, lon).

    The Open-Meteo adapter returns a SeaSeries whose points carry both
    speed and direction. Times are matched by exact timestamp; missing
    timestamps yield ``None`` (rare; usually a coverage edge).
    """
    bundle = await upstream.fetch(lat, lon, times[0], times[-1])
    sea_by_time = {p.time: p for p in bundle.sea.points}
    speeds: list[float | None] = []
    dirs: list[float | None] = []
    for t in times:
        p = sea_by_time.get(t)
        if p is None or p.current_speed_kn is None or p.current_direction_to_deg is None:
            speeds.append(None)
            dirs.append(None)
        else:
            speeds.append(float(p.current_speed_kn))
            dirs.append(float(p.current_direction_to_deg))
    return speeds, dirs


async def _bench_point(
    lat: float,
    lon: float,
    atlas_id: str,
    zone: str,
    times: list[datetime],
    shom: ShomC2dRegistry,
    marc: MarcAtlasRegistry,
    upstream: OpenMeteoAdapter,
) -> dict | None:
    """Run the 3 predictors at one point. Returns None if any source misses."""
    shom_out = shom.predict_current_series(lat, lon, times)
    marc_out = marc.predict_current_series(lat, lon, times)
    if shom_out is None or marc_out is None:
        return None
    shom_speeds, shom_dirs, shom_source = shom_out
    marc_speeds, marc_dirs, marc_source = marc_out
    try:
        smoc_speeds, smoc_dirs = await _smoc_speeds_dirs(upstream, lat, lon, times)
    except Exception as exc:  # pragma: no cover — diagnostic path
        print(f"  SMOC fetch failed at ({lat}, {lon}): {exc}")
        return None
    if any(v is None for v in smoc_speeds):
        return None

    return {
        "lat": lat,
        "lon": lon,
        "atlas_id": atlas_id,
        "zone": zone,
        "shom_source": shom_source,
        "marc_source": marc_source,
        "shom_speed_kn": [float(v) for v in shom_speeds],
        "marc_speed_kn": [float(v) for v in marc_speeds],
        "smoc_speed_kn": smoc_speeds,
        "shom_dir_to_deg": [float(v) for v in shom_dirs],
        "marc_dir_to_deg": [float(v) for v in marc_dirs],
        "smoc_dir_to_deg": smoc_dirs,
    }


def _summarise(records: list[dict]) -> dict:
    """Aggregate the per-point timeseries into pairwise delta statistics.

    For each pair (SHOM-MARC, SHOM-SMOC, MARC-SMOC) we report the mean,
    median, 95th-percentile and max of |speed_a - speed_b| and of the
    direction delta wrapped to [0, 180].
    """
    pairs = (
        ("shom_vs_marc", "shom_speed_kn", "marc_speed_kn", "shom_dir_to_deg", "marc_dir_to_deg"),
        ("shom_vs_smoc", "shom_speed_kn", "smoc_speed_kn", "shom_dir_to_deg", "smoc_dir_to_deg"),
        ("marc_vs_smoc", "marc_speed_kn", "smoc_speed_kn", "marc_dir_to_deg", "smoc_dir_to_deg"),
    )
    out: dict[str, dict[str, float | int]] = {}
    for name, sa, sb, da, db in pairs:
        speed_deltas: list[float] = []
        dir_deltas: list[float] = []
        for r in records:
            speed_a = r[sa]
            speed_b = r[sb]
            dir_a = r[da]
            dir_b = r[db]
            for va, vb, ang_a, ang_b in zip(speed_a, speed_b, dir_a, dir_b, strict=True):
                speed_deltas.append(abs(va - vb))
                # Only count direction deltas where both speeds are meaningful
                # (≥ 0.2 kt). Direction is meaningless at near-zero speed and
                # would otherwise spike the percentiles with noise.
                if min(va, vb) >= 0.2:
                    dir_deltas.append(_dir_delta(ang_a, ang_b))
        out[name] = {
            "n_speed": len(speed_deltas),
            "speed_mean_kn": statistics.mean(speed_deltas),
            "speed_median_kn": statistics.median(speed_deltas),
            "speed_p95_kn": float(np.percentile(speed_deltas, 95)),
            "speed_max_kn": max(speed_deltas),
            "n_dir": len(dir_deltas),
            "dir_mean_deg": statistics.mean(dir_deltas) if dir_deltas else float("nan"),
            "dir_median_deg": statistics.median(dir_deltas) if dir_deltas else float("nan"),
            "dir_p95_deg": float(np.percentile(dir_deltas, 95)) if dir_deltas else float("nan"),
        }
    return out


def _write_markdown(records: list[dict], summary: dict, out_path: Path) -> None:
    """Render a human-readable bench summary alongside the raw JSON.

    Includes the global aggregate table, a per-atlas-id breakdown of the
    decisive ``marc_vs_smoc`` delta, and a short interpretation block.
    """
    by_atlas: dict[str, dict[str, list[float]]] = {}
    for r in records:
        bucket = by_atlas.setdefault(r["atlas_id"], {"speed_deltas": []})
        for va, vb in zip(r["marc_speed_kn"], r["smoc_speed_kn"], strict=True):
            bucket["speed_deltas"].append(abs(va - vb))

    lines: list[str] = [
        "# OhMyWind currents bench: SHOM vs MARC vs SMOC",
        "",
        f"- Sample: {len(records)} SHOM-covered points, {HOURS_PER_POINT} hourly snapshots each",
        f"- Date window: {BASE_TIME.isoformat()} + {HOURS_PER_POINT} h",
        f"- Random seed: {RANDOM_SEED}",
        "",
        "## Pairwise speed disagreement (knots)",
        "",
        "| Pair | n | mean | median | p95 | max |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for pair, stats in summary.items():
        lines.append(
            f"| {pair} | {stats['n_speed']} "
            f"| {stats['speed_mean_kn']:.3f} "
            f"| {stats['speed_median_kn']:.3f} "
            f"| {stats['speed_p95_kn']:.3f} "
            f"| {stats['speed_max_kn']:.3f} |"
        )
    lines += [
        "",
        "## Pairwise direction disagreement (degrees, restricted to speeds ≥ 0.2 kt)",
        "",
        "| Pair | n | mean | median | p95 |",
        "|---|---:|---:|---:|---:|",
    ]
    for pair, stats in summary.items():
        lines.append(
            f"| {pair} | {stats['n_dir']} "
            f"| {stats['dir_mean_deg']:.1f} "
            f"| {stats['dir_median_deg']:.1f} "
            f"| {stats['dir_p95_deg']:.1f} |"
        )
    lines += [
        "",
        "## MARC vs SMOC delta by SHOM atlas",
        "",
        "Per-atlas breakdown of the |MARC - SMOC| speed delta. Atlases",
        "where this is large are zones where MARC adds something over",
        "SMOC; atlases where it is small are zones where MARC duplicates",
        "SMOC and the 5 GB payload pays for nothing.",
        "",
        "| Atlas | n | mean | median | p95 |",
        "|---|---:|---:|---:|---:|",
    ]
    for atlas in sorted(by_atlas):
        deltas = by_atlas[atlas]["speed_deltas"]
        lines.append(
            f"| {atlas} | {len(deltas)} "
            f"| {statistics.mean(deltas):.3f} "
            f"| {statistics.median(deltas):.3f} "
            f"| {float(np.percentile(deltas, 95)):.3f} |"
        )
    lines += [
        "",
        "## Interpretation",
        "",
        "- **SHOM vs MARC**: tells us whether the MARC harmonic engine reproduces",
        "  the SHOM reference. Small delta → MARC is calibrated and the issue (if",
        "  any) is purely about resolution sub-grid effects, not the predictor.",
        "- **SHOM vs SMOC**: SMOC = harmonic + wind-driven + Stokes. The delta",
        "  here mixes SMOC's harmonic skill and the contribution of wind setup.",
        "  Not a pure error metric.",
        "- **MARC vs SMOC** (the decisive one): if this is small everywhere,",
        "  MARC's marginal value over SMOC outside SHOM coverage is questionable",
        "  and Step 3 should be 'drop MARC' rather than 'quantize MARC'. If",
        "  large, we need HF radar Iroise (Phase 2b) to decide which is closer",
        "  to truth.",
        "",
    ]
    out_path.write_text("\n".join(lines))


async def main() -> None:
    if not MARC_DIR.exists():
        raise SystemExit(f"MARC atlases not found at {MARC_DIR}")
    if not (SHOM_DIR / "shom_c2d_points.parquet").exists():
        raise SystemExit(f"SHOM artefacts not found at {SHOM_DIR}; run build_shom_c2d.py first")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    shom = ShomC2dRegistry.from_directory(SHOM_DIR)
    marc = MarcAtlasRegistry.from_directory(MARC_DIR)
    if shom.lats.size == 0:
        raise SystemExit("SHOM registry empty")
    if not marc.atlases:
        raise SystemExit("MARC registry empty")
    print(f"SHOM: {shom.lats.size} points, MARC: {len(marc.atlases)} atlases")

    points = _sample_points(shom, SAMPLE_SIZE)
    times = [BASE_TIME + timedelta(hours=h) for h in range(HOURS_PER_POINT)]
    print(f"Bench: {len(points)} points x {len(times)} times = {len(points) * len(times)} datapoints")

    upstream = OpenMeteoAdapter()
    records: list[dict] = []
    try:
        for i, (lat, lon, atlas_id, zone) in enumerate(points):
            if i and i % 10 == 0:
                print(f"  {i}/{len(points)}  records so far={len(records)}")
            rec = await _bench_point(lat, lon, atlas_id, zone, times, shom, marc, upstream)
            if rec is not None:
                records.append(rec)
    finally:
        # OpenMeteoAdapter doesn't expose aclose(); call it only if present
        # so the script works against future adapter variants that do.
        if hasattr(upstream, "aclose"):
            await upstream.aclose()

    if not records:
        raise SystemExit("No usable records — all points dropped (coverage gaps?)")

    summary = _summarise(records)
    stamp = datetime.now(UTC).strftime("%Y-%m-%d_%H%M")
    json_path = OUT_DIR / f"currents_3way_{stamp}.json"
    md_path = OUT_DIR / f"currents_3way_{stamp}.md"
    json_path.write_text(json.dumps({"summary": summary, "records": records}, indent=2))
    _write_markdown(records, summary, md_path)
    print(f"\nWrote {json_path}")
    print(f"Wrote {md_path}")

    # Echo the headline numbers to the terminal for quick eyeballing.
    print("\n=== Pairwise speed disagreement (kt) ===")
    print(f"{'pair':18s} {'n':>5s} {'mean':>7s} {'median':>7s} {'p95':>7s} {'max':>7s}")
    for pair, stats in summary.items():
        print(
            f"{pair:18s} {stats['n_speed']:5d} "
            f"{stats['speed_mean_kn']:7.3f} {stats['speed_median_kn']:7.3f} "
            f"{stats['speed_p95_kn']:7.3f} {stats['speed_max_kn']:7.3f}"
        )


if __name__ == "__main__":
    # Polars import is at top to keep build_shom_c2d-style consistency even
    # though this script doesn't use it directly — it would if we extended to
    # writing per-record Parquet output.
    _ = pl  # silence "imported but unused" linter without removing the dep marker
    asyncio.run(main())
