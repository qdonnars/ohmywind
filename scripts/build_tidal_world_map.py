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
  (``build/{bsh,cmems,cmems_arc,norkyst}/atlas/*/coverage.geojson`` and
  ``build/ofs/*/atlas/*/coverage.geojson``); written to
  ``coverage_current.geojson`` so the page works from a clean checkout too;
- with ``--write-gaps``, the snapshot behind the ``currents.tidal_gap``
  notice, where each pass also lists the atlases blind to it (reconstructed
  maximum within 3 km under half the published spring current).

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
# The registry table's structured columns (web: TidalSourcesMap, sourceHealth).
ENUMS = {
    "access_kind": {
        "keyless",
        "free_account",
        "api_key",
        "sftp_account",
        "on_request",
        "paid",
        "none",
    },
    "automation": {"auto", "auto_secret", "manual", "none"},
    "update_cadence": {
        "live",
        "daily",
        "weekly",
        "monthly",
        "yearly",
        "decade",
        "frozen",
        "none",
    },
    "licence_class": {"open", "non_commercial", "paid", "other"},
}
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
        for key, allowed in ENUMS.items():
            if p.get(key) is not None and p[key] not in allowed:
                sys.exit(f"sources.geojson: {p['id']} has {key} {p[key]!r}")
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


# Atlases built by the spike scripts, under ``build/<source>/atlas/<ATLAS>``.
BUILT_ATLAS_PATTERNS = (
    "bsh/atlas/*/coverage.geojson",
    "cmems/atlas/*/coverage.geojson",
    "cmems_arc/atlas/*/coverage.geojson",
    "norkyst/atlas/*/coverage.geojson",
    "ofs/*/atlas/*/coverage.geojson",
)


def atlas_dir_of(build_dir: Path, props: dict) -> Path | None:
    """The tile directory behind a coverage feature of layer ``marc`` or ``built``."""
    if props.get("layer") == "marc":
        d = build_dir / "marc" / props["atlas"]
        return d if d.is_dir() else None
    if props.get("layer") == "built":
        for pattern in BUILT_ATLAS_PATTERNS:
            for cov in build_dir.glob(pattern):
                if cov.parent.name == props["atlas"]:
                    return cov.parent
    return None


def current_coverage(build_dir: Path, shipped: frozenset[str] = frozenset()) -> dict:
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
                    "atlas": meta["atlas"],
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
    for pattern in BUILT_ATLAS_PATTERNS:
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
                        "atlas": meta["atlas"],
                        "shipped": meta["atlas"] in shipped,
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


# The four colours of the page. Green is where the tide is worth a look
# (0.5 kt mask) and a tidal source at COVER_MAX_M or finer serves it (MARC,
# a built atlas; SHOM is points inside MARC): drawn over the whole covered
# extent, not only the strong zones, so the rade de Brest or the Elbe read
# as covered rather than as "no current". The other three colours are the
# strong zones (1.5 kt mask) nothing covers: "target" when an open-licence
# gridded source of that class exists there, "blocked" when the only known
# sources are closed or unclear, "unknown" when the registry knows nothing.
# A pass needs MEDIUM_M or finer to count as covered or as targetable.
COVER_MAX_M = 5000
COVERED_LAYERS = ("shom", "marc", "built")
GRID_KINDS = ("forecast_grid", "harmonic_constants")


def _served(props: dict) -> bool:
    """A source the runtime answers with today: SHOM, MARC, or a built atlas
    already published in the dataset. A built atlas still under ``build/``
    is an open source at hand, not coverage: the map must not promise what
    the server does not serve."""
    layer = props["layer"]
    if layer in ("shom", "marc"):
        return True
    return layer == "built" and bool(props.get("shipped"))


# ``calm`` is covered water where the tide never reaches 0.5 kt: drawn pale,
# so a hole in the green reads as "nothing to plan around here", not as a
# gap in the coverage (the shelf off Groix and Concarneau stays under 0.4 kt).
ZONE_STATUSES = ("calm", "covered", "target", "blocked", "unknown")
# Thresholds of the green gradient, the same the mask builder contours.
BAND_THRESHOLDS_KT = (0.5, 1.0, 1.5, 2.0, 3.0, 5.0)


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


