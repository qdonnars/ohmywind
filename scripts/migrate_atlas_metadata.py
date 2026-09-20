#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Upgrade MARC atlas ``metadata.json`` files from schema 2 to schema 3.

Schema 3 (``docs/harmonic_atlas_format.md``) adds what the runtime now reads
from the metadata instead of hard-coding it: the source and its licence,
the ``zone`` that forms the provenance label, the ``confidence`` tag and an
optional ``validity_bbox``. Nothing about the tiles changes, so this is a
seven-file edit, not a rebuild.

ATLNE gets a ``validity_bbox``: PREVIMER validated its atlases on the French
coasts (Pineau-Guillou 2013), and the 2026-09 exploration measured ATLNE in
the German Bight at 21 to 39 % under the observed M2 current with 8 to 37
degrees of lag, and 30 % under the Cuxhaven M2 height with 36 degrees of
lag. Outside the box the cascade falls back to Open-Meteo SMOC, whose tides
come from the globally validated FES2014. The box is a metadata value: it
can be widened or narrowed without touching code.

Usage::

    uv run scripts/migrate_atlas_metadata.py --atlas-dir build/marc            # dry run, prints the diff
    uv run scripts/migrate_atlas_metadata.py --atlas-dir build/marc --write    # rewrites the files
    uv run scripts/migrate_atlas_metadata.py --atlas-dir build/marc --write --push  # + uploads them

``--push`` uploads only the ``metadata.json`` files to the HF Dataset named
by ``HF_DATASET_ID`` (default ``Qdonnars/openwind-tidal-atlas``) with
``HF_TOKEN`` from the environment. A deployment running older code ignores
the new keys, so the push is safe for production before the code is promoted.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

LICENCE_READ_AT = "2026-09-19"

SOURCE = {
    "short": "marc",
    "name": "MARC PREVIMER harmonic atlases (MARS2D, Tidal ToolBox analysis of the 2008-2009 replay)",
    "provider": "Ifremer, with SHOM (PREVIMER)",
    "url": "ftp://ftp.ifremer.fr/MARC_L1-ATLAS-AHRMONIQUES/",
    "product": None,
    "version": "V0 (2013-02) for ranks 0 and 1, V1 (2013-10) for rank 2",
    "licence": {
        "name": "PREVIMER conditions: no redistribution of the raw NetCDF, citation required",
        "url": "https://archimer.ifremer.fr/doc/00157/26801/",
        "read_at": LICENCE_READ_AT,
        "evidence": "2013_04_15_fiche_produit_atlas_V0.pdf (Ifremer FTP)",
    },
    "attribution": "MARC PREVIMER (Ifremer / SHOM). Harmonic constants regridded by OhMyWind.",
    "citation": (
        "Pineau-Guillou Lucia (2013). PREVIMER, Validation des atlas de composantes "
        "harmoniques de hauteurs et courants de marée. Rapport Ifremer, 89 p. "
        "http://archimer.ifremer.fr/doc/00157/26801/"
    ),
    "redistribution_of_derivative": "derived Parquet served by the app; raw NetCDF never redistributed",
}

# Per-atlas decisions. ``validity_bbox`` is (lat_min, lon_min, lat_max, lon_max).
ATLAS_DECISIONS: dict[str, dict] = {
    "ATLNE": {
        "label": "Atlantique Nord-Est, 2 km",
        "confidence": "medium",
        # Shelf class, not basin: it must keep winning over the Copernicus
        # regional atlases (rank 0, 1.5 to 4 km) on the French coast, where
        # PREVIMER validated it and they were not.
        "rank": 1,
        "validity_bbox": [40.0, -20.03, 53.0, 3.0],
        "validity_note": (
            "Confined to the Bay of Biscay, the Channel and the Celtic Sea, where PREVIMER "
            "validated the model. In the North Sea the atlas ran 21 to 39 % under observed "
            "M2 currents with 8 to 37 degrees of lag (COSYNA radar, 2026-09-19), so SMOC "
            "(FES2014 tides) answers there instead."
        ),
    },
    "MANGA": {"label": "Manche et golfe de Gascogne, 700 m", "confidence": "high"},
    "FINIS": {"label": "Finistère, 250 m", "confidence": "high"},
    "MANW": {"label": "Manche ouest, 250 m", "confidence": "high"},
    "MANE": {"label": "Manche est, 250 m", "confidence": "high"},
    "SUDBZH": {"label": "Sud Bretagne, 250 m", "confidence": "high"},
    "AQUI": {"label": "Aquitaine, 250 m", "confidence": "high"},
}


