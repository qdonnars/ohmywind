# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Process-wide objects the request handlers borrow rather than build.

The tidal atlases are the reason this module exists. A ``ShomC2dRegistry`` is
about 5 MB of numpy arrays and takes ~50 ms to load; a ``MarcAtlasRegistry``
scans a directory tree. Both used to be module-level globals in the REST
entry point, built again at import time, while ``build_server()`` in mcp-core
built a second copy of each for the MCP tools: two copies of everything in one
process, which the 2026-09 audit filed as M5. This holds one copy, built once
by ``create_app`` and reachable from any handler through
``request.app.state.services``.

Since PR 2.3 it also holds the *marine adapter*, and that is what closed the
other half of the audit's finding (M2). A REST request carrying no
``forecast_cache`` used to let the engine build itself a bare
``OpenMeteoAdapter``: no atlases, so the currents in the Raz de Sein came from
an 8 km global model while the same passage asked over MCP got SHOM; no cache
shared with the next request; and an ``httpx.AsyncClient`` opened and closed
around every upstream call. One adapter here, handed to both shells, retires
the three at once.

Nothing in this module knows about MCP. Handing the same adapter to
``build_server()`` is the deployment's job, which is what keeps this package
free of the MCP SDK.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass

import httpx
from openwind_data.adapters.base import MarineDataAdapter
from openwind_data.adapters.openmeteo import OpenMeteoAdapter
from openwind_data.currents.marc_atlas import MarcAtlasRegistry
from openwind_data.currents.router import compose_marine_adapter
from openwind_data.currents.shom_c2d_registry import ShomC2dRegistry

from openwind_api.settings import Settings

_logger = logging.getLogger(__name__)

# Matches ``OpenMeteoAdapter``'s own default. Named here because the client is
# now built outside the adapter, and a shared client with no timeout would
# pin a worker on an upstream that stops answering mid-body.
UPSTREAM_TIMEOUT_S = 10.0

# Connection pool for the whole process. Open-Meteo is two hosts (forecast and
# marine), the deployment runs a single uvicorn worker, and a passage fans out
# a dozen or so concurrent calls before the adapter's own 10 req/s pacing
# throttles them, so a small pool is plenty and bounds what a burst can open.
_POOL_LIMITS = httpx.Limits(max_connections=16, max_keepalive_connections=8)


@dataclass(frozen=True, slots=True)
class Services:
    """The atlases and the upstream adapter, built once.

    Both registries answer honestly when empty (no coverage anywhere), which
    is the state of any deployment built without the dataset secret, so
    nothing downstream needs to know whether they were populated.

    ``marine`` is the adapter every live passage goes through: an
    ``OpenMeteoAdapter`` on the shared HTTP client, wrapped in the SHOM > MARC
    > SMOC cascade when the shipped datasets can feed it. Requests that arrive
    with a ``forecast_cache`` still read from that instead: the browser
    already sampled the corridor, and the point of that payload is to keep the
    upstream load off the single deployment IP.
    """

    marc: MarcAtlasRegistry
    shom: ShomC2dRegistry
    http: httpx.AsyncClient
    marine: MarineDataAdapter

    @classmethod
    def from_settings(cls, settings: Settings) -> Services:
        marc = MarcAtlasRegistry.from_directory(settings.marc_atlas_dir)
        shom = ShomC2dRegistry.from_directory(settings.shom_c2d_dir)
        # Constructed outside a running loop on purpose: httpx binds nothing
        # at construction, and building it here rather than in the lifespan is
        # what lets ``create_app`` stay synchronous and lets a deployment hand
        # the same adapter to an MCP server before any loop exists. The
        # lifespan closes it.
        http = httpx.AsyncClient(timeout=UPSTREAM_TIMEOUT_S, limits=_POOL_LIMITS)
        return cls(
            marc=marc,
            shom=shom,
            http=http,
            marine=compose_marine_adapter(OpenMeteoAdapter(http), marc, shom),
        )

    async def aclose(self) -> None:
        """Release the shared connection pool. Called by the app's lifespan."""
        await self.http.aclose()

    async def warm_atlas_coverage(self) -> None:
        """Compute the MARC coverage rectangles once, in a worker thread.

        The walk reads one Parquet footer per tile and nothing else, but an
        ATLNE-sized atlas has thousands of them: 2.4 s measured over 3500
        tiles. Doing it at startup rather than on the first request keeps that
        cost off the critical path of whoever asks first, and doing it in a
        thread keeps it off the event loop, where 2.4 s would stall every MCP
        session on the single worker.

        Deliberately not awaited before the app starts serving: the Space
        already takes ~5 s to wake, and delaying the first request by another
        2.4 s to pre-compute an answer it may never ask for is the wrong
        trade. A request landing mid-warm-up recomputes rather than waiting on
        this task, which costs one duplicated walk in a thread and never a
        wrong answer.

        Never raises: a warm-up that fails must not take the deployment down
        with it, the endpoint would simply pay the cost itself.
        """
        started = time.perf_counter()
        try:
            cells = await asyncio.to_thread(self.marc.coverage_cells)
        except Exception:
            _logger.exception("atlas coverage warm-up failed; the endpoint will compute on demand")
            return
        # The one number that says whether this dataset still fits the design.
        # 2.4 s over 3500 tiles locally; if it ever creeps into the tens of
        # seconds the walk needs an index rather than a bigger thread.
        _logger.info(
            "atlas coverage warmed in %.2f s: %d atlas(es), %d rectangle(s)",
            time.perf_counter() - started,
            len(cells),
            sum(len(boxes) for _, boxes in cells),
        )
