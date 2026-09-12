"""Resolution bench: is the SHOM C2D nearest-point rule or the MARC grid closer?

The currents cascade puts SHOM Atlas C2D first wherever one of its ~13 k
hand-placed points lies within 5 km, MARC PREVIMER (250 m to 2 km grids)
next, Open-Meteo SMOC last. That order was chosen on authority ("SHOM is the
French reference"), not measured. Two things pull the other way:

- SHOM answers with the value *at its nearest point*, up to 5 km away. In a
  race with strong lateral shear that can be the current of the race pasted
  onto a sheltered cove next door.
- MARC answers *at the query cell*, but a 250 m grid in a 900 m goulet
  averages the axis peak with the slack edges.

Nobody has ground truth here (no HF radar, no ADCP), so this bench does not
say who is right. It measures where and how much the two disagree, as a
function of the one quantity the cascade could actually switch on: the
distance to the nearest SHOM point. Three tables:

1. **By distance bucket**, over query points scattered around SHOM points on
   the whole shelf: |speed| delta, peak ratio, direction delta. If the
   disagreement grows with distance, the 5 km rule is the thing to tighten.
2. **Named passes**, on the channel axis: spring-tide peak from each source,
   nearest SHOM distance, and the timing offset of slack waters and peaks in
   minutes at a 10-minute step. That is what a sailor feels.
3. **Threshold what-if**: share of the (wet) shelf that SHOM would serve at
   0.5 / 1 / 1.5 / 2 / 3 / 5 km.

Local only: MARC atlases in ``build/marc/``, SHOM artefacts in
``build/shom_c2d/``. No network. Output: ``docs/bench/currents_resolution_<stamp>.{json,md}``.

Run from repo root::

    packages/data-adapters/.venv/bin/python scripts/bench_currents_resolution.py
"""

from __future__ import annotations

import json
import math
import random
import statistics
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np

from openwind_data.currents.marc_atlas import MarcAtlasRegistry
from openwind_data.currents.shom_c2d_registry import ShomC2dRegistry

REPO_ROOT = Path(__file__).resolve().parents[1]
MARC_DIR = REPO_ROOT / "build" / "marc"
SHOM_DIR = REPO_ROOT / "build" / "shom_c2d"
OUT_DIR = REPO_ROOT / "docs" / "bench"

# Spring tide: 2026-09-12 runs at coefficient 97 (Brest-anchored, read off
# the dev Space the day this bench was written). 25 h covers two full cycles.
BASE_TIME = datetime(2026, 9, 12, 0, 0, tzinfo=UTC)
HOURLY = [BASE_TIME + timedelta(hours=h) for h in range(25)]
TEN_MIN = [BASE_TIME + timedelta(minutes=10 * i) for i in range(151)]

RANDOM_SEED = 42
BUCKETS_KM: list[tuple[float, float]] = [(0, 0.5), (0.5, 1), (1, 2), (2, 3), (3, 5)]
PER_BUCKET = 150
SHELF_SAMPLE = 1500
THRESHOLDS_KM = [0.5, 1.0, 1.5, 2.0, 3.0, 5.0]

# A query point whose MARC cell sits further than this is on land (the
# registry falls back to the nearest wet cell); such points are dropped from
# the shelf samples and flagged in the passes table.
WET_CELL_MAX_KM = 0.4

# Channel-axis points. Coordinates picked by hand on the axis of each pass;
# the MARC cell distance in the output says whether the pick landed in water.
PASSES: list[tuple[str, float, float]] = [
    ("Goulet du Morbihan (Port-Navalo)", 47.548, -2.924),
    ("Passage de la Teignouse", 47.455, -3.045),
    ("Courreaux de Groix", 47.620, -3.350),
    ("Goulet de Brest", 48.340, -4.565),
    ("Chenal du Four", 48.430, -4.800),
    ("Chenal de la Helle", 48.470, -4.950),
    ("Passage du Fromveur", 48.450, -5.030),
    ("Raz de Sein", 48.035, -4.770),
    ("Raz Blanchard", 49.720, -2.000),
    ("Raz de Barfleur", 49.700, -1.200),
    ("Saint-Malo, Petite Porte", 48.660, -2.050),
    ("Pertuis d'Antioche", 46.050, -1.300),
    ("Pertuis de Maumusson", 45.790, -1.240),
    ("Pas de Calais (Gris-Nez)", 50.880, 1.550),
]


