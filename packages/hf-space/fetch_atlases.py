# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Pull the tidal atlases from the HF Dataset at Docker build time, or fail the build.

Reads ``HF_TOKEN`` (mounted as a build secret) and ``HF_DATASET_ID`` from the
environment, snapshots the dataset under ``ATLAS_DATA_DIR`` (default
``/app/data/atlas``), checks that what came down is what the runtime needs,
and reports it. The dataset is private by obligation, not by convenience, and
this script warns when it is not.

**The build fails when the atlases are not there.** It used not to: a missing
token, an expired one or an unreachable dataset printed a line and let the
image ship empty. The runtime then served the whole coast from Open-Meteo's
8 km global current (the Raz de Sein included), dropped the documented
unknown zones, and ``get_tidal_stream`` answered "no tidal atlas is loaded",
with a single INFO line at warm-up to say so. That is a sailing-safety
regression no request could tell from a working deployment, so it now stops
the build instead.

What "there" means, checked against the files the runtime loaders read
(``MarcAtlasRegistry.from_directory``, ``ShomC2dRegistry.from_directory``,
``load_land_mask``):

- every MARC PREVIMER atlas of ``REQUIRED_HARMONIC_ATLASES``, each a
  directory holding a ``metadata.json`` naming it and at least one tile;
- the SHOM Atlas C2D artefacts at the dataset root
  (``shom_c2d_points.parquet``, ``shom_c2d_ref_ports.json``);
- the land mask, ``land_mask.npz``, at the root as well.

Other atlases in the dataset (BSH, NorKyst, CMEMS and the rest) are served
when present and not required. ``REQUIRED_ATLASES`` (comma-separated atlas
names) replaces the MARC list when the dataset's minimum changes.

