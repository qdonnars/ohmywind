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
import time
from collections import OrderedDict
from collections.abc import Sequence
from concurrent.futures import ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from pathlib import Path

from openwind_data.routing.auto_route.repair import (
    FineLand,
    Repair,
    repair_route,
    resolve_grids_dir,
)
from openwind_data.routing.geometry import Point

logger = logging.getLogger(__name__)

# ``OPENWIND_ROUTE_REPAIR``: what a server does with a route that crosses land
# where a shoreline grid holds it. ``compute`` (the default) plans the repaired
# route and says what changed; ``suggest`` (MCP only; REST treats it as
# ``compute``) refuses a retraced route with the repaired waypoints to send
# back; ``off`` repairs nothing, the MCP server falls back to its coarse land
# check and REST plans the route as drawn.
REPAIR_MODES = ("off", "compute", "suggest")

# Load guards, the same for every caller since REST and MCP share the pool.
# A route already repaired is answered from memory: the web app sends the
# same route again on every change of departure or boat, and the MCP client
# often retries a call. Keyed on the points rounded to 5 decimals (about 1 m).
CACHE_SIZE = 512
CACHE_DECIMALS = 5
# More repairs than this already waiting on the worker, or a repair that has
# not come back within this many seconds (queue included), and the route goes
# unrepaired: the caller falls back to what it does without a grid. A repair
# takes 0.3 s in median and 1.2 s at worst on a workstation, two to three
# times that on the Space.
MAX_PENDING = 4
TIMEOUT_S = 6.0
DEFAULT_REPAIR_MODE = "compute"


def parse_repair_mode(raw: str | None) -> str:
    """The mode ``raw`` names, the default when unset; an unknown value is logged and defaulted."""
    mode = (raw or "").strip().lower()
    if not mode:
        return DEFAULT_REPAIR_MODE
    if mode not in REPAIR_MODES:
        logger.warning(
            "OPENWIND_ROUTE_REPAIR=%r is not one of %s: using %r",
            raw,
            "|".join(REPAIR_MODES),
            DEFAULT_REPAIR_MODE,
        )
        return DEFAULT_REPAIR_MODE
    return mode


# The worker's own copy of the grids, loaded once when it starts.
_worker_fine: FineLand | None = None


def _worker_init(grids_dir: str | None) -> None:
    global _worker_fine
    _worker_fine = FineLand.from_directory(grids_dir)


def _worker_repair(points: list[Point]) -> Repair | None:
    assert _worker_fine is not None
    return repair_route(_worker_fine, points)


class RepairPool:
    """The fine grids under ``grids_dir`` and one worker process to repair routes on them.

    ``grids_dir`` empty or None means the grids bundled with this package.
    One pool per process: a deployment that serves both the REST API and the
    MCP server hands the same pool to both, so their repairs queue on one
    worker rather than two.

    The worker starts with the first route a grid holds, so a server that
    never repairs (routes elsewhere) never pays for it.
    """

    def __init__(self, grids_dir: Path | str | None = None) -> None:
        self._dir = str(resolve_grids_dir(grids_dir))
        self._fine: FineLand | None = None
        self._pool: ProcessPoolExecutor | None = None
        self._cache: OrderedDict[tuple[tuple[float, float], ...], Repair | None] = OrderedDict()
        self._pending = 0  # submitted to the worker and not finished yet
        self.cache_hits = 0
        self.shed = 0  # routes left unrepaired by the load guards

    @property
    def fine(self) -> FineLand:
        """The grids, read on first use (0.4 s, 7.5 MB): a server that is built but never asked pays nothing."""
        if self._fine is None:
            self._fine = FineLand.from_directory(self._dir)
        return self._fine

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
        """``repair_route`` in the worker; None when the route goes unrepaired.

        None when no grid holds the route, and when the pool sheds the load:
        more than ``MAX_PENDING`` repairs already waiting, no answer within
        ``TIMEOUT_S``, or a worker that died (out of memory on a long leg; it
        is replaced on the next call). The caller then does what it does
        without a grid. A route answered once is answered from memory after.
        """
        if self._fine is None:
            # Read once, off the event loop.
            await asyncio.to_thread(lambda: self.fine)
        if self.fine.region_for(points) is None:
            return None
        key = tuple((round(p.lat, CACHE_DECIMALS), round(p.lon, CACHE_DECIMALS)) for p in points)
        if key in self._cache:
            self._cache.move_to_end(key)
            self.cache_hits += 1
            logger.info("route repair: answered from memory")
            return self._cache[key]
        if self._pending >= MAX_PENDING:
            self.shed += 1
            logger.warning("route repair: %d already waiting, route left unrepaired", self._pending)
            return None
        loop = asyncio.get_running_loop()
        started = time.perf_counter()
        self._pending += 1
        try:
            future = self._executor().submit(_worker_repair, list(points))
        except BrokenProcessPool:
            self._pending -= 1
            self._worker_died()
            return None
        future.add_done_callback(lambda _: self._done_from(loop))
        try:
            rep = await asyncio.wait_for(asyncio.wrap_future(future), TIMEOUT_S)
        except TimeoutError:
            # A repair not started yet is dropped; one running finishes in
            # the worker and its result is lost, the caller has moved on.
            future.cancel()
            self.shed += 1
            logger.warning(
                "route repair: no answer within %.0f s, route left unrepaired", TIMEOUT_S
            )
            return None
        except BrokenProcessPool:
            self._worker_died()
            return None
        total = time.perf_counter() - started
        seconds = rep.seconds if rep is not None else 0.0
        logger.info(
            "route repair: %.2f s in the worker, %.2f s waiting, %s",
            seconds,
            max(0.0, total - seconds),
            "refused"
            if rep is not None and rep.refusal
            else ("changed" if rep is not None and rep.changes else "unchanged"),
        )
        self._cache[key] = rep
        if len(self._cache) > CACHE_SIZE:
            self._cache.popitem(last=False)
        return rep

    def _done_from(self, loop: asyncio.AbstractEventLoop) -> None:
        # Called from the executor's thread: count on the loop's.
        try:
            loop.call_soon_threadsafe(self._done)
        except RuntimeError:  # the loop closed meanwhile (shutdown)
            pass

    def _done(self) -> None:
        self._pending -= 1

    def _worker_died(self) -> None:
        logger.exception(
            "route repair worker died; route left unrepaired "
            "(out of memory, or an entry script without a __main__ guard)"
        )
        self.close()

    def close(self) -> None:
        """Stop the worker. Terminated, not asked: a server that exits right
        after would kill the executor's thread before it tells the worker to
        stop, and the worker would outlive it (seen on a local run)."""
        if self._pool is not None:
            workers = list(self._pool._processes.values())
            self._pool.shutdown(wait=False, cancel_futures=True)
            for worker in workers:
                worker.terminate()
            self._pool = None