def _wrap_180(deg: float) -> float:
    return ((deg + 180.0) % 360.0) - 180.0


def _dir_delta(a: float, b: float) -> float:
    return abs(_wrap_180(a - b))


def _offset(lat: float, lon: float, km: float, bearing_deg: float) -> tuple[float, float]:
    """Move (lat, lon) by ``km`` along ``bearing`` on a local tangent plane."""
    dlat = km * math.cos(math.radians(bearing_deg)) / 111.0
    dlon = km * math.sin(math.radians(bearing_deg)) / (111.0 * math.cos(math.radians(lat)))
    return lat + dlat, lon + dlon


def _km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    dlat = (lat2 - lat1) * 111.0
    dlon = (lon2 - lon1) * 111.0 * math.cos(math.radians((lat1 + lat2) / 2))
    return math.hypot(dlat, dlon)


def _both(
    shom: ShomC2dRegistry,
    marc: MarcAtlasRegistry,
    lat: float,
    lon: float,
    times: list[datetime],
) -> dict | None:
    """SHOM and MARC series at one point, or None when either is missing."""
    cell = marc.cell_at(lat, lon)
    if cell is None:
        return None
    m = marc.predict_current_series(lat, lon, times)
    s = shom.predict_current_series(lat, lon, times)
    if m is None or s is None:
        return None
    idx, d_shom = shom._nearest(lat, lon)
    if idx is None:
        return None
    return {
        "lat": lat,
        "lon": lon,
        "shom_km": float(d_shom),
        "shom_source": s[2],
        "marc_atlas": m[2],
        "marc_cell_km": _km(lat, lon, cell.lat, cell.lon),
        "shom_speed": [float(v) for v in s[0]],
        "shom_dir": [float(v) for v in s[1]],
        "marc_speed": [float(v) for v in m[0]],
        "marc_dir": [float(v) for v in m[1]],
    }


# ── 1. Distance buckets ──────────────────────────────────────────────────────


def _bucket_of(km: float) -> int | None:
    for i, (lo, hi) in enumerate(BUCKETS_KM):
        if lo <= km < hi:
            return i
    return None


def _sample_buckets(shom: ShomC2dRegistry, marc: MarcAtlasRegistry) -> list[dict]:
    """Query points scattered around SHOM points, ``PER_BUCKET`` per distance bucket.

    Anchors are SHOM points drawn at random; the query is the anchor moved
    by a random distance up to 6 km on a random bearing. The bucket is read
    off the *actual* nearest SHOM distance (another point may be closer than
    the anchor), so the histogram is of what the cascade would see.
    """
    rng = random.Random(RANDOM_SEED)
    n_pts = int(shom.lats.size)
    filled: list[list[dict]] = [[] for _ in BUCKETS_KM]
    tries = 0
    while any(len(b) < PER_BUCKET for b in filled) and tries < 40_000:
        tries += 1
        i = rng.randrange(n_pts)
        km = rng.uniform(0.0, 6.0)
        lat, lon = _offset(float(shom.lats[i]), float(shom.lons[i]), km, rng.uniform(0, 360))
        rec = _both(shom, marc, lat, lon, HOURLY)
        if rec is None or rec["marc_cell_km"] > WET_CELL_MAX_KM:
            continue
        b = _bucket_of(rec["shom_km"])
        if b is None or len(filled[b]) >= PER_BUCKET:
            continue
        rec["bucket"] = b
        filled[b].append(rec)
    return [r for b in filled for r in b]