def upgraded(meta: dict) -> dict:
    """Return the schema 3 version of a schema 2 (or already 3) MARC metadata."""
    name = meta["atlas"]
    decision = ATLAS_DECISIONS.get(name, {"label": name, "confidence": "high"})
    out = dict(meta)
    out.update(
        {
            "format": "ohmywind-harmonic-atlas",
            "schema_version": 3,
            "zone": name.lower(),
            "label": decision["label"],
            "effective_resolution_m": meta["resolution_m"],
            "grid": {"type": "regular_ll", "origin": "regrid"},
            "source": {**SOURCE, "product": f"{name} atlas"},
            "variables": ["h", "u", "v"],
            "vertical": "depth_averaged",
            "datum": "msl_analysis",
            "units": {"h": "m", "u": "m s-1", "v": "m s-1", "phase": "degrees"},
            "phase_convention": "greenwich_utc",
            "time_reference": "UTC",
            "direction_convention": "going_to",
            "rank": decision.get("rank", meta["rank"]),
            "confidence": decision["confidence"],
            "validity_bbox": decision.get("validity_bbox"),
            "builder": {"script": "scripts/build_marc_atlas.py", "git_commit": None},
            "migrated_at": datetime.now(UTC).isoformat(timespec="seconds"),
            "migrated_by": "scripts/migrate_atlas_metadata.py",
        }
    )
    if decision.get("validity_note"):
        out["validity_note"] = decision["validity_note"]
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--atlas-dir", type=Path, default=Path("build/marc"))
    parser.add_argument(
        "--write", action="store_true", help="rewrite metadata.json in place"
    )
    parser.add_argument(
        "--push",
        action="store_true",
        help="upload the metadata.json files to the HF Dataset",
    )
    args = parser.parse_args(argv)

    files = sorted(args.atlas_dir.glob("*/metadata.json"))
    if not files:
        sys.exit(f"no metadata.json under {args.atlas_dir}")
    changed: list[Path] = []
    for path in files:
        before = json.loads(path.read_text())
        after = upgraded(before)
        added = sorted(k for k in after if k not in before)
        print(
            f"{path.parent.name}: schema {before.get('schema_version')} -> 3, adds {added}"
        )
        if before.get("rank") != after.get("rank"):
            print(f"  rank: {before.get('rank')} -> {after.get('rank')}")
        if before.get("validity_bbox") != after.get("validity_bbox"):
            print(
                f"  validity_bbox: {before.get('validity_bbox')} -> {after.get('validity_bbox')}"
            )
        if args.write:
            path.write_text(json.dumps(after, indent=2, ensure_ascii=False) + "\n")
            changed.append(path)
    if not args.write:
        print("dry run: nothing written (add --write)")
        return 0
    if args.push:
        from huggingface_hub import HfApi

        token = os.environ.get("HF_TOKEN")
        if not token:
            sys.exit("HF_TOKEN required for --push")
        dataset = os.environ.get("HF_DATASET_ID", "Qdonnars/openwind-tidal-atlas")
        api = HfApi(token=token)
        for path in changed:
            api.upload_file(
                path_or_fileobj=str(path),
                path_in_repo=f"{path.parent.name}/metadata.json",
                repo_id=dataset,
                repo_type="dataset",
                commit_message=f"metadata: schema 3 for {path.parent.name}",
            )
            print(f"pushed {path.parent.name}/metadata.json to {dataset}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
