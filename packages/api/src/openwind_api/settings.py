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
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from openwind_data.adapters.budget import DEFAULT_LIMITS, UpstreamBudget
from openwind_data.routing.auto_route.dispatch import DEFAULT_REPAIR_MODE, parse_repair_mode

# Serving directory of the tidal atlas dataset. Both point at the same place in
# the shipped image: the dataset puts the SHOM artefacts at its root, next to
# the per-atlas MARC subdirectories.
MARC_ATLAS_DIR_ENV = "MARC_ATLAS_DIR"
SHOM_C2D_DIR_ENV = "SHOM_C2D_DIR"
# The route repair, shared with the MCP server (which reads the same two).
ROUTE_REPAIR_ENV = "OPENWIND_ROUTE_REPAIR"
ROUTE_GRIDS_DIR_ENV = "OPENWIND_ROUTE_GRIDS_DIR"


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
        static_dir: directory holding the landing page's media (the demo
            video's poster). ``None`` serves the landing without them, which
            is what a test or a bare redeployment gets. The landing HTML
            itself ships inside this package.
        upstream_budget_enabled: whether this process refuses its own
            Open-Meteo calls before the free quota would
            (``OPENWIND_UPSTREAM_BUDGET``, on by default).
        upstream_budget_limits: the ceiling per window, in weighted calls
            (``OPENWIND_UPSTREAM_BUDGET_PER_MINUTE`` / ``_HOUR`` / ``_DAY``,
            default 80 % of the free tier: 480, 4 000, 8 000). See
            ``openwind_data.adapters.budget``.
        route_repair: ``OPENWIND_ROUTE_REPAIR``, ``off`` by default: every
            route is planned as drawn, and no repair worker is built.
            ``compute``: a route that crosses land where a shoreline grid
            holds it is repaired before it is planned (``suggest`` is the MCP
            server's variant and repairs the same way here).
        route_grids_dir: ``OPENWIND_ROUTE_GRIDS_DIR``, empty for the grids
            bundled with ``openwind_data``.
    """

    marc_atlas_dir: str = ""
    shom_c2d_dir: str = ""
    static_dir: Path | None = None
    upstream_budget_enabled: bool = True
    upstream_budget_limits: Mapping[str, float] | None = None
    route_repair: str = DEFAULT_REPAIR_MODE
    route_grids_dir: str = ""

    def upstream_budget(self) -> UpstreamBudget:
        """The budget these settings describe, as a fresh counter."""
        limits = (
            DEFAULT_LIMITS if self.upstream_budget_limits is None else self.upstream_budget_limits
        )
        return UpstreamBudget(limits, enabled=self.upstream_budget_enabled)

    @classmethod
    def from_env(cls, environ: dict[str, str] | None = None) -> Settings:
        env = os.environ if environ is None else environ
        raw_static = env.get("OPENWIND_STATIC_DIR", "")
        budget = UpstreamBudget.from_env(env)
        return cls(
            marc_atlas_dir=env.get(MARC_ATLAS_DIR_ENV, ""),
            shom_c2d_dir=env.get(SHOM_C2D_DIR_ENV, ""),
            static_dir=Path(raw_static) if raw_static else None,
            upstream_budget_enabled=budget.enabled,
            upstream_budget_limits=budget.limits(),
            route_repair=parse_repair_mode(env.get(ROUTE_REPAIR_ENV)),
            route_grids_dir=env.get(ROUTE_GRIDS_DIR_ENV, ""),
        )
