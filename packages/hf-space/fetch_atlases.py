# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Pull tidal atlases from the HF Dataset at Docker build time.

Reads ``HF_TOKEN`` (mounted as a build secret) and ``HF_DATASET_ID`` from
the environment, snapshots the dataset under ``ATLAS_DATA_DIR`` (default
``/app/data/atlas``), and reports what was fetched. Falls back gracefully
(empty dir, runtime uses Open-Meteo SMOC only) when the token is absent
so contributors can build the image without an HF account.

The downloaded layout is expected to contain both:

- MARC PREVIMER atlas tiles at ``<ATLAS_DATA_DIR>/<ATLAS>/`` (e.g. ``FINIS/``,
  ``SUDBZH/``, ``MANGA/``), one per Ifremer atlas. Read at runtime by
  ``MARC_ATLAS_DIR``.
- SHOM Atlas C2D artefacts at the dataset root: ``shom_c2d_points.parquet``
  + ``shom_c2d_ref_ports.json``. Read at runtime by ``SHOM_C2D_DIR``.

Both env vars (``MARC_ATLAS_DIR`` and ``SHOM_C2D_DIR``) are set to the
same directory by the Dockerfile, so the data-adapters loaders find
their respective files side by side. Either source can be missing from
the dataset and the runtime degrades the cascade accordingly:
SHOM → MARC → SMOC.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


def main() -> None:
    target = os.environ.get("ATLAS_DATA_DIR", "/app/data/atlas")
    dataset_id = os.environ.get("HF_DATASET_ID", "Qdonnars/openwind-tidal-atlas")
    token = os.environ.get("HF_TOKEN")

    if not token:
        print("WARNING: HF_TOKEN not set, skipping atlas dataset download")
        print("plan_passage will fall back to Open-Meteo SMOC only")
        os.makedirs(target, exist_ok=True)
        return

    from huggingface_hub import snapshot_download

    print(f"Fetching {dataset_id} -> {target}")
    snapshot_download(dataset_id, repo_type="dataset", local_dir=target, token=token)

    target_path = Path(target)
    marc_atlases = sorted(
        p.name for p in target_path.iterdir() if p.is_dir() and (p / "metadata.json").exists()
    )
    shom_present = (target_path / "shom_c2d_points.parquet").exists() and (
        target_path / "shom_c2d_ref_ports.json"
    ).exists()
    print(f"Atlas dataset cached at {target}")
    print(f"  MARC atlases: {marc_atlases or '<none>'}")
    print(f"  SHOM Atlas C2D: {'present' if shom_present else '<absent>'}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR fetching atlas dataset: {exc}", file=sys.stderr)
        # Don't fail the build — runtime will fall back as best it can.
        os.makedirs(os.environ.get("ATLAS_DATA_DIR", "/app/data/atlas"), exist_ok=True)
