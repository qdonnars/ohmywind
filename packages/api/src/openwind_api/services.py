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

Sharing the same instance with the MCP server is the next step (PR 2.3) and
needs the composite adapter to move here too; this package deliberately knows
nothing about MCP, so that wiring belongs to whoever mounts both.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass

from openwind_data.currents.marc_atlas import MarcAtlasRegistry
from openwind_data.currents.shom_c2d_registry import ShomC2dRegistry

from openwind_api.settings import Settings

_logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class Services:
    """The atlases, loaded once.

    Both registries answer honestly when empty (no coverage anywhere), which
    is the state of any deployment built without the dataset secret, so
    nothing downstream needs to know whether they were populated.
    """

    marc: MarcAtlasRegistry
    shom: ShomC2dRegistry

    @classmethod
    def from_settings(cls, settings: Settings) -> Services:
        return cls(
            marc=MarcAtlasRegistry.from_directory(settings.marc_atlas_dir),
            shom=ShomC2dRegistry.from_directory(settings.shom_c2d_dir),
        )

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