def layered_mask(masks: dict, coverage: dict, threshold_kt: float):
    """Union of the masks at ``threshold_kt``, the finest atlas winning everywhere.

    Each mask file names the atlases it was computed from and their
    resolution; a coarser mask only contributes outside the *extent* of every
    finer atlas, the threshold 0 feature its builder writes (where the atlas
    has cells, at the raster pitch). Without this, the 7 km FES pixels that
    straddle the Breton coast draw rectangles of "tide" over Morlaix on top
    of what the 250 m atlases already resolve. The extent, not the tile
    footprint: MANGA holds a few cells in the 0.5 degree tile of the Bristol
    Channel and, with tiles, silenced the Copernicus mask over the whole
    tile, which then read as calm water. A mask file without an extent
    feature falls back to the tile footprint of its atlases.
    """
    from shapely.geometry import shape
    from shapely.ops import unary_union
    from shapely.validation import make_valid

    footprints: dict[str, list] = {}
    for f in coverage["features"]:
        atlas = f["properties"].get("atlas")
        if atlas:
            footprints.setdefault(atlas, []).append(make_valid(shape(f["geometry"])))
    ranked = []
    for fc in masks.values():
        feats = fc["features"]
        wanted = [
            f for f in feats if f["properties"].get("threshold_kt", 0) >= threshold_kt
        ]
        if not wanted:
            continue
        extent_feats = [f for f in feats if f["properties"].get("threshold_kt") == 0]
        atlases = [
            a.strip()
            for a in str(wanted[0]["properties"].get("atlas") or "").split(",")
            if a.strip()
        ]
        if extent_feats:
            own = [make_valid(shape(f["geometry"])) for f in extent_feats]
        else:
            own = [g for a in atlases for g in footprints.get(a, [])]
        ranked.append(
            (
                float(wanted[0]["properties"].get("resolution_m") or 10**9),
                unary_union([make_valid(shape(f["geometry"])) for f in wanted]),
                own,
            )
        )
    ranked.sort(key=lambda r: r[0])
    finer = None
    parts = []
    for _res, geom, own in ranked:
        if finer is not None:
            geom = _polygonal(geom.difference(finer))
        if not geom.is_empty:
            parts.append(geom)
        if own:
            finer = (
                unary_union([finer, *own]) if finer is not None else unary_union(own)
            )
    return (
        unary_union(parts)
        if parts
        else _polygonal(shape({"type": "Polygon", "coordinates": []}))
    )


def load_ocean(path: Path | None):
    """The Natural Earth 10 m ocean polygon (public domain), or ``None``.

    The regular grids of the MARC atlases carry extrapolated values over
    land near the coast, and a 7 km FES pixel straddles it: without a
    coastline the green would cover the Crozon peninsula and rectangles of
    "tide" would sit on Morlaix. The colours are clipped to the ocean; the
    warning snapshot is not (a leg is at sea by construction).
    """
    if path is None or not path.exists():
        return None
    from shapely.geometry import shape
    from shapely.ops import unary_union

    fc = json.loads(path.read_text())
    return unary_union([shape(f["geometry"]) for f in fc["features"]])


