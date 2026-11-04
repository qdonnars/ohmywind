# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""``GET /healthz``: what this process is actually serving with.

The deployment can boot in a state that answers every request and is still
wrong: built without the tidal atlases, it plans the Raz de Sein on an 8 km
global current and says nothing louder than one INFO line at warm-up. From
outside, the two look identical until a sailor reads a number. This route
says which datasets are loaded, how much of the Open-Meteo budget is spent,
how full the forecast cache is and, when there is a CPU gate, how busy its
slots are, so a
post-deploy check, an uptime probe or a person with ``curl`` can tell.

Cheap on purpose: counters and lengths already in memory, no atlas walk, no
upstream call, no rate limit to consult. Nothing about callers: no address,
no bucket, no route.

Always 200 while the process answers. ``status`` is ``"ok"`` when every
dataset the cascade relies on is loaded and ``"degraded"`` otherwise, with
the reasons in ``problems``; a probe that wants a failing status reads the
field rather than the code, so a deployment that knowingly ships without the
atlases (a fork, a local run) is not reported as down.
"""

from __future__ import annotations

from collections import Counter
from typing import Any

from starlette.requests import Request
from starlette.responses import JSONResponse

from openwind_api.services import Services


def health_view(services: Services) -> dict[str, Any]:
    """The health document for these services. Pure, and cheap."""
    families = Counter(atlas.source_short for atlas in services.marc.atlases)
    shom_points = int(services.shom.lats.size)
    shom_atlases = len({int(a) for a in services.shom.atlas_ids.tolist()}) if shom_points else 0
    problems: list[str] = []
    if not services.marc.atlases:
        problems.append("no_harmonic_atlas")
    if not shom_points:
        problems.append("no_shom_c2d")
    if not services.land.loaded:
        problems.append("no_land_mask")
    body: dict[str, Any] = {
        "status": "degraded" if problems else "ok",
        "problems": problems,
        "atlases": {
            # Per family of the harmonic registry (MARC, BSH, NorKyst, ...),
            # as the atlases name their source.
            "harmonic": dict(sorted(families.items())),
            "harmonic_total": len(services.marc.atlases),
            "shom_c2d": {"atlases": shom_atlases, "points": shom_points},
        },
        "land_mask": services.land.loaded,
    }
    if services.weather is not None:
        body["forecast_cache"] = services.weather.stats()
    if services.budget is not None:
        body["upstream_budget"] = services.budget.snapshot()
    return body


async def healthz(request: Request) -> JSONResponse:
    services: Services = request.app.state.services
    return JSONResponse(health_view(services), headers={"Cache-Control": "no-store"})