**The escape hatch.** ``ALLOW_MISSING_ATLASES=1`` turns every failure above
into a warning and builds an image without atlases (or with what came down).
For a local build, a fork without access to the private dataset, a CI smoke:
anything that is not a deployment sailors rely on. The Dockerfile passes it
as a build argument and keeps it in the runtime environment, where the server
logs at ERROR when it starts without atlases it was not allowed to miss.
"""

from __future__ import annotations

import json
import os
import sys
from collections.abc import Mapping
from pathlib import Path

ALLOW_MISSING_ENV = "ALLOW_MISSING_ATLASES"
REQUIRED_ATLASES_ENV = "REQUIRED_ATLASES"

# The seven MARC PREVIMER atlases the cascade is built on (rank 1 ATLNE and
# MANGA, rank 2 FINIS, MANW, MANE, SUDBZH, AQUI): the French Atlantic and
# Channel coasts, the first-class scope.
REQUIRED_HARMONIC_ATLASES: tuple[str, ...] = (
    "AQUI",
    "ATLNE",
    "FINIS",
    "MANE",
    "MANGA",
    "MANW",
    "SUDBZH",
)
REQUIRED_ROOT_FILES: tuple[str, ...] = (
    "shom_c2d_points.parquet",
    "shom_c2d_ref_ports.json",
    "land_mask.npz",
)


class AtlasFetchError(RuntimeError):
    """The atlases the runtime needs did not come down."""


def allow_missing(environ: Mapping[str, str]) -> bool:
    """Whether this build was explicitly allowed to ship without the atlases."""
    return environ.get(ALLOW_MISSING_ENV, "").strip().lower() in {"1", "true", "yes", "on"}


def required_atlases(environ: Mapping[str, str]) -> tuple[str, ...]:
    raw = environ.get(REQUIRED_ATLASES_ENV, "").strip()
    if not raw:
        return REQUIRED_HARMONIC_ATLASES
    return tuple(sorted({name.strip() for name in raw.split(",") if name.strip()}))


def harmonic_atlases(target: Path) -> dict[str, bool]:
    """Atlas name -> whether it carries at least one tile, for every atlas directory.

    The name is the one ``metadata.json`` gives (``atlas``), which is the one
    the runtime registry serves under, not the directory name.
    """
    found: dict[str, bool] = {}
    if not target.is_dir():
        return found
    for sub in sorted(target.iterdir()):
        meta_file = sub / "metadata.json"
        if not sub.is_dir() or not meta_file.is_file():
            continue
        try:
            name = str(json.loads(meta_file.read_text())["atlas"])
        except (ValueError, KeyError, TypeError):
            name = sub.name
        found[name] = any(sub.glob("tile_lat=*/tile_lon=*/data.parquet"))
    return found


def check_dataset(target: Path, required: tuple[str, ...]) -> list[str]:
    """What is missing from ``target`` for the runtime to serve the cascade."""
    problems: list[str] = []
    atlases = harmonic_atlases(target)
    missing = [name for name in required if name not in atlases]
    if missing:
        problems.append(f"harmonic atlases missing: {', '.join(missing)}")
    empty = [name for name in required if atlases.get(name) is False]
    if empty:
        problems.append(f"harmonic atlases without a single tile: {', '.join(empty)}")
    for name in REQUIRED_ROOT_FILES:
        if not (target / name).is_file():
            problems.append(f"{name} missing at the dataset root")
    return problems


def download(target: Path, dataset_id: str, token: str) -> None:
    from huggingface_hub import HfApi, snapshot_download

    # The dataset must stay private: redistributing the raw MARC PREVIMER
    # NetCDF is something we committed not to do, and dataset visibility is a
    # single toggle in the HF settings. Warn loudly rather than fail: breaking
    # the production build would punish the deployment for a settings mistake
    # made elsewhere, and the build is not where that gets fixed.
    try:
        if HfApi(token=token).dataset_info(dataset_id).private is False:
            print("=" * 72)
            print(f"WARNING: dataset {dataset_id} is PUBLIC.")
            print("It holds raw MARC PREVIMER NetCDF, redistributed under a")
            print("no-redistribution commitment. Set it back to private in the")
            print("HF dataset settings.")
            print("=" * 72)
    except Exception as exc:
        print(f"NOTE: could not check dataset visibility ({exc})")

    print(f"Fetching {dataset_id} -> {target}")
    snapshot_download(dataset_id, repo_type="dataset", local_dir=str(target), token=token)


def main(environ: Mapping[str, str] | None = None) -> int:
    """Fetch and check; 0 when the image may ship, 1 when the build must stop."""
    env = os.environ if environ is None else environ
    target = Path(env.get("ATLAS_DATA_DIR", "/app/data/atlas"))
    dataset_id = env.get("HF_DATASET_ID", "Qdonnars/openwind-tidal-atlas")
    token = env.get("HF_TOKEN", "")
    allowed = allow_missing(env)
    required = required_atlases(env)

    try:
        if not token:
            raise AtlasFetchError(
                "HF_TOKEN is not set: the build secret HF_TOKEN must hold a token "
                f"with read access to {dataset_id}"
            )
        download(target, dataset_id, token)
        problems = check_dataset(target, required)
        if problems:
            raise AtlasFetchError(f"dataset {dataset_id} is incomplete: " + "; ".join(problems))
    except Exception as exc:
        target.mkdir(parents=True, exist_ok=True)
        if allowed:
            print(f"WARNING: {exc}")
            print(
                f"{ALLOW_MISSING_ENV}=1: building without the tidal atlases. The runtime "
                "falls back to Open-Meteo SMOC (8 km), which does not resolve the narrow "
                "passes. Never ship this image to the public deployment."
            )
            return 0
        print(f"ERROR fetching the tidal atlas dataset: {exc}", file=sys.stderr)
        print(
            "Refusing to build an image that would plan the coast without its tidal "
            "atlases. Fix the HF_TOKEN build secret or the dataset; for a local build "
            f"or a fork without access, pass --build-arg {ALLOW_MISSING_ENV}=1.",
            file=sys.stderr,
        )
        return 1

    atlases = harmonic_atlases(target)
    print(f"Atlas dataset cached at {target}")
    print(f"  harmonic atlases ({len(atlases)}): {', '.join(sorted(atlases))}")
    print(f"  required, all present: {', '.join(required)}")
    print(f"  root files: {', '.join(REQUIRED_ROOT_FILES)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
