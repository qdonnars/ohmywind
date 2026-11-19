#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars
"""Run the auto-route spike on the validation cases and draw one PNG per case.

For each case: the route on the fine shoreline (OSM) with EMODnet depths, the
route on today's server mask (Natural Earth ~1 km, no depth) and on GSHHG
full with depths, the straight line, timings and peak memory of the engine.
Writes ``<out>/<case>.png`` and ``<out>/results.json``.

Run from ``packages/data-adapters`` with
``uv run --with matplotlib python ../../scripts/spike_auto_route/run_cases.py``.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import tracemalloc
from dataclasses import asdict, replace
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cases import CASES, Case

from openwind_data.routing.auto_route import NavGrid, RouteParams, suggest_route
from openwind_data.routing.geometry import Point

DATA = Path.home() / "ohmywind-route-spike-data"
OUT = Path("/home/qdonnars/projects/open_wind/plan/spikes/auto-route-2026-11")
QCOL = {"fine": "#1a9850", "coarse": "#f28e2b", "unknown": "#7f7f7f"}


def load(case: Case, coast: str, *, depth: bool, pitch: int = 45) -> NavGrid:
    z = np.load(DATA / "grids" / f"{case.key.split('_')[0]}_{pitch}m.npz")
    lat0, lon0, dlat, dlon, _n_lat, n_lon = z["meta"]
    land = np.unpackbits(z[f"land_{coast}"], axis=1)[:, : int(n_lon)].astype(bool)
    elev = z["elev"]
    return NavGrid(
        lat0=float(lat0),
        lon0=float(lon0),
        dlat=float(dlat),
        dlon=float(dlon),
        land=land,
        depth=(-elev).astype(np.float32) if depth else None,
        coast_source=coast,
        depth_source="EMODnet DTM (LAT)" if depth else "",
        depth_pitch_m=115.0,
    )


def run(case: Case, coast: str, depth: bool, params: RouteParams, via=None):
    """Route once untraced for the time, then again under tracemalloc for the peak.

    tracemalloc slows the A* loop (a dict and a tuple per pixel) by an order of
    magnitude, so the two are measured apart.
    """
    args = (
        Point(*case.start),
        Point(*case.end),
        [Point(*v) for v in (case.via if via is None else via)],
        params,
    )
    grid = load(case, coast, depth=depth)
    t0 = time.perf_counter()
    route = suggest_route(grid, *args)
    wall = time.perf_counter() - t0
    grid2 = load(case, coast, depth=depth)
    tracemalloc.start()
    suggest_route(grid2, *args)
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    return grid, route, wall, peak / 1e6


def seamarks(case: Case) -> list[tuple[float, float, str]]:
    """OpenSeaMap danger nodes (rock, wreck, obstruction, cardinal and isolated-danger marks)."""
    path = DATA / "osm_seamarks" / f"{case.key.split('_')[0]}.json"
    if not path.exists():
        return []
    try:
        els = json.loads(path.read_text())["elements"]
    except (ValueError, KeyError):
        return []
    return [(e["lat"], e["lon"], e["tags"].get("seamark:type", "")) for e in els if "lat" in e]


def danger_distance(route, marks) -> tuple[float | None, tuple | None]:
    """Smallest distance in metres from the route to a rock, wreck or obstruction node."""
    pts = [(la, lo) for la, lo, t in marks if t in ("rock", "wreck", "obstruction")]
    if route is None or not pts:
        return None, None
    best, where = float("inf"), None
    for a, b in zip(route.waypoints, route.waypoints[1:], strict=False):
        t = np.linspace(0, 1, 400)
        la = a.lat + t * (b.lat - a.lat)
        lo = a.lon + t * (b.lon - a.lon)
        for pla, plo in pts:
            d = np.hypot((la - pla) * 111_195, (lo - plo) * 111_195 * np.cos(np.radians(pla)))
            k = float(d.min())
            if k < best:
                best, where = k, (pla, plo)
    return round(best), where


def summary(route, wall, peak) -> dict:
    if route is None:
        return {"ok": False, "wall_s": round(wall, 2), "peak_mb": round(peak, 1)}
    legs = [asdict(leg) for leg in route.legs]
    q = {k: round(sum(leg.length_nm for leg in route.legs if leg.quality == k), 2) for k in QCOL}
    return {
        "ok": True,
        "distance_nm": route.distance_nm,
        "straight_nm": route.straight_nm,
        "waypoints": len(route.waypoints),
        "wall_s": round(wall, 2),
        "peak_mb": round(peak, 1),
        "timings": route.timings_s,
        "snapped_m": route.snapped_m,
        "depth_relaxed": route.depth_relaxed,
        "notes": route.notes,
        "quality_nm": q,
        "min_depth_m": min(
            (leg.min_depth_m for leg in route.legs if leg.min_depth_m is not None), default=None
        ),
        "legs_below_draft": [leg.index for leg in route.legs if leg.below_draft],
        "min_shore_m": min(leg.min_shore_m for leg in route.legs),
        "legs": legs,
        "points": [[round(w.lat, 5), round(w.lon, 5)] for w in route.waypoints],
    }


def draw(case: Case, grid: NavGrid, runs: dict, path: Path, *, title_extra: str = "", zoom=None):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.lines import Line2D

    n_lat, n_lon = grid.shape
    lats = grid.lat0 + (np.arange(n_lat) + 0.5) * grid.dlat
    lons = grid.lon0 + (np.arange(n_lon) + 0.5) * grid.dlon
    pts = [case.start, case.end, *case.via]
    for r in runs.values():
        if r["route"] is not None:
            pts += [(w.lat, w.lon) for w in r["route"].waypoints]
    arr = np.array(pts)
    if zoom is None:
        pad_lat = max(0.03, 0.12 * np.ptp(arr[:, 0]))
        pad_lon = max(0.03, 0.12 * np.ptp(arr[:, 1]))
        la0, la1 = arr[:, 0].min() - pad_lat, arr[:, 0].max() + pad_lat
        lo0, lo1 = arr[:, 1].min() - pad_lon, arr[:, 1].max() + pad_lon
    else:
        la0, lo0, la1, lo1 = zoom
    rs = slice(max(0, int((la0 - grid.lat0) / grid.dlat)), int((la1 - grid.lat0) / grid.dlat) + 1)
    cs = slice(max(0, int((lo0 - grid.lon0) / grid.dlon)), int((lo1 - grid.lon0) / grid.dlon) + 1)
    sub_land = grid.land[rs, cs]
    sl, so = lats[rs], lons[cs]
    aspect = 1.0 / np.cos(np.radians(0.5 * (la0 + la1)))
    w = 11.0
    h = max(5.5, min(14.0, w * (la1 - la0) * aspect / (lo1 - lo0) + 2.2))
    fig, ax = plt.subplots(figsize=(w, h), dpi=110)
    ax.set_facecolor("#eaf3fb")
    ax.contourf(so, sl, sub_land.astype(float), levels=[0.5, 1.5], colors=["#d9d2c3"])
    ne = runs.get("ne")
    if ne is not None:
        ax.contour(
            so,
            sl,
            ne["grid"].land[rs, cs].astype(float),
            levels=[0.5],
            colors="#8c564b",
            linewidths=0.7,
            linestyles=":",
        )
    if grid.depth is not None:
        dep = grid.depth[rs, cs]
        cs_ = ax.contour(
            so,
            sl,
            np.where(sub_land, np.nan, dep),
            levels=[0, 2, 5, 10, 20],
            colors=["#08306b", "#2171b5", "#4292c6", "#9ecae1", "#c6dbef"],
            linewidths=0.6,
        )
        ax.clabel(cs_, fmt="%d m", fontsize=6, inline=True)
    ax.plot(
        [case.start[1], case.end[1]],
        [case.start[0], case.end[0]],
        "--",
        color="#d62728",
        lw=1.2,
        label="ligne droite",
    )
    styles = {
        "ne": dict(color="#9467bd", lw=1.4, ls="-.", label="masque actuel ~1 km, sans sonde"),
        "gshhg": dict(color="#17becf", lw=1.2, ls=(0, (4, 2)), label="GSHHG full + EMODnet"),
    }
    for key, st in styles.items():
        r = runs.get(key)
        if r is not None and r["route"] is not None:
            wp = r["route"].waypoints
            ax.plot([q.lon for q in wp], [q.lat for q in wp], **st)
    main = runs["main"]["route"]
    if main is not None:
        wp = main.waypoints
        for leg, a, b in zip(main.legs, wp, wp[1:], strict=False):
            ax.plot(
                [a.lon, b.lon],
                [a.lat, b.lat],
                color=QCOL[leg.quality],
                lw=2.4,
                solid_capstyle="round",
                zorder=5,
            )
            if leg.below_draft and leg.min_depth_at:
                ax.plot(
                    leg.min_depth_at[1],
                    leg.min_depth_at[0],
                    "x",
                    color="#b2182b",
                    ms=8,
                    mew=2,
                    zorder=7,
                )
                ax.annotate(
                    f"{leg.min_depth_m:.1f} m",
                    (leg.min_depth_at[1], leg.min_depth_at[0]),
                    fontsize=7,
                    color="#b2182b",
                    xytext=(4, 4),
                    textcoords="offset points",
                    zorder=7,
                )
        ax.plot([q.lon for q in wp], [q.lat for q in wp], "o", color="k", ms=3, zorder=6)
    marks = seamarks(case)
    for la, lo, t in marks:
        if t in ("rock", "wreck", "obstruction"):
            ax.plot(lo, la, "+", color="#111", ms=5, mew=1.0, zorder=4)
        else:
            ax.plot(lo, la, "^", color="#ffbf00", mec="#333", ms=4, mew=0.5, zorder=4)
    for v in case.via:
        ax.plot(v[1], v[0], "D", color="#e377c2", ms=7, zorder=8)
    ax.plot(case.start[1], case.start[0], "^", color="k", ms=8, zorder=8)
    ax.plot(case.end[1], case.end[0], "s", color="k", ms=7, zorder=8)
    ax.set_xlim(lo0, lo1)
    ax.set_ylim(la0, la1)
    ax.set_aspect(aspect)
    handles = [
        Line2D([], [], color="#d62728", ls="--", label="ligne droite"),
        Line2D([], [], color=QCOL["fine"], lw=2.4, label="route OSM + EMODnet : fine (suffisante)"),
        Line2D([], [], color=QCOL["coarse"], lw=2.4, label="route OSM + EMODnet : grossiere"),
        Line2D([], [], color=QCOL["unknown"], lw=2.4, label="route OSM + EMODnet : inconnue"),
    ]
    for key, st in styles.items():
        if key in runs:
            handles.append(Line2D([], [], **st))
    handles.append(Line2D([], [], color="#8c564b", ls=":", label="trait du masque actuel"))
    handles.append(
        Line2D(
            [],
            [],
            color="#111",
            marker="+",
            ls="",
            label="roche / epave / obstruction (OpenSeaMap)",
        )
    )
    handles.append(
        Line2D(
            [],
            [],
            color="#ffbf00",
            marker="^",
            mec="#333",
            ls="",
            label="balise cardinale ou de danger isole (OpenSeaMap)",
        )
    )
    handles.append(
        Line2D(
            [],
            [],
            color="#b2182b",
            marker="x",
            ls="",
            label="sonde < tirant d'eau + marge (zero des cartes)",
        )
    )
    ax.legend(
        handles=handles,
        fontsize=7,
        loc="upper center",
        bbox_to_anchor=(0.5, -0.06),
        ncol=3,
        framealpha=0.9,
    )
    s = runs["main"]["summary"]
    sub = (
        f"OSM+EMODnet : {s.get('distance_nm', '-')} nm, {s.get('waypoints', '-')} pts, "
        f"{s['wall_s']} s, pic {s['peak_mb']} Mo | ligne droite {s.get('straight_nm', '-')} nm"
    )
    ax.set_title(f"{case.label}{title_extra}\n{sub}", fontsize=9)
    if zoom is not None:
        for leg, a, b in zip(
            main.legs if main else [],
            main.waypoints if main else [],
            main.waypoints[1:] if main else [],
            strict=False,
        ):
            mlat, mlon = 0.5 * (a.lat + b.lat), 0.5 * (a.lon + b.lon)
            if la0 < mlat < la1 and lo0 < mlon < lo1:
                ax.annotate(
                    f"t{leg.index}: {leg.min_shore_m} m de la cote, sonde min "
                    f"{leg.min_depth_m if leg.min_depth_m is not None else '-'} m",
                    (mlon, mlat),
                    fontsize=6.5,
                    color="#333",
                    xytext=(6, -10),
                    textcoords="offset points",
                    zorder=9,
                    bbox=dict(boxstyle="round,pad=0.2", fc="white", alpha=0.7, lw=0),
                )
    ax.tick_params(labelsize=7)
    ax.grid(alpha=0.25, lw=0.4)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--tag", default="")
    ap.add_argument("--weight", type=float, default=1.0)
    args = ap.parse_args(argv)
    args.out.mkdir(parents=True, exist_ok=True)
    params = RouteParams(heuristic_weight=args.weight)
    results = {}
    for case in CASES:
        if args.only and case.key not in args.only:
            continue
        runs = {}
        plan = [
            ("main", case.coast, True),
            ("ne", "ne", False),
            ("gshhg", "gshhg", True),
            ("main_nodepth", case.coast, False),
        ]
        if case.coast != "osm":
            plan.append(("osm", "osm", True))
        cparams = replace(params, water_level_m=case.water_level)
        for key, coast, depth in plan:
            grid, route, wall, peak = run(case, coast, depth, cparams)
            runs[key] = {"grid": grid, "route": route, "summary": summary(route, wall, peak)}
        dd, dwhere = danger_distance(runs["main"]["route"], seamarks(case))
        runs["main"]["summary"]["seamark_danger_min_m"] = dd
        runs["main"]["summary"]["seamark_danger_at"] = dwhere
        results[case.key] = {k: v["summary"] for k, v in runs.items()}
        draw(case, runs["main"]["grid"], runs, args.out / f"{case.key}{args.tag}.png")
        for zname, zb in case.zooms.items():
            draw(
                case,
                runs["main"]["grid"],
                runs,
                args.out / f"{case.key}_{zname}{args.tag}.png",
                title_extra=f" (zoom {zname})",
                zoom=zb,
            )
        s = runs["main"]["summary"]
        print(
            f"{case.key:10s} osm {s.get('distance_nm')} nm / {s.get('straight_nm')} straight, "
            f"{s.get('waypoints')} wp {s.get('timings')}, {s['wall_s']} s, {s['peak_mb']} MB, "
            f"q={s.get('quality_nm')}, min depth {s.get('min_depth_m')}, "
            f"below {s.get('legs_below_draft')}, snapped {s.get('snapped_m')}, "
            f"relaxed {s.get('depth_relaxed')} seamark {s.get('seamark_danger_min_m')} | ne {runs['ne']['summary'].get('distance_nm')} "
            f"| gshhg {runs['gshhg']['summary'].get('distance_nm')}",
            flush=True,
        )
    path = args.out / f"results{args.tag}.json"
    old = json.loads(path.read_text()) if path.exists() else {}
    old.update(results)
    path.write_text(json.dumps(old, indent=1, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