def _bucket_stats(records: list[dict]) -> list[dict]:
    out = []
    for b, (lo, hi) in enumerate(BUCKETS_KM):
        rs = [r for r in records if r["bucket"] == b]
        speed_d: list[float] = []
        dir_d: list[float] = []
        ratios: list[float] = []
        marc_higher = 0
        for r in rs:
            sp = max(r["shom_speed"])
            mp = max(r["marc_speed"])
            if sp >= 0.3:
                ratios.append(mp / sp)
            if mp > sp:
                marc_higher += 1
            for a, bb, da, db in zip(
                r["shom_speed"], r["marc_speed"], r["shom_dir"], r["marc_dir"], strict=True
            ):
                speed_d.append(abs(a - bb))
                if min(a, bb) >= 0.3:
                    dir_d.append(_dir_delta(da, db))
        out.append(
            {
                "bucket": f"{lo:g} à {hi:g} km",
                "n_points": len(rs),
                "speed_mean": statistics.mean(speed_d) if speed_d else float("nan"),
                "speed_median": statistics.median(speed_d) if speed_d else float("nan"),
                "speed_p95": float(np.percentile(speed_d, 95)) if speed_d else float("nan"),
                "peak_ratio_median": statistics.median(ratios) if ratios else float("nan"),
                "marc_higher_share": marc_higher / len(rs) if rs else float("nan"),
                "dir_median": statistics.median(dir_d) if dir_d else float("nan"),
                "dir_p95": float(np.percentile(dir_d, 95)) if dir_d else float("nan"),
            }
        )
    return out


# ── 2. Named passes ──────────────────────────────────────────────────────────


def _turning_points(speed: list[float], kind: str) -> list[int]:
    """Indices of the slack waters ("slack") or peaks ("peak") of a speed series.

    Local extrema, kept only when prominent (a peak above 60 % of the series
    maximum, a slack below 40 % of it), then one per 3 h cluster: SHOM's
    piecewise-linear series has flat segments and MARC's harmonic sum has
    ripples, and either would otherwise count as a turn.
    """
    top = max(speed)
    cands = []
    for i in range(1, len(speed) - 1):
        a, b, c = speed[i - 1], speed[i], speed[i + 1]
        if kind == "peak" and b > a and b >= c and b >= 0.6 * top:
            cands.append(i)
        elif kind == "slack" and b < a and b <= c and b <= 0.4 * top:
            cands.append(i)
    out: list[int] = []
    for i in cands:
        if out and i - out[-1] <= 18:
            better = speed[i] > speed[out[-1]] if kind == "peak" else speed[i] < speed[out[-1]]
            if better:
                out[-1] = i
        else:
            out.append(i)
    return out


def _timing_offset_min(shom_speed: list[float], marc_speed: list[float], kind: str) -> float:
    """Mean |Δt| in minutes between matched SHOM and MARC turning points.

    Each SHOM turning point is matched to the nearest MARC one within 3 h;
    unmatched ones are ignored. Series are at a 10-minute step.
    """
    s_idx = _turning_points(shom_speed, kind)
    m_idx = _turning_points(marc_speed, kind)
    if not s_idx or not m_idx:
        return float("nan")
    offsets = []
    for i in s_idx:
        j = min(m_idx, key=lambda k: abs(k - i))
        if abs(j - i) <= 18:
            offsets.append(abs(j - i) * 10.0)
    return statistics.mean(offsets) if offsets else float("nan")


