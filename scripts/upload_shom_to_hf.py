"""Upload the SHOM Atlas C2D artefacts to the OhMyWind HF Dataset.

Pushes ``build/shom_c2d/shom_c2d_points.parquet`` and
``build/shom_c2d/shom_c2d_ref_ports.json`` to the root of the private
dataset ``Qdonnars/openwind-tidal-atlas``, alongside the existing MARC
PREVIMER atlas subdirs. The HF Space build pipeline
(``packages/hf-space/fetch_atlases.py``) snapshots the whole dataset
into a single directory at build time, so SHOM artefacts at the dataset
root land next to MARC atlases under a shared ``ATLAS_DATA_DIR``.

Run from repo root::

    HF_TOKEN=hf_... uv run --with huggingface_hub python scripts/upload_shom_to_hf.py

The token must have **write** scope on the dataset (User Access Token,
not the read-only one used by the Docker build).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
ARTEFACT_DIR = REPO_ROOT / "build" / "shom_c2d"
DATASET_ID = os.environ.get("HF_DATASET_ID", "Qdonnars/openwind-tidal-atlas")

UPLOAD_FILES = (
    ("shom_c2d_points.parquet", "shom_c2d_points.parquet"),
    ("shom_c2d_ref_ports.json", "shom_c2d_ref_ports.json"),
)


def main() -> int:
    token = os.environ.get("HF_TOKEN")
    if not token:
        print("ERROR: HF_TOKEN not set in env (need write scope)", file=sys.stderr)
        return 1
    if not ARTEFACT_DIR.exists():
        print(
            f"ERROR: {ARTEFACT_DIR} not found. "
            f"Run scripts/build_shom_c2d.py first.",
            file=sys.stderr,
        )
        return 1

    from huggingface_hub import HfApi

    api = HfApi(token=token)
    print(f"Pushing SHOM C2D artefacts to {DATASET_ID} (repo_type=dataset):")
    for local_name, repo_path in UPLOAD_FILES:
        local = ARTEFACT_DIR / local_name
        if not local.exists():
            print(f"  MISSING {local}", file=sys.stderr)
            return 1
        size_kb = local.stat().st_size / 1024
        print(f"  {local_name}  ({size_kb:.0f} KB) -> {repo_path}")
        api.upload_file(
            path_or_fileobj=str(local),
            path_in_repo=repo_path,
            repo_id=DATASET_ID,
            repo_type="dataset",
            commit_message=f"Add/update {local_name} from local build",
        )
    print("Done.")
    print()
    print("Next step: trigger an HF Space rebuild so the new fetch_atlases.py")
    print("pulls the SHOM files alongside MARC. Either push a no-op commit to")
    print("the Space repo, or use the HF UI 'Factory rebuild' (a plain Restart")
    print("uses the cached image and won't re-fetch the dataset).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
