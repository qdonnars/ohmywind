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


def _polygonal(geom):
    """Keep the areal part of a shapely result (intersections may add lines)."""
    from shapely.geometry import GeometryCollection
    from shapely.ops import unary_union

    if geom.is_empty:
        return geom
    if geom.geom_type == "GeometryCollection":
        parts = [g for g in geom.geoms if g.geom_type in ("Polygon", "MultiPolygon")]
        return unary_union(parts) if parts else GeometryCollection()
    return (
        geom if geom.geom_type in ("Polygon", "MultiPolygon") else GeometryCollection()
    )


def _tiles_union(
    atlas_dir: Path, clip_to: dict | None = None, tile_deg: float = 0.5
) -> dict | None:
    """Union of the tiles (``tile_deg`` wide, 0.5 for MARC) that hold at least one cell.

    The bbox in ``coverage.geojson`` is what the runtime filters on first, but
    it is far too coarse to show: ATLNE's box swallows the Mediterranean where
    the atlas has no cell. This is the same answer as the runtime's
    ``coverage_cells()``: a Parquet footer per tile, nothing else read.
    """
    import polars as pl
    from shapely.geometry import box, mapping
    from shapely.ops import unary_union
    from shapely.validation import make_valid

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
        boxes.append(box(lon, lat, lon + tile_deg, lat + tile_deg))
    if not boxes:
        return None
    union = unary_union(boxes)
    if clip_to is not None:
        from shapely.geometry import shape

        union = union.intersection(shape(clip_to))
    # A union of a few hundred boxes clipped and simplified can come out with
    # a self-touching ring; shapely then answers an empty intersection for
    # every later operation without a word, which hid a 300 deg2 atlas.
    return mapping(_polygonal(make_valid(union.simplify(0.001))))


def _validity_clip(meta: dict, bbox_geometry: dict) -> dict:
    """The coverage box, cut down to ``validity_bbox`` when the metadata has one."""
    vb = meta.get("validity_bbox")
    if not vb:
        return bbox_geometry
    from shapely.geometry import box, mapping, shape

    lat_min, lon_min, lat_max, lon_max = vb
    return mapping(
        shape(bbox_geometry).intersection(box(lon_min, lat_min, lon_max, lat_max))
    )


def _tile_deg(meta: dict) -> float:
    return float((meta.get("grid") or {}).get("tile_deg") or 0.5)