def zone_status(coverage: dict, masks: dict, sources: dict, ocean=None) -> dict:
    """The 1.5 kt mask split into the four statuses, one feature per status."""
    from shapely.geometry import mapping, shape
    from shapely.ops import unary_union
    from shapely.validation import make_valid

    strong = layered_mask(masks, coverage, 1.5)
    notable = layered_mask(masks, coverage, 0.5)
    fine_enough = [
        f
        for f in coverage["features"]
        if f["properties"]["layer"] in COVERED_LAYERS
        and (f["properties"].get("resolution_m") or 10**9) <= COVER_MAX_M
    ]
    covered = unary_union(
        [
            make_valid(shape(f["geometry"]))
            for f in fine_enough
            if _served(f["properties"])
        ]
    )
    at_hand = [
        make_valid(shape(f["geometry"]))
        for f in fine_enough
        if not _served(f["properties"])
    ]
    if not covered.is_valid or not strong.is_valid:
        raise RuntimeError("invalid geometry after union, check the coverage layer")
    open_src, closed_src = _source_unions(sources, COVER_MAX_M, unknown_res_ok=True)
    open_src = unary_union([open_src, *at_hand])
    rest = _polygonal(strong.difference(covered))
    # Covered water is a green gradient: one disjoint band per threshold of
    # the masks (0.5 to 5 kt), the darker the stronger, so a pass in a fine
    # atlas shows its structure. ``calm`` is the covered water under the
    # first band.
    parts: list[tuple[str, float | None, object]] = [
        ("calm", None, _polygonal(covered.difference(notable)))
    ]
    upper = None
    for thr in reversed(BAND_THRESHOLDS_KT):
        above = layered_mask(masks, coverage, thr)
        band = _polygonal(above.intersection(covered))
        if upper is not None:
            band = _polygonal(band.difference(upper))
        parts.append(("covered", thr, band))
        upper = above if upper is None else unary_union([upper, above])
    parts.append(("target", None, _polygonal(rest.intersection(open_src))))
    rest = _polygonal(rest.difference(open_src))
    parts.append(("blocked", None, _polygonal(rest.intersection(closed_src))))
    parts.append(("unknown", None, _polygonal(rest.difference(closed_src))))
    order = {s: i for i, s in enumerate(ZONE_STATUSES)}
    parts.sort(key=lambda p: (order[p[0]], p[1] or 0.0))
    feats = []
    for status, min_kt, geom in parts:
        if ocean is not None and not geom.is_empty:
            geom = _polygonal(geom.intersection(ocean))
        if geom.is_empty:
            continue
        props: dict = {"status": status, "area_deg2": round(geom.area, 2)}
        if min_kt is not None:
            props["min_kt"] = min_kt
        feats.append(
            {
                "type": "Feature",
                "properties": props,
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
    coverage: dict,
    masks: dict,
    gazetteer: dict,
    sources: dict,
    objective: dict,
    unresolved: dict[str, dict] | None = None,
) -> dict:
    """Strong-current zones without a production source at 1 km or finer.

    Production layers are ``shom`` and ``marc`` (``spike`` is not shipped,
    ``smoc`` is the global fallback). For every gazetteer entry: the best
    production resolution at the point, the class it falls in, and the
    candidate sources of status ``ok`` whose extent contains it. For the
    1.5 kt mask: the polygons left once the fine and medium production
    coverage is subtracted.

    ``unresolved`` (from :func:`unresolved_passes`) lists, per pass, the
    atlases blind to it; a pass whose best served source is blind is not
    covered on the map either, whatever its pitch says (Saltstraumen under
    NorKyst 800 m stays a gap, in red when no other source is known).
    """
    from shapely.geometry import shape
    from shapely.ops import unary_union

    prod = [
        (shape(f["geometry"]), f["properties"])
        for f in coverage["features"]
        if f["properties"]["layer"] in COVERED_LAYERS and _served(f["properties"])
    ]
    at_hand = [
        (shape(f["geometry"]), f["properties"])
        for f in coverage["features"]
        if f["properties"]["layer"] == "built" and not _served(f["properties"])
    ]
    open_fine_src, closed_src = _source_unions(sources, MEDIUM_M, unknown_res_ok=False)
    open_fine_src = unary_union(
        [
            open_fine_src,
            *[g for g, p in at_hand if (p.get("resolution_m") or 10**9) <= MEDIUM_M],
        ]
    )
    fine_union = unary_union(
        [g for g, p in prod if (p.get("resolution_m") or 10**9) <= MEDIUM_M]
    )
    # Same rule as the colours: a worldwide source (FES, TPXO) is the fallback
    # tier, never a candidate to cover a pass.
    candidates = [
        (geom, f["properties"])
        for f in sources["features"]
        if f["properties"]["status"] == "ok"
        and f["properties"].get("kind") != "station_points"
        for geom in [shape(f["geometry"])]
        if geom.bounds[2] - geom.bounds[0] <= 180
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
                    best = (res, p["name"], p.get("label"))
        blind = (unresolved or {}).get(f["properties"]["name"], {}).get(
            "unresolved_by"
        ) or []
        blind_best = bool(best and best[2] in blind)
        klass = resolution_class(best[0] if best and not blind_best else None)
        cands = sorted(
            {
                (p["name"], p.get("resolution_m"))
                for g, p in [*candidates, *at_hand]
                if g.contains(pt)
            }
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
                best[0] if best and not blind_best else None,
                open_fine_src.contains(pt),
                closed_src.contains(pt),
            ),
        }
        if blind:
            props["unresolved_by"] = blind
        points.append(
            {"type": "Feature", "properties": props, "geometry": f["geometry"]}
        )
    gap_polys = []
    left = _polygonal(layered_mask(masks, coverage, 1.5).difference(fine_union))
    if objective_geom is not None:
        left = _polygonal(left.intersection(objective_geom))
    if not left.is_empty:
        gap_polys.append(
            {
                "type": "Feature",
                "properties": {
                    "kind": "mask_gap",
                    "threshold_kt": 1.5,
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


# A pass is unresolved by an atlas when the maximum current the atlas
# reconstructs within UNRESOLVED_RADIUS_KM of it stays under UNRESOLVED_RATIO
# times the spring current the gazetteer publishes. The radius is the
# runtime's blind spot (``tidal_gaps.DEFAULT_UNRESOLVED_RADIUS_KM``) and
# absorbs a gazetteer point set beside the channel axis: FINIS 250 m reads
# 1.8 kt within 1.5 km of the Chenal du Four point but 3.7 kt within 3 km,
# where the channel runs. NorKyst 800 m at Saltstraumen (published 8 kt)
# stays under 2 kt at 3 km: the channel is land in the grid.
UNRESOLVED_RADIUS_KM = 3.0
UNRESOLVED_RATIO = 0.5
_KM_PER_DEG = 111.0


def _mask_module():
    """``max_speed_of_tile`` from the mask builder, one source of truth."""
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "tidal_mask", Path(__file__).resolve().parent / "build_tidal_world_mask.py"
    )
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def atlas_max_near(
    atlas_dir: Path,
    lat: float,
    lon: float,
    radius_km: float,
    mask_mod,
    times,
    x_cache: dict,
) -> float | None:
    """Max reconstructed tidal current (kt) of ``atlas_dir`` within ``radius_km`` of a point.

    ``None`` when the atlas has no cell that close: the runtime would still
    answer from a cell up to 5 km away, which is the blind case.
    """
    import numpy as np
    import polars as pl

    meta = json.loads((atlas_dir / "metadata.json").read_text())
    tile_deg = _tile_deg(meta)
    dlat = radius_km / _KM_PER_DEG
    dlon = radius_km / (_KM_PER_DEG * max(np.cos(np.deg2rad(lat)), 0.05))
    frames = []
    for tlat in np.arange(
        np.floor((lat - dlat) / tile_deg) * tile_deg, lat + dlat, tile_deg
    ):
        for tlon in np.arange(
            np.floor((lon - dlon) / tile_deg) * tile_deg, lon + dlon, tile_deg
        ):
            path = (
                atlas_dir
                / f"tile_lat={tlat:.1f}"
                / f"tile_lon={tlon:.1f}"
                / "data.parquet"
            )
            if path.exists():
                frames.append(pl.read_parquet(path))
    if not frames:
        return None
    df = pl.concat(frames, how="diagonal_relaxed")
    km = np.hypot(
        (df["lat"].to_numpy() - lat) * _KM_PER_DEG,
        (df["lon"].to_numpy() - lon) * _KM_PER_DEG * np.cos(np.deg2rad(lat)),
    )
    df = df.filter(pl.Series(km <= radius_km))
    if df.height == 0:
        return None
    speeds = mask_mod.max_speed_of_tile(df, x_cache, times)
    if not np.isfinite(speeds).any():
        return None
    return float(np.nanmax(speeds) / 0.514444)


def unresolved_passes(
    build_dir: Path, coverage: dict, gazetteer: dict
) -> dict[str, dict]:
    """Per gazetteer pass with a published current: the fine atlases blind to it.

    ``{name: {"unresolved_by": [labels], "measured": {label: kt}}}``, only
    for the passes at least one atlas misses. Every atlas at MEDIUM_M or
    finer whose coverage contains the pass is measured, served or not, so
    the snapshot is right the day the atlas ships; a coarser atlas is
    already tagged medium by its pitch and has nothing to lose here, and
    listing it would drag passes MARC resolves into the snapshot for the
    legs that carry no source at all.
    """
    from datetime import timedelta

    from shapely.geometry import shape

    mask_mod = _mask_module()
    start = datetime(2026, 3, 1, tzinfo=UTC)
    times = [start + timedelta(hours=h) for h in range(24 * 15)]
    x_cache: dict = {}
    atlases = []
    for f in coverage["features"]:
        if (f["properties"].get("resolution_m") or 10**9) > MEDIUM_M:
            continue
        d = atlas_dir_of(build_dir, f["properties"])
        if d is not None:
            atlases.append((shape(f["geometry"]), f["properties"]["label"], d))
    out: dict[str, dict] = {}
    for f in gazetteer["features"]:
        p = f["properties"]
        published = p.get("max_spring_kt")
        if not published or f["geometry"]["type"] != "Point":
            continue
        lon, lat = f["geometry"]["coordinates"]
        pt = shape(f["geometry"])
        measured: dict[str, float | None] = {}
        blind: list[str] = []
        for geom, label, d in atlases:
            if not geom.contains(pt):
                continue
            kt = atlas_max_near(
                d, lat, lon, UNRESOLVED_RADIUS_KM, mask_mod, times, x_cache
            )
            measured[label] = None if kt is None else round(kt, 2)
            if kt is None or kt < UNRESOLVED_RATIO * float(published):
                blind.append(label)
        if blind:
            out[p["name"]] = {"unresolved_by": sorted(blind), "measured": measured}
    return out


GAPS_FILES = (
    REPO / "packages/data-adapters/src/openwind_data/currents/tidal_gaps.geojson",
    REPO / "packages/web/src/domain/tidalGaps.json",
)


def server_gaps(
    coverage: dict, masks: dict, gaps: dict, unresolved: dict[str, dict] | None = None
) -> dict:
    """The snapshot behind the ``currents.tidal_gap`` notice, server and web.

    Worldwide, unlike the map's gap layer which stays inside the target area:
    the 1.5 kt masks minus every source at MEDIUM_M or finer (what the engine
    tags high confidence), plus the known passes without such a source. The
    two copies must stay identical (``tidalGaps.test.ts`` reads the web one).

    Only SHOM and MARC are subtracted, never a built atlas even once it is
    published: the engine only raises the notice where the served source is
    not fine, so listing Cuxhaven costs nothing while BSH answers there and
    keeps the warning for a deployment that lacks the atlas.

    ``unresolved`` (from :func:`unresolved_passes`) adds ``unresolved_by`` to
    a pass, the labels of the fine atlases blind to it; such a pass stays in
    the snapshot even under a fine MARC source, since the engine downgrades
    that source there and must find the pass.
    """
    from shapely.geometry import mapping, shape
    from shapely.ops import unary_union
    from shapely.validation import make_valid

    strong = layered_mask(masks, coverage, 1.5)
    layers = ("shom", "marc")
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
        blind = (unresolved or {}).get(p["name"], {}).get("unresolved_by") or []
        if (
            p.get("coverage_class") in ("fine", "medium")
            and p.get("best_source") in fine_names
            and not blind
        ):
            continue
        props = {
            "kind": "pass",
            "name": p["name"],
            "max_spring_kt": p.get("max_spring_kt"),
            "coverage_class": p.get("coverage_class"),
        }
        if blind:
            props["unresolved_by"] = blind
        feats.append(
            {"type": "Feature", "properties": props, "geometry": f["geometry"]}
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
            "moyenne (courant de vive-eau publié en nœuds) ; unresolved_by liste les "
            "atlas à 1 km ou plus fin dont le maximum reconstruit à 3 km reste sous la "
            "moitié du courant publié. Généré par "
            "scripts/build_tidal_world_map.py --write-gaps le "
            f"{datetime.now(UTC).date().isoformat()} ; à régénérer quand un atlas est ajouté."
        ),
        "features": feats,
    }


def dissolved(fc: dict) -> dict:
    """One outline for a target area drawn as several boxes.

    The hand-written objective is a few overlapping rectangles; drawn as
    they are, their shared edges cut dashed lines across the middle of the
    continent. The union keeps the first feature's properties.
    """
    if len(fc["features"]) < 2:
        return fc
    from shapely.geometry import mapping, shape
    from shapely.ops import unary_union

    union = unary_union([shape(f["geometry"]) for f in fc["features"]])
    return {
        **fc,
        "features": [
            {
                "type": "Feature",
                "properties": fc["features"][0].get("properties", {}),
                "geometry": mapping(union),
            }
        ],
    }


def served_atlases(api_base: str) -> frozenset[str]:
    """The atlases a running server serves, from its coverage endpoint.

    The same list the page reads at load time to badge the registry, so the
    colours of the map and the badges of the table come from one place, the
    server, and cannot drift from what it answers.
    """
    import urllib.request

    url = api_base.rstrip("/") + "/api/v1/marine/marc/coverage"
    with urllib.request.urlopen(url, timeout=60) as resp:
        payload = json.load(resp)
    return frozenset(str(a["name"]) for a in payload.get("atlases", []))


def _rounded(fc: dict, decimals: int = 4) -> dict:
    """The same collection with coordinates at ``decimals`` places (10 m at 4):
    the bands ship with 15 digits otherwise, twice the bytes for nothing."""

    def walk(x):
        # shapely's ``mapping`` hands out nested tuples, json.dumps lists both.
        if isinstance(x, (list, tuple)):
            if x and isinstance(x[0], (int, float)):
                return [round(float(v), decimals) for v in x]
            return [walk(v) for v in x]
        return x

    return {
        **fc,
        "features": [
            {
                **f,
                "geometry": {
                    **f["geometry"],
                    "coordinates": walk(f["geometry"]["coordinates"]),
                },
            }
            for f in fc["features"]
        ],
    }


NEGLIGIBLE_KT = 0.5


def negligible_tide(coverage: dict, ocean=None) -> dict:
    """Water a model measures with a negligible tide, and no served atlas covers.

    Read from ``negligible_<name>.geojson`` (written by the mask builder from an
    atlas analysed for the map only, never served: serving it would replace
    the global model's currents, which carry the wind-driven flow of the
    Øresund, with a near-zero tide). The extent of its cells minus where it
    reaches ``NEGLIGIBLE_KT``, minus the served coverage, clipped to the sea.
    Without it the Baltic read as a hole in the data rather than a sea
    without tide.
    """
    from shapely.geometry import mapping, shape
    from shapely.ops import unary_union
    from shapely.validation import make_valid

    served = unary_union(
        [
            make_valid(shape(f["geometry"]))
            for f in coverage["features"]
            if f["properties"]["layer"] in ("marc", "built")
            and _served(f["properties"])
        ]
    )
    feats = []
    for path in sorted(MAP_DIR.glob("negligible_*.geojson")):
        fc = json.loads(path.read_text())
        extent = [
            f for f in fc["features"] if f["properties"].get("threshold_kt") == 0.0
        ]
        strong = [
            f
            for f in fc["features"]
            if f["properties"].get("threshold_kt") == NEGLIGIBLE_KT
        ]
        if not extent:
            continue
        geom = make_valid(shape(extent[0]["geometry"]))
        if strong:
            geom = geom.difference(make_valid(shape(strong[0]["geometry"])))
        geom = geom.difference(served)
        if ocean is not None:
            geom = geom.intersection(ocean)
        geom = _polygonal(geom).simplify(0.01)
        if geom.is_empty:
            continue
        feats.append(
            {
                "type": "Feature",
                "properties": {
                    "kind": "negligible",
                    "below_kt": NEGLIGIBLE_KT,
                    "atlas": extent[0]["properties"].get("atlas"),
                    "area_deg2": round(geom.area, 2),
                },
                "geometry": mapping(geom),
            }
        )
    return {"type": "FeatureCollection", "features": feats}


def export_web(
    web_dir: Path,
    masks: dict,
    gaps: dict,
    status: dict,
    objective: dict,
    coverage: dict,
    sources: dict,
    negligible: dict | None = None,
) -> None:
    """The static files ``TidalSourcesMap`` fetches, one per layer, compact JSON.

    The page reads the gazetteer with its status, the status polygons (the
    green bands, the calm water, the uncovered strong zones), the target area
    and the registry; the built atlases are exported for the card's benefit
    only. Everything else in ``data.js`` is for the docs page.
    """
    web_dir.mkdir(parents=True, exist_ok=True)
    compact = {"ensure_ascii": False, "separators": (",", ":")}
    # The page reads its bands from status.geojson; the masks stay on the
    # docs page and are removed from the site if an older build left them.
    for stale in list(web_dir.glob("mask_*.geojson")) + [
        web_dir / "atlne_footprint.geojson"
    ]:
        stale.unlink(missing_ok=True)
    # The covered water ships as rasters (build_tidal_world_raster.py); the
    # page only draws the uncovered strong zones as polygons.
    status = _rounded(
        {
            **status,
            "features": [
                f
                for f in status["features"]
                if f["properties"]["status"] not in ("covered", "calm")
            ],
        }
    )
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
    (web_dir / "negligible.geojson").write_text(
        json.dumps(
            _rounded(negligible or {"type": "FeatureCollection", "features": []}),
            **compact,
        )
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
        "--ocean",
        type=Path,
        default=REPO / "build" / "natural_earth" / "ne_10m_ocean.geojson",
        help="Natural Earth 10 m ocean polygon used to clip the colours to the sea",
    )
    parser.add_argument(
        "--shipped",
        default="BSH_AUSALT,BSH_CUXBRU,BSH_DB,BSH_IDB,CMEMS_NWS,CMEMS_IBI,CMEMS_MED",
        help="built atlases already published in the dataset, comma separated",
    )
    parser.add_argument(
        "--shipped-from",
        default=None,
        metavar="API_BASE",
        help="read the served atlases from <API_BASE>/api/v1/marine/marc/coverage instead of --shipped",
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
        shipped = (
            served_atlases(args.shipped_from)
            if args.shipped_from
            else frozenset(x.strip() for x in args.shipped.split(",") if x.strip())
        )
        print(f"served atlases: {len(shipped)}")
        coverage = current_coverage(args.build_dir, shipped)
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
        dissolved(json.loads(objective_path.read_text()))
        if objective_path.exists()
        else {"type": "FeatureCollection", "features": []}
    )
    unresolved = (
        unresolved_passes(args.build_dir, coverage, gazetteer)
        if args.build_dir.exists()
        else {}
    )
    for name, info in sorted(unresolved.items()):
        print(
            f"unresolved pass: {name}: "
            + ", ".join(f"{k} ({v} kt)" for k, v in info["measured"].items())
        )
    gaps = compute_gaps(coverage, masks, gazetteer, sources, objective, unresolved)
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

    ocean = load_ocean(args.ocean)
    if ocean is None:
        print(
            f"WARNING: no ocean polygon at {args.ocean}, colours not clipped to the sea"
        )
    status = zone_status(coverage, masks, sources, ocean)
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
    negligible = negligible_tide(coverage, ocean)
    print(
        "negligible tide: "
        + ", ".join(
            f"{f['properties']['atlas']} {f['properties']['area_deg2']} deg2"
            for f in negligible["features"]
        )
    )
    if args.web_dir is not None:
        export_web(
            args.web_dir, masks, gaps, status, objective, coverage, sources, negligible
        )
    if args.write_gaps:
        snapshot = json.dumps(
            server_gaps(coverage, masks, gaps, unresolved),
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
