# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Everything the API needs to know about where it is running.

Read from the environment by the deployment wrapper, never by the app itself:
a package that reads ``os.environ`` from inside a request handler cannot be
instantiated twice in one process, cannot be tested without mutating the
environment, and hides what it depends on. ``Settings.from_env()`` is the one
place that looks, and it is called by the entry point.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

# Serving directory of the tidal atlas dataset. Both point at the same place in
# the shipped image: the dataset puts the SHOM artefacts at its root, next to
# the per-atlas MARC subdirectories.
MARC_ATLAS_DIR_ENV = "MARC_ATLAS_DIR"
SHOM_C2D_DIR_ENV = "SHOM_C2D_DIR"


@dataclass(frozen=True, slots=True)
class Settings:
    """Deployment-provided configuration.

    Args:
        marc_atlas_dir: directory holding the MARC PREVIMER atlases. Empty
            when the deployment ships without the dataset, which is a normal
            state: the overlay endpoint then answers ``covered: false`` and
            the engine falls back to Open-Meteo SMOC.
        shom_c2d_dir: directory holding the SHOM Atlas C2D artefacts. Same
            lifecycle.
        static_dir: directory holding the landing page's media (the demo loop
            and its poster). ``None`` serves the landing without them, which
            is what a test or a bare redeployment gets. The landing HTML
            itself ships inside this package.
    """

    marc_atlas_dir: str = ""
    shom_c2d_dir: str = ""
    static_dir: Path | None = None

    @classmethod
    def from_env(cls, environ: dict[str, str] | None = None) -> Settings:
        env = os.environ if environ is None else environ
        raw_static = env.get("OPENWIND_STATIC_DIR", "")
        return cls(
            marc_atlas_dir=env.get(MARC_ATLAS_DIR_ENV, ""),
            shom_c2d_dir=env.get(SHOM_C2D_DIR_ENV, ""),
            static_dir=Path(raw_static) if raw_static else None,
        )
