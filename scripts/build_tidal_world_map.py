#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars
# /// script
# requires-python = ">=3.12"
# dependencies = ["polars>=1.0", "pyarrow>=16", "shapely>=2.0"]
# ///
"""Assemble the data behind ``docs/tidal-world/map/index.html``.

The map is a static Leaflet page with no backend and no API key. Browsers
refuse ``fetch`` of local files, so every layer is bundled into one script,
``data.js``, that sets ``window.TIDAL_WORLD``. This script builds it from:

- ``sources.geojson`` (hand-maintained registry of candidate sources, the
  reference document; validated here: required properties, status values);
- ``gazetteer.geojson`` (hand-maintained list of passes, races and estuaries
  with a typical spring current);
- ``mask_<atlas>.geojson`` (computed by ``scripts/build_tidal_world_mask.py``);
- ``gaps.geojson``, computed here: the parts of the 1.5 kt mask and the
  gazetteer entries that no production source covers at 1 km or finer.
  This is the layer meant to become a warning in the app one day;
- the current coverage, computed here from the build artefacts when present:
  MARC atlases (``build/marc/*/coverage.geojson``), SHOM C2D zones
  (``build/shom_c2d/shom_c2d_points.parquet``), and the spike atlases
  (``build/bsh/atlas/*/coverage.geojson``); written to
  ``coverage_current.geojson`` so the page works from a clean checkout too.

Usage::

    uv run scripts/build_tidal_world_map.py
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
MAP_DIR = REPO / "docs" / "tidal-world" / "map"
STATUSES = {"current", "ok", "clarify", "blocked", "no_currents"}
REQUIRED = (
    "id", "name", "provider", "zone", "status", "kind", "access", "licence", "licence_url",
    "licence_read_at", "derivative_redistribution", "effort",
)  # fmt: skip


def validate_sources(fc: dict) -> None:
    ids: set[str] = set()
    for feat in fc["features"]:
        p = feat["properties"]
        missing = [k for k in REQUIRED if k not in p]
        if missing:
            sys.exit(f"sources.geojson: {p.get('id')} lacks {missing}")
        if p["status"] not in STATUSES:
            sys.exit(f"sources.geojson: {p['id']} has status {p['status']!r}")
        if p["id"] in ids:
            sys.exit(f"sources.geojson: duplicate id {p['id']}")
        ids.add(p["id"])


def _bbox_feature(name: str, props: dict, lat_min, lon_min, lat_max, lon_max) -> dict:
    return {
        "type": "Feature",
        "properties": {"name": name, **props},
        "geometry": {
            "type": "Polygon",
            "coordinates": [
                [
                    [lon_min, lat_min],
                    [lon_max, lat_min],
                    [lon_max, lat_max],
                    [lon_min, lat_max],
                    [lon_min, lat_min],
                ]
            ],
        },
    }


def _tiles_union(atlas_dir: Path, clip_to: dict | None = None) -> dict | None:
    """Union of the 0.5 degree tiles that hold at least one cell.

    The bbox in ``coverage.geojson`` is what the runtime filters on first, but
    it is far too coarse to show: ATLNE's box swallows the Mediterranean where
    the atlas has no cell. This is the same answer as the runtime's
    ``coverage_cells()``: a Parquet footer per tile, nothing else read.
    """
    import polars as pl
    from shapely.geometry import box, mapping
    from shapely.ops import unary_union

    boxes = []
    for parquet in atlas_dir.glob("tile_lat=*/tile_lon=*/data.parquet"):
        try:
            n_rows = pl.scan_parquet(parquet).select(pl.len()).collect().item()
        except (OSError, pl.exceptions.PolarsError) as exc:
            print(f"  skipping unreadable tile {parquet}: {exc}", file=sys.stderr)
            continue
        if n_rows == 0:
            continue
        lat = float(parquet.parent.parent.name.split("=")[1])
        lon = float(parquet.parent.name.split("=")[1])
        boxes.append(box(lon, lat, lon + 0.5, lat + 0.5))
    if not boxes:
        return None
    union = unary_union(boxes)
    if clip_to is not None:
        from shapely.geometry import shape

        union = union.intersection(shape(clip_to))
    return mapping(union.simplify(0.001))


def current_coverage(build_dir: Path) -> dict:
    feats: list[dict] = []
    for cov in sorted(build_dir.glob("marc/*/coverage.geojson")):
        meta = json.loads((cov.parent / "metadata.json").read_text())
        bbox_geometry = json.loads(cov.read_text())["features"][0]["geometry"]
        # The runtime filters on the atlas bbox first, then on the containing
        # tile: a union of whole tiles alone overflows the bbox by up to 55 km
        # and would promise FINIS 250 m where MANGA 700 m is served (measured
        # on 350 random sea points: 61 % agreement before the clip, 96 % after).
        geometry = _tiles_union(cov.parent, bbox_geometry) or bbox_geometry
        feats.append(
            {
                "type": "Feature",
                "properties": {
                    "layer": "marc",
                    "name": f"MARC {meta['atlas']} {meta['resolution_m']} m",
                    "label": f"marc_{meta['atlas'].lower()}_{meta['resolution_m']}m",
                    "rank": meta["rank"],
                    "resolution_m": meta["resolution_m"],
                },
                "geometry": geometry,
            }
        )
    shom = build_dir / "shom_c2d" / "shom_c2d_points.parquet"
    if shom.exists():
        import polars as pl

        df = pl.read_parquet(shom)
        for (atlas_id, zone), g in df.group_by(["atlas_id", "zone"]):
            feats.append(
                _bbox_feature(
                    f"SHOM C2D {atlas_id} {zone}",
                    {
                        "layer": "shom",
                        "points": g.height,
                        "atlas_id": int(atlas_id),
                        "zone": str(zone),
                    },
                    float(g["lat"].min()),
                    float(g["lon"].min()),
                    float(g["lat"].max()),
                    float(g["lon"].max()),
                )
            )
    for cov in sorted(build_dir.glob("bsh/atlas/*/coverage.geojson")):
        meta = json.loads((cov.parent / "metadata.json").read_text())
        geo = json.loads(cov.read_text())["features"][0]
        feats.append(
            {
                "type": "Feature",
                "properties": {
                    "layer": "spike",
                    "name": f"{meta['atlas']} {meta['resolution_m']} m (spike)",
                    "label": f"{meta['source']['short']}_{meta['atlas'].split('_', 1)[1].lower()}_{meta['resolution_m']}m",
                    "rank": meta["rank"],
                    "resolution_m": meta["resolution_m"],
                    "record_hours": meta["analysis"]["record_hours"],
                    "resolved": meta["analysis"]["resolved"],
                },
                "geometry": geo["geometry"],
            }
        )
    feats.append(
        _bbox_feature(
            "Open-Meteo SMOC 8 km (fallback)",
            {"layer": "smoc", "label": "openmeteo_smoc", "resolution_m": 8000},
            -80.0,
            -180.0,
            90.0,
            180.0,
        )
    )
    return {
        "type": "FeatureCollection",
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "features": feats,
    }


# Resolution classes shown on the map. A source finer than FINE_M resolves a
# pass; between FINE_M and MEDIUM_M it resolves an estuary mouth or a race;
# coarser than that it only says "there is tide here".
FINE_M = 500
MEDIUM_M = 1000


def resolution_class(res_m: float | None) -> str:
    if res_m is None:
        return "global"
    if res_m <= FINE_M:
        return "fine"
    if res_m <= MEDIUM_M:
        return "medium"
    if res_m <= 3000:
        return "coarse"
    return "global"


def compute_gaps(
    coverage: dict, masks: dict, gazetteer: dict, sources: dict, objective: dict
) -> dict:
    """Strong-current zones without a production source at 1 km or finer.

    Production layers are ``shom`` and ``marc`` (``spike`` is not shipped,
    ``smoc`` is the global fallback). For every gazetteer entry: the best
    production resolution at the point, the class it falls in, and the
    candidate sources of status ``ok`` whose extent contains it. For the
    1.5 kt mask: the polygons left once the fine and medium production
    coverage is subtracted.
    """
    from shapely.geometry import shape
    from shapely.ops import unary_union

    prod = [
        (shape(f["geometry"]), f["properties"])
        for f in coverage["features"]
        if f["properties"]["layer"] in ("shom", "marc")
    ]
    fine_union = unary_union(
        [g for g, p in prod if (p.get("resolution_m") or 10**9) <= MEDIUM_M]
    )
    candidates = [
        (shape(f["geometry"]), f["properties"])
        for f in sources["features"]
        if f["properties"]["status"] == "ok"
        and f["properties"].get("kind") != "station_points"
    ]
    objective_geom = (
        unary_union([shape(f["geometry"]) for f in objective["features"]])
        if objective["features"]
        else None
    )
    points = []
    for f in gazetteer["features"]:
        pt = shape(f["geometry"])
        best = None
        for g, p in prod:
            if g.contains(pt):
                res = p.get("resolution_m") or 10**9
                if best is None or res < best[0]:
                    best = (res, p["name"])
        klass = resolution_class(best[0] if best else None)
        cands = sorted(
            (p["name"], p.get("resolution_m")) for g, p in candidates if g.contains(pt)
        )
        props = {
            **f["properties"],
            "best_source": best[1] if best else None,
            "best_resolution_m": best[0] if best else None,
            "coverage_class": klass,
            "candidates": [f"{n} ({r} m)" if r else n for n, r in cands],
            "in_objective": bool(
                objective_geom is not None and objective_geom.contains(pt)
            ),
        }
        points.append(
            {"type": "Feature", "properties": props, "geometry": f["geometry"]}
        )
    gap_polys = []
    for fc in masks.values():
        for f in fc["features"]:
            if f["properties"].get("threshold_kt", 0) < 1.5:
                continue
            left = shape(f["geometry"]).difference(fine_union)
            if objective_geom is not None:
                left = left.intersection(objective_geom)
            if not left.is_empty:
                gap_polys.append(
                    {
                        "type": "Feature",
                        "properties": {
                            "kind": "mask_gap",
                            "threshold_kt": f["properties"]["threshold_kt"],
                            "area_deg2": round(left.area, 2),
                            "note": "Courant tidal maximal au-dessus de 1,5 kt sans source de production à 1 km ou plus fin.",
                        },
                        "geometry": left.__geo_interface__,
                    }
                )
    return {"type": "FeatureCollection", "features": points + gap_polys}


def shom_points(build_dir: Path) -> dict:
    """The SHOM C2D points themselves, because the cascade uses a point only
    within 0.5 km: a zone's box says nothing about where SHOM really answers.

    Compact form for the page: ``{"zones": [...labels], "points": [[lat, lon, zone_index], ...]}``.
    """
    shom = build_dir / "shom_c2d" / "shom_c2d_points.parquet"
    if not shom.exists():
        return {"zones": [], "points": [], "mean_lat": 48.0}
    import polars as pl

    df = pl.read_parquet(shom).select(["atlas_id", "zone", "lat", "lon"])
    zones: list[str] = []
    index: dict[str, int] = {}
    pts = []
    for atlas_id, zone, lat, lon in df.iter_rows():
        label = f"shom_c2d_{atlas_id}_{str(zone).lower()}"
        if label not in index:
            index[label] = len(zones)
            zones.append(label)
        pts.append([round(float(lat), 4), round(float(lon), 4), index[label]])
    mean_lat = float(df["lat"].mean()) if df.height else 48.0
    return {"zones": zones, "points": pts, "mean_lat": round(mean_lat, 4)}


def effective_coverage(coverage: dict) -> dict:
    """One polygon per precision class, without overlaps.

    A point belongs to the class of the finest MARC atlas whose tiles hold it,
    which is what the cascade picks (rank, then resolution). Drawn instead of
    the per-atlas boxes, so the map reads as "here the answer is fine, here it
    is coarse" rather than as a pile of overlapping rectangles. SHOM is not
    an area: it is drawn as its points.
    """
    from shapely.geometry import mapping, shape
    from shapely.ops import unary_union

    marc = [
        (shape(f["geometry"]), f["properties"])
        for f in coverage["features"]
        if f["properties"]["layer"] == "marc"
    ]
    by_class: dict[str, list] = {"fine": [], "medium": [], "coarse": []}
    for g, p in marc:
        by_class[resolution_class(p.get("resolution_m"))].append(g)
    feats = []
    taken = None
    for klass in ("fine", "medium", "coarse"):
        if not by_class[klass]:
            continue
        geom = unary_union(by_class[klass])
        if taken is not None:
            geom = geom.difference(taken)
        taken = geom if taken is None else unary_union([taken, geom])
        if not geom.is_empty:
            if klass == "coarse":
                # 0.5 degree tiles draw as a staircase; round the corners so the
                # eye reads an area, not a grid. Never applied to fine classes.
                geom = geom.buffer(0.2).buffer(-0.2).simplify(0.05)
            feats.append(
                {
                    "type": "Feature",
                    "properties": {"class": klass},
                    "geometry": mapping(geom.simplify(0.002)),
                }
            )
    return {"type": "FeatureCollection", "features": feats}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--build-dir", type=Path, default=REPO / "build")
    parser.add_argument(
        "--skip-coverage",
        action="store_true",
        help="keep the versioned coverage_current.geojson",
    )
    args = parser.parse_args(argv)

    sources = json.loads((MAP_DIR / "sources.geojson").read_text())
    validate_sources(sources)
    gazetteer_path = MAP_DIR / "gazetteer.geojson"
    gazetteer = (
        json.loads(gazetteer_path.read_text())
        if gazetteer_path.exists()
        else {"type": "FeatureCollection", "features": []}
    )
    masks = {
        p.stem: json.loads(p.read_text())
        for p in sorted(MAP_DIR.glob("mask_*.geojson"))
    }
    coverage_path = MAP_DIR / "coverage_current.geojson"
    if not args.skip_coverage and args.build_dir.exists():
        coverage = current_coverage(args.build_dir)
        coverage_path.write_text(json.dumps(coverage, separators=(",", ":")))
        print(f"coverage_current.geojson: {len(coverage['features'])} features")
    coverage = (
        json.loads(coverage_path.read_text())
        if coverage_path.exists()
        else {"type": "FeatureCollection", "features": []}
    )

    for f in coverage["features"]:
        f["properties"]["resolution_class"] = resolution_class(
            f["properties"].get("resolution_m")
        )
    objective_path = MAP_DIR / "objective.geojson"
    objective = (
        json.loads(objective_path.read_text())
        if objective_path.exists()
        else {"type": "FeatureCollection", "features": []}
    )
    gaps = compute_gaps(coverage, masks, gazetteer, sources, objective)
    (MAP_DIR / "gaps.geojson").write_text(
        json.dumps(gaps, ensure_ascii=False, separators=(",", ":"))
    )
    n_gap_points = sum(
        1
        for f in gaps["features"]
        if f["geometry"]["type"] == "Point"
        and f["properties"]["coverage_class"] in ("coarse", "global")
    )
    print(
        f"gaps.geojson: {n_gap_points} gazetteer entries without fine coverage, {len(gaps['features']) - len(gazetteer['features'])} mask polygons"
    )

    effective = effective_coverage(coverage)
    shom = (
        shom_points(args.build_dir)
        if args.build_dir.exists()
        else {"zones": [], "points": []}
    )
    print(
        f"effective coverage: {[f['properties']['class'] for f in effective['features']]}, {len(shom['points'])} SHOM points"
    )

    payload = {
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "sources": sources,
        "gazetteer": gazetteer,
        "masks": masks,
        "coverage": coverage,
        "coverage_effective": effective,
        "objective": objective,
        "shom": shom,
        "gaps": gaps,
        "classes": {"fine_m": FINE_M, "medium_m": MEDIUM_M, "shom_max_km": 0.5},
    }
    out = MAP_DIR / "data.js"
    out.write_text(
        "window.TIDAL_WORLD = "
        + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    )
    print(
        f"data.js: {out.stat().st_size / 1e3:.0f} kB, {len(sources['features'])} sources, "
        f"{len(gazetteer['features'])} gazetteer entries, {len(masks)} mask(s), {len(coverage['features'])} coverage features"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
