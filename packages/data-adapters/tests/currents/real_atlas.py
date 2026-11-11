# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Where the private atlases are, for the tests marked ``real_atlas``.

MARC PREVIMER and SHOM C2D are under a no-redistribution commitment: nothing
of them is committed here. The tests that need them read the directories the
server itself reads, from the same variables:

- ``MARC_ATLAS_DIR``: the dataset root (``Qdonnars/openwind-tidal-atlas``),
  one directory per atlas;
- ``SHOM_C2D_DIR``: the directory holding ``shom_c2d_points.parquet`` and
  ``shom_c2d_ref_ports.json``, the dataset root as well, so it defaults to
  ``MARC_ATLAS_DIR`` as in the Space's Dockerfile;
- ``C2D_DONNEES``: the raw SHOM archive (``.../CD_COURANTS2D/DONNEES``), the
  variable ``scripts/build_shom_c2d.py`` reads. Not in the dataset, so the CI
  never has it.

Unset, the tests skip: a fork, a contributor without access, a worktree. The
CI job that downloads the dataset sets ``OPENWIND_REAL_ATLAS_REQUIRED=1``, and
then a missing directory fails instead, because a test that skipped over a
broken download would report green on nothing.

A local ``build/`` tree is laid out differently from the dataset; to run the
suite on it, ``scripts/build_test_fixtures_currents.py link-local`` builds a
directory of symlinks in the dataset's layout.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

MARC_ATLAS_DIR_ENV = "MARC_ATLAS_DIR"
SHOM_C2D_DIR_ENV = "SHOM_C2D_DIR"
C2D_DONNEES_ENV = "C2D_DONNEES"
REQUIRED_ENV = "OPENWIND_REAL_ATLAS_REQUIRED"


def required() -> bool:
    return os.environ.get(REQUIRED_ENV, "").strip().lower() not in ("", "0", "false", "no")


def _env_path(*names: str) -> Path | None:
    for name in names:
        raw = os.environ.get(name, "").strip()
        if raw:
            return Path(raw)
    return None


def _need(path: Path | None, marker: str | None, what: str, variable: str) -> Path:
    """``path`` if it holds ``marker`` (or is a directory), else skip, or fail when required."""
    target = None if path is None else (path / marker if marker else path)
    if target is not None and target.exists():
        return path  # type: ignore[return-value]
    reason = (
        f"{what} not available: set {variable}"
        if target is None
        else f"{what} not found: {target} is missing"
    )
    if required():
        pytest.fail(f"{reason} ({REQUIRED_ENV} is set)")
    pytest.skip(reason)


def marc_dir(marker: str | None = None) -> Path:
    """The dataset root holding the MARC-format atlases."""
    return _need(
        _env_path(MARC_ATLAS_DIR_ENV), marker, "harmonic atlas dataset", MARC_ATLAS_DIR_ENV
    )


def shom_dir() -> Path:
    """The directory holding the SHOM C2D artefacts."""
    return _need(
        _env_path(SHOM_C2D_DIR_ENV, MARC_ATLAS_DIR_ENV),
        "shom_c2d_points.parquet",
        "SHOM C2D artefacts",
        SHOM_C2D_DIR_ENV,
    )


def c2d_archive_dir(marker: str) -> Path:
    """The raw SHOM C2D archive (``DONNEES``). Never required: not in the dataset."""
    path = _env_path(C2D_DONNEES_ENV)
    if path is not None and (path / marker).exists():
        return path
    pytest.skip(f"raw SHOM C2D archive not available: set {C2D_DONNEES_ENV} to .../DONNEES")