def _marc_peak_around(marc: MarcAtlasRegistry, lat: float, lon: float, radius_km: float) -> float:
    """Highest MARC spring peak on a 125 m lattice within ``radius_km`` of (lat, lon).

    Says whether a low value at the point is the channel being missed or the
    point sitting beside it: a 250 m grid resolves a lateral structure that a
    hand-picked coordinate may not be on.
    """
    best = 0.0
    step_km = 0.125
    n = int(radius_km / step_km)
    for i in range(-n, n + 1):
        for j in range(-n, n + 1):
            if math.hypot(i, j) * step_km > radius_km:
                continue
            qlat, qlon = _offset(
                lat, lon, math.hypot(i, j) * step_km, math.degrees(math.atan2(j, i))
            )
            cell = marc.cell_at(qlat, qlon)
            if cell is None or _km(qlat, qlon, cell.lat, cell.lon) > 0.2:
                continue
            m = marc.predict_current_series(qlat, qlon, HOURLY)
            if m is not None:
                best = max(best, float(m[0].max()))
    return best


def _passes(shom: ShomC2dRegistry, marc: MarcAtlasRegistry) -> list[dict]:
    """Each pass queried *at its nearest SHOM point*, the atlas axis by construction.

    A first run queried hand-picked "axis" coordinates and read MARC 0.4 kn
    against SHOM 3.4 at Maumusson: the pick was 1 km south of the channel,
    which MARC drew at 2.5 kn. Moving the query onto the SHOM point removes
    the picker from the comparison; the hand-picked point is kept as the
    "requested" column so the offset is visible.
    """
    out = []
    for name, lat0, lon0 in PASSES:
        idx, d0 = shom._nearest(lat0, lon0)
        if idx is None:
            out.append({"name": name, "lat": lat0, "lon": lon0, "missing": True})
            continue
        lat, lon = float(shom.lats[idx]), float(shom.lons[idx])
        rec = _both(shom, marc, lat, lon, TEN_MIN)
        if rec is None:
            out.append({"name": name, "lat": lat0, "lon": lon0, "missing": True})
            continue
        out.append(
            {
                "name": name,
                "lat": lat,
                "lon": lon,
                "picked_offset_km": float(d0),
                "missing": False,
                "shom_source": rec["shom_source"],
                "marc_atlas": rec["marc_atlas"],
                "marc_cell_km": rec["marc_cell_km"],
                "shom_peak": max(rec["shom_speed"]),
                "marc_peak": max(rec["marc_speed"]),
                "marc_peak_400m": _marc_peak_around(marc, lat, lon, 0.4),
                "slack_offset_min": _timing_offset_min(
                    rec["shom_speed"], rec["marc_speed"], "slack"
                ),
                "peak_offset_min": _timing_offset_min(rec["shom_speed"], rec["marc_speed"], "peak"),
            }
        )
    return out


# ── 3. Threshold what-if ─────────────────────────────────────────────────────


def _shelf_share(shom: ShomC2dRegistry, marc: MarcAtlasRegistry) -> dict:
    """Nearest-SHOM distance over wet points drawn uniformly in the fine atlases.

    Uniform in the bounding boxes of the 250 m and 700 m atlases (the shelf),
    kept when MARC has a wet cell within ``WET_CELL_MAX_KM`` and SHOM has a
    point within 5 km (the current cascade would serve SHOM there). The share
    below each threshold is what SHOM would keep if the rule were tightened.
    """
    rng = random.Random(RANDOM_SEED + 1)
    boxes = [a.bbox for a in marc.atlases if a.resolution_m <= 700]
    dists: list[float] = []
    by_atlas: dict[str, list[float]] = {}
    tries = 0
    while len(dists) < SHELF_SAMPLE and tries < 60_000:
        tries += 1
        lat_min, lon_min, lat_max, lon_max = rng.choice(boxes)
        lat = rng.uniform(lat_min, lat_max)
        lon = rng.uniform(lon_min, lon_max)
        cell = marc.cell_at(lat, lon)
        if cell is None or _km(lat, lon, cell.lat, cell.lon) > WET_CELL_MAX_KM:
            continue
        idx, d = shom._nearest(lat, lon)
        if idx is None or d > 5.0:
            continue
        dists.append(float(d))
        by_atlas.setdefault(cell.atlas_name, []).append(float(d))
    arr = np.asarray(dists)
    return {
        "n": int(arr.size),
        "share_below": {f"{t:g}": float((arr <= t).mean()) for t in THRESHOLDS_KM},
        "by_atlas": {
            a: {f"{t:g}": float((np.asarray(v) <= t).mean()) for t in THRESHOLDS_KM}
            for a, v in sorted(by_atlas.items())
        },
        "by_atlas_n": {a: len(v) for a, v in sorted(by_atlas.items())},
    }


