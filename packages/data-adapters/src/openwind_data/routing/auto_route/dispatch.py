# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Route repairs in a worker process, off the caller's event loop.

A repair is a second of pure-Python search (A* over a shoreline grid). Run
inline in an async server it freezes every other request for that second;
in a thread it still holds the interpreter lock (event-loop lag measured up
to 150 ms). In one worker process the loop does not notice it (1 ms), the
repairs queue one behind the other, and the memory peak of a long leg lands
in the worker, not in the server.

The worker is spawned, so it imports the server's entry script again: that
script must start the server under ``if __name__ == "__main__":``, as
multiprocessing asks. Without the guard the worker dies trying to start a
second server, and every route goes unrepaired (logged each time).
"""

from __future__ import annotations

import asyncio
import logging
import multiprocessing
from collections.abc import Sequence
from concurrent.futures import ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from pathlib import Path

from openwind_data.routing.auto_route.repair import FineLand, Repair, repair_route
from openwind_data.routing.geometry import Point

logger = logging.getLogger(__name__)

# The worker's own copy of the grids, loaded once when it starts.
_worker_fine: FineLand | None = None


def _worker_init(grids_dir: str) -> None:
    global _worker_fine
    _worker_fine = FineLand.from_directory(grids_dir)


def _worker_repair(points: list[Point]) -> Repair | None:
    assert _worker_fine is not None
    return repair_route(_worker_fine, points)


class RepairPool:
    """The fine grids under ``grids_dir`` and one worker process to repair routes on them.

    The worker starts with the first route a grid holds, so a server that
    never repairs (no grids, routes elsewhere) never pays for it.
    """

    def __init__(self, grids_dir: Path | str | None) -> None:
        self._dir = str(grids_dir) if grids_dir else None
        self.fine = FineLand.from_directory(grids_dir)
        self._pool: ProcessPoolExecutor | None = None

    def _executor(self) -> ProcessPoolExecutor:
        if self._pool is None:
            # spawn: a fork of a server with running threads and open sockets
            # is not one to trust.
            self._pool = ProcessPoolExecutor(
                max_workers=1,
                mp_context=multiprocessing.get_context("spawn"),
                initializer=_worker_init,
                initargs=(self._dir,),
            )
        return self._pool

    async def repair(self, points: Sequence[Point]) -> Repair | None:
        """``repair_route`` in the worker; None when no grid holds the route.

        A worker that died (out of memory on a long leg) is replaced on the
        next call, and this route goes unrepaired: the caller falls back to
        its coarse check, as with no grid.
        """
        if self.fine.region_for(points) is None:
            return None
        loop = asyncio.get_running_loop()
        try:
            return await loop.run_in_executor(self._executor(), _worker_repair, list(points))
        except BrokenProcessPool:
            logger.exception(
                "route repair worker died; route left unrepaired "
                "(out of memory, or an entry script without a __main__ guard)"
            )
            self.close()
            return None

    def close(self) -> None:
        if self._pool is not None:
            self._pool.shutdown(wait=False, cancel_futures=True)
            self._pool = None