def current_coverage(build_dir: Path) -> dict:
    feats: list[dict] = []
    for cov in sorted(build_dir.glob("marc/*/coverage.geojson")):
        meta = json.loads((cov.parent / "metadata.json").read_text())
        bbox_geometry = _validity_clip(
            meta, json.loads(cov.read_text())["features"][0]["geometry"]
        )
        # The runtime filters on the atlas bbox first, then on the containing
        # tile: a union of whole tiles alone overflows the bbox by up to 55 km
        # and would promise FINIS 250 m where MANGA 700 m is served (measured
        # on 350 random sea points: 61 % agreement before the clip, 96 % after).
        geometry = (
            _tiles_union(cov.parent, bbox_geometry, _tile_deg(meta)) or bbox_geometry
        )
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
    # Atlases built in this repo but not shipped to the dataset yet: BSH
    # (spike) and Copernicus Marine (regional). Drawn from their tiles, clipped
    # to the validity box when the metadata declares one, like MARC above.
    for pattern in ("bsh/atlas/*/coverage.geojson", "cmems/atlas/*/coverage.geojson"):
        for cov in sorted(build_dir.glob(pattern)):
            meta = json.loads((cov.parent / "metadata.json").read_text())
            bbox_geometry = _validity_clip(
                meta, json.loads(cov.read_text())["features"][0]["geometry"]
            )
            geometry = (
                _tiles_union(cov.parent, bbox_geometry, _tile_deg(meta))
                or bbox_geometry
            )
            short = meta["source"]["short"]
            zone = str(meta.get("zone") or meta["atlas"].split("_", 1)[-1]).lower()
            feats.append(
                {
                    "type": "Feature",
                    "properties": {
                        "layer": "built",
                        "shipped": False,
                        "name": f"{meta.get('label') or meta['atlas']} ({meta['resolution_m']} m)",
                        "label": f"{short}_{zone}_{meta['resolution_m']}m",
                        "rank": meta["rank"],
                        "resolution_m": meta["resolution_m"],
                        "record_hours": meta["analysis"]["record_hours"],
                        "resolved": meta["analysis"]["resolved"],
                        "cells": meta.get("cells"),
                    },
                    "geometry": geometry,
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


# The four colours of the page. An area of strong current (1.5 kt mask) is
# "covered" when a tidal source at COVER_MAX_M or finer serves it (MARC, a
# built atlas; SHOM is points inside MARC), "target" when an open-licence
# gridded source of that class exists there, "blocked" when the only known
# sources are closed or unclear, "unknown" when the registry knows nothing.
# A pass needs MEDIUM_M or finer to count as covered or as targetable.
COVER_MAX_M = 5000
COVERED_LAYERS = ("shom", "marc", "built")
GRID_KINDS = ("forecast_grid", "harmonic_constants")
ZONE_STATUSES = ("covered", "target", "blocked", "unknown")


def _source_unions(sources: dict, max_res_m: float, unknown_res_ok: bool):
    """(open gridded sources at ``max_res_m`` or finer, closed or unclear sources).

    An open source without a stated resolution counts only when
    ``unknown_res_ok`` (an area can be served by a regional model of unstated
    pitch, a pass cannot be promised one); closed data of unstated pitch (a
    hydrographic office's tables, a national model) still means "the data
    exists" and always counts. Sources of global extent (FES, TPXO) are the
    fallback tier, not a target for a zone, so they never colour it.
    """
    from shapely.geometry import shape
    from shapely.ops import unary_union

    open_geoms, closed_geoms = [], []
    for f in sources["features"]:
        p = f["properties"]
        if p.get("kind") == "station_points" and p["status"] == "ok":
            continue
        geom = shape(f["geometry"])
        if geom.bounds[2] - geom.bounds[0] > 180:
            continue
        res = p.get("resolution_m")
        if res is not None and res > max_res_m:
            continue
        if p["status"] == "ok" and p.get("kind") in GRID_KINDS:
            if res is not None or unknown_res_ok:
                open_geoms.append(geom)
        elif p["status"] in ("blocked", "clarify"):
            closed_geoms.append(geom)
    return unary_union(open_geoms), unary_union(closed_geoms)


def zone_status(coverage: dict, masks: dict, sources: dict) -> dict:
    """The 1.5 kt mask split into the four statuses, one feature per status."""
    from shapely.geometry import mapping, shape
    from shapely.ops import unary_union
    from shapely.validation import make_valid

    strong = unary_union(
        [
            make_valid(shape(f["geometry"]))
            for fc in masks.values()
            for f in fc["features"]
            if f["properties"].get("threshold_kt", 0) >= 1.5
        ]
    )
    covered = unary_union(
        [
            make_valid(shape(f["geometry"]))
            for f in coverage["features"]
            if f["properties"]["layer"] in COVERED_LAYERS
            and (f["properties"].get("resolution_m") or 10**9) <= COVER_MAX_M
        ]
    )
    if not covered.is_valid or not strong.is_valid:
        raise RuntimeError("invalid geometry after union, check the coverage layer")
    open_src, closed_src = _source_unions(sources, COVER_MAX_M, unknown_res_ok=True)
    rest = _polygonal(strong.difference(covered))
    parts = {"covered": _polygonal(strong.intersection(covered))}
    parts["target"] = _polygonal(rest.intersection(open_src))
    rest = _polygonal(rest.difference(open_src))
    parts["blocked"] = _polygonal(rest.intersection(closed_src))
    parts["unknown"] = _polygonal(rest.difference(closed_src))
    feats = []
    for status in ZONE_STATUSES:
        geom = parts[status]
        if geom.is_empty:
            continue
        feats.append(
            {
                "type": "Feature",
                "properties": {"status": status, "area_deg2": round(geom.area, 2)},
                "geometry": mapping(geom.simplify(0.005)),
            }
        )
    return {"type": "FeatureCollection", "features": feats}


def pass_status(best_res_m, open_fine: bool, closed: bool) -> str:
    if best_res_m is not None and best_res_m <= MEDIUM_M:
        return "covered"
    if open_fine:
        return "target"
    if closed:
        return "blocked"
    return "unknown"


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
        if f["properties"]["layer"] in COVERED_LAYERS
    ]
    open_fine_src, closed_src = _source_unions(sources, MEDIUM_M, unknown_res_ok=False)
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
            "status": pass_status(
                best[0] if best else None,
                open_fine_src.contains(pt),
                closed_src.contains(pt),
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
        # Five decimals: four moved a point by up to 5 m and flipped the
        # 500 m threshold on 0.25 % of the shoreline tests.
        pts.append([round(float(lat), 5), round(float(lon), 5), index[label]])
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


GAPS_FILES = (
    REPO / "packages/data-adapters/src/openwind_data/currents/tidal_gaps.geojson",
    REPO / "packages/web/src/domain/tidalGaps.json",
)


def server_gaps(coverage: dict, masks: dict, gaps: dict, include_built: bool) -> dict:
    """The snapshot behind the ``currents.tidal_gap`` notice, server and web.

    Worldwide, unlike the map's gap layer which stays inside the target area:
    the 1.5 kt masks minus every source at MEDIUM_M or finer (what the engine
    tags high confidence), plus the known passes without such a source. The
    two copies must stay identical (``tidalGaps.test.ts`` reads the web one).

    Only shipped sources count unless ``include_built``: an atlas built here
    but not yet in the dataset must keep the warning alive where it will one
    day answer, otherwise Cuxhaven loses its notice before BSH serves it.
    """
    from shapely.geometry import mapping, shape
    from shapely.ops import unary_union
    from shapely.validation import make_valid

    strong = unary_union(
        [
            make_valid(shape(f["geometry"]))
            for fc in masks.values()
            for f in fc["features"]
            if f["properties"].get("threshold_kt", 0) >= 1.5
        ]
    )
    layers = COVERED_LAYERS if include_built else ("shom", "marc")
    fine_feats = [
        f
        for f in coverage["features"]
        if f["properties"]["layer"] in layers
        and (f["properties"].get("resolution_m") or 10**9) <= MEDIUM_M
    ]
    fine = unary_union([make_valid(shape(f["geometry"])) for f in fine_feats])
    fine_names = {f["properties"]["name"] for f in fine_feats}
    left = _polygonal(strong.difference(fine)).simplify(0.01)
    feats = [
        {
            "type": "Feature",
            "properties": {"kind": "mask", "threshold_kt": 1.5},
            "geometry": mapping(left),
        }
    ]
    for f in gaps["features"]:
        p = f["properties"]
        if f["geometry"]["type"] != "Point":
            continue
        if (
            p.get("coverage_class") in ("fine", "medium")
            and p.get("best_source") in fine_names
        ):
            continue
        feats.append(
            {
                "type": "Feature",
                "properties": {
                    "kind": "pass",
                    "name": p["name"],
                    "max_spring_kt": p.get("max_spring_kt"),
                    "coverage_class": p.get("coverage_class"),
                },
                "geometry": f["geometry"],
            }
        )
    sources = ", ".join(sorted(masks))
    return {
        "type": "FeatureCollection",
        "name": "tidal_gaps",
        "description": (
            "Zones où le courant de marée est probablement fort et où aucune source de "
            "courants à 1 km ou plus fin n'est servie. Polygone : courant tidal maximal "
            f"> 1,5 kt reconstruit depuis les atlas ({sources}), moins la couverture fine "
            "et moyenne, monde entier. Points : passes et raz connus sans source fine ni "
            "moyenne (courant de vive-eau publié en nœuds). Généré par "
            "scripts/build_tidal_world_map.py --write-gaps le "
            f"{datetime.now(UTC).date().isoformat()} ; à régénérer quand un atlas est ajouté."
        ),
        "features": feats,
    }


def export_web(
    web_dir: Path,
    masks: dict,
    gaps: dict,
    status: dict,
    objective: dict,
    coverage: dict,
    sources: dict,
) -> None:
    """The static files ``TidalSourcesMap`` fetches, one per layer, compact JSON.

    The page reads the masks (for the current band in the click card), the
    gazetteer with its status, the four-status polygons, the target area, the
    registry and the ATLNE footprint; the built atlases are exported for the
    card's benefit only. Everything else in ``data.js`` is for the docs page.
    """
    web_dir.mkdir(parents=True, exist_ok=True)
    compact = {"ensure_ascii": False, "separators": (",", ":")}
    for name, fc in masks.items():
        (web_dir / f"{name}.geojson").write_text(json.dumps(fc, **compact))
    points = [f for f in gaps["features"] if f["geometry"]["type"] == "Point"]
    (web_dir / "gazetteer.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": points}, **compact)
    )
    (web_dir / "status.geojson").write_text(json.dumps(status, **compact))
    (web_dir / "objective.geojson").write_text(json.dumps(objective, **compact))
    built = [f for f in coverage["features"] if f["properties"]["layer"] == "built"]
    (web_dir / "coverage_built.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": built}, **compact)
    )
    (web_dir / "sources.geojson").write_text(json.dumps(sources, **compact))
    footprint = MAP_DIR / "atlne_footprint.geojson"
    if footprint.exists():
        (web_dir / "atlne_footprint.geojson").write_text(
            json.dumps(json.loads(footprint.read_text()), **compact)
        )
    for stale in (
        "gaps_mask.geojson",
        "coverage_spike.geojson",
        "coverage_effective.geojson",
        "shom_points.json",
    ):
        (web_dir / stale).unlink(missing_ok=True)
    print(f"web layers written to {web_dir}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--build-dir", type=Path, default=REPO / "build")
    parser.add_argument(
        "--skip-coverage",
        action="store_true",
        help="keep the versioned coverage_current.geojson",
    )
    parser.add_argument(
        "--write-gaps",
        action="store_true",
        help="rewrite the tidal_gaps snapshot served by the engine and bundled by the web app",
    )
    parser.add_argument(
        "--gaps-include-built",
        action="store_true",
        help="count the atlases built under build/ as served (after their publication)",
    )
    parser.add_argument(
        "--web-dir",
        type=Path,
        default=None,
        help="also write the layers the web page loads (packages/web/public/methodologie/tidal)",
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

    status = zone_status(coverage, masks, sources)
    (MAP_DIR / "status.geojson").write_text(
        json.dumps(status, ensure_ascii=False, separators=(",", ":"))
    )
    print(
        "status.geojson: "
        + ", ".join(
            f"{f['properties']['status']} {f['properties']['area_deg2']} deg2"
            for f in status["features"]
        )
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
        "status": status,
        "classes": {"fine_m": FINE_M, "medium_m": MEDIUM_M, "shom_max_km": 0.5},
    }
    out = MAP_DIR / "data.js"
    out.write_text(
        "window.TIDAL_WORLD = "
        + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    )
    if args.web_dir is not None:
        export_web(args.web_dir, masks, gaps, status, objective, coverage, sources)
    if args.write_gaps:
        snapshot = json.dumps(
            server_gaps(coverage, masks, gaps, args.gaps_include_built),
            ensure_ascii=False,
            separators=(",", ":"),
        )
        for path in GAPS_FILES:
            path.write_text(snapshot)
        print(
            f"tidal_gaps: {len(snapshot) / 1e3:.0f} kB, "
            f"{sum(1 for f in json.loads(snapshot)['features'] if f['properties']['kind'] == 'pass')} passes"
        )
    print(
        f"data.js: {out.stat().st_size / 1e3:.0f} kB, {len(sources['features'])} sources, "
        f"{len(gazetteer['features'])} gazetteer entries, {len(masks)} mask(s), {len(coverage['features'])} coverage features"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