# ── Report ───────────────────────────────────────────────────────────────────


def _fmt(v: float, digits: int = 2) -> str:
    return "n/a" if v != v else f"{v:.{digits}f}"


def _write_markdown(buckets: list[dict], passes: list[dict], share: dict, path: Path) -> None:
    lines = [
        "# Bench courants : règle du point SHOM le plus proche contre grille MARC",
        "",
        f"- Fenêtre : {BASE_TIME.date().isoformat()}, 25 h, coefficient 97 (vives-eaux)",
        f"- Graine : {RANDOM_SEED}. Sans vérité terrain : le bench mesure des désaccords, pas des erreurs.",
        "",
        "## 1. Désaccord SHOM / MARC selon la distance au point SHOM le plus proche",
        "",
        f"Points d'interrogation dispersés autour des points SHOM sur tout le plateau, {PER_BUCKET} par tranche, pas horaire.",
        "",
        "| Distance au point SHOM | n | Δvitesse moy. (kn) | médiane | p95 | pic MARC / pic SHOM (médiane) | MARC plus fort | Δdirection médiane (°) | p95 |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for b in buckets:
        lines.append(
            f"| {b['bucket']} | {b['n_points']} | {_fmt(b['speed_mean'])} | {_fmt(b['speed_median'])} "
            f"| {_fmt(b['speed_p95'])} | {_fmt(b['peak_ratio_median'])} | {_fmt(100 * b['marc_higher_share'], 0)} % "
            f"| {_fmt(b['dir_median'], 0)} | {_fmt(b['dir_p95'], 0)} |"
        )
    lines += [
        "",
        "## 2. Passes nommées, au point SHOM",
        "",
        "Chaque passe est interrogée au point SHOM le plus proche de la coordonnée choisie à la main "
        "(« écart du choix » = distance entre les deux) : l'axe de l'atlas par construction, sans biais de pointage. "
        "Pas de 10 min. « Pic MARC à 400 m » = plus fort pic MARC sur un maillage de 125 m dans ce rayon : "
        "un pic MARC bas au point mais fort à 400 m est une veine de courant décalée, pas absente. "
        "Décalages = moyenne des |Δt| entre étales (resp. pics) SHOM et MARC appariés.",
        "",
        "| Passe | Source SHOM | écart du choix (km) | atlas MARC | pic SHOM (kn) | pic MARC au point (kn) | pic MARC à 400 m (kn) | étales Δt (min) | pics Δt (min) |",
        "|---|---|---:|---|---:|---:|---:|---:|---:|",
    ]
    for p in passes:
        if p["missing"]:
            lines.append(f"| {p['name']} | hors couverture | | | | | | | |")
            continue
        lines.append(
            f"| {p['name']} | {p['shom_source']} | {p['picked_offset_km']:.2f} | {p['marc_atlas']} "
            f"| {p['shom_peak']:.1f} | {p['marc_peak']:.1f} | {p['marc_peak_400m']:.1f} "
            f"| {_fmt(p['slack_offset_min'], 0)} | {_fmt(p['peak_offset_min'], 0)} |"
        )
    lines += [
        "",
        "## 3. Part du plateau servie par SHOM selon le seuil",
        "",
        f"{share['n']} points mouillés tirés uniformément dans les atlas 250 m et 700 m, tous à moins de 5 km d'un point SHOM "
        "(donc servis par SHOM aujourd'hui). Part qui resterait à SHOM si le seuil descendait :",
        "",
        "| Seuil | " + " | ".join(f"{t:g} km" for t in THRESHOLDS_KM) + " |",
        "|---|" + "---:|" * len(THRESHOLDS_KM),
        "| tout le plateau | "
        + " | ".join(f"{100 * share['share_below'][f'{t:g}']:.0f} %" for t in THRESHOLDS_KM)
        + " |",
    ]
    for atlas, row in share["by_atlas"].items():
        lines.append(
            f"| {atlas} (n={share['by_atlas_n'][atlas]}) | "
            + " | ".join(f"{100 * row[f'{t:g}']:.0f} %" for t in THRESHOLDS_KM)
            + " |"
        )
    lines += [
        "",
        "## Lecture",
        "",
        "- Tableau 1 : si le désaccord grimpe avec la distance, la valeur SHOM « du point le plus proche » "
        "s'éloigne de ce que MARC voit à l'endroit demandé ; c'est le seuil des 5 km qui coûte, pas le prédicteur.",
        "- Tableau 2 : dans les goulets étroits, un pic MARC nettement sous le pic SHOM à point SHOM proche "
        "(< 0,3 km) est le sous-maillage des 250 m. Un pic SHOM élevé à point SHOM lointain (> 1,5 km) sur une "
        "cellule MARC faible est le courant du raz collé sur un abri.",
        "- Tableau 3 : ce que chaque seuil enlève à SHOM pour le donner à MARC.",
        "",
    ]
    path.write_text("\n".join(lines))


def main() -> None:
    if not MARC_DIR.exists():
        raise SystemExit(f"MARC atlases not found at {MARC_DIR}")
    if not (SHOM_DIR / "shom_c2d_points.parquet").exists():
        raise SystemExit(f"SHOM artefacts not found at {SHOM_DIR}")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    shom = ShomC2dRegistry.from_directory(SHOM_DIR)
    marc = MarcAtlasRegistry.from_directory(MARC_DIR)
    print(
        f"SHOM: {shom.lats.size} points, MARC: {[(a.name, a.resolution_m) for a in marc.atlases]}"
    )

    print("1/3 distance buckets…")
    records = _sample_buckets(shom, marc)
    buckets = _bucket_stats(records)
    for b in buckets:
        print(
            f"  {b['bucket']:12s} n={b['n_points']:3d} Δspeed med {b['speed_median']:.2f} p95 {b['speed_p95']:.2f} "
            f"peak ratio {b['peak_ratio_median']:.2f} dir med {b['dir_median']:.0f}°"
        )

    print("2/3 named passes…")
    passes = _passes(shom, marc)
    for p in passes:
        if p["missing"]:
            print(f"  {p['name']:36s} hors couverture")
        else:
            print(
                f"  {p['name']:36s} shom {p['shom_peak']:4.1f} kn | marc {p['marc_peak']:4.1f} kn, "
                f"à 400 m {p['marc_peak_400m']:4.1f} | choix à {p['picked_offset_km']:.2f} km | étales Δt {_fmt(p['slack_offset_min'], 0)} min"
            )

    print("3/3 shelf share…")
    share = _shelf_share(shom, marc)
    print(
        "  "
        + ", ".join(
            f"≤{t:g} km: {100 * share['share_below'][f'{t:g}']:.0f} %" for t in THRESHOLDS_KM
        )
    )

    stamp = datetime.now(UTC).strftime("%Y-%m-%d_%H%M")
    json_path = OUT_DIR / f"currents_resolution_{stamp}.json"
    md_path = OUT_DIR / f"currents_resolution_{stamp}.md"
    # The per-point series (2 MB) stay out of the repo; the aggregates are
    # what the report reads and what a rerun is compared against.
    json_path.write_text(
        json.dumps(
            {"buckets": buckets, "passes": passes, "shelf_share": share},
            indent=1,
            ensure_ascii=False,
        )
    )
    _write_markdown(buckets, passes, share, md_path)
    print(f"\nWrote {md_path}")


if __name__ == "__main__":
    main()
