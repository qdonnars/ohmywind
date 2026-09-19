#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars
# /// script
# requires-python = ">=3.12"
# dependencies = ["polars>=1.0", "pyarrow>=16"]
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


def current_coverage(build_dir: Path) -> dict:
    feats: list[dict] = []
    for cov in sorted(build_dir.glob("marc/*/coverage.geojson")):
        meta = json.loads((cov.parent / "metadata.json").read_text())
        geo = json.loads(cov.read_text())["features"][0]
        feats.append(
            {
                "type": "Feature",
                "properties": {
                    "layer": "marc",
                    "name": f"MARC {meta['atlas']} {meta['resolution_m']} m",
                    "rank": meta["rank"],
                    "resolution_m": meta["resolution_m"],
                },
                "geometry": geo["geometry"],
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
                    {"layer": "shom", "points": g.height},
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
            {"layer": "smoc"},
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

    payload = {
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "sources": sources,
        "gazetteer": gazetteer,
        "masks": masks,
        "coverage": coverage,
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
