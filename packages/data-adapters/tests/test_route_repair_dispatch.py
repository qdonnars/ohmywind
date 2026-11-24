# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Route repairs run in a worker process and leave the event loop free."""

from __future__ import annotations

import asyncio
import math
import os
import time
from concurrent.futures import ThreadPoolExecutor
from itertools import pairwise
from pathlib import Path

import numpy as np

from openwind_data.routing.auto_route import NavGrid, dispatch
from openwind_data.routing.auto_route.dispatch import RepairPool, parse_repair_mode
from openwind_data.routing.auto_route.repair import (
    BUNDLED_GRIDS_DIR,
    FineLand,
    Repair,
    repair_route,
)
from openwind_data.routing.geometry import Point

PITCH = 0.0005


def _grid() -> NavGrid:
    land = np.zeros((200, 300), dtype=bool)
    land[80:120, 130:170] = True  # an island across the straight line
    return NavGrid(47.0, -3.0, PITCH, PITCH / math.cos(math.radians(47.0)), land)


def _write(directory: Path, g: NavGrid) -> None:
    n_lat, n_lon = g.shape
    np.savez(
        directory / "test.npz",
        land=np.packbits(g.land, axis=1),
        meta=np.array([g.lat0, g.lon0, g.dlat, g.dlon, n_lat, n_lon]),
    )


async def test_the_worker_repairs_like_the_inline_call_and_the_loop_keeps_turning(tmp_path):
    g = _grid()
    _write(tmp_path, g)
    route = [Point(*g.latlon(100, 20)), Point(*g.latlon(100, 280))]
    pool = RepairPool(tmp_path)
    try:
        beats: list[float] = []

        async def heartbeat() -> None:
            while True:
                await asyncio.sleep(0.005)
                beats.append(time.perf_counter())

        task = asyncio.create_task(heartbeat())
        rep = await pool.repair(route)
        task.cancel()
        inline = repair_route(FineLand.from_grid(g), route)
        assert rep is not None and inline is not None
        assert rep.points == inline.points and rep.changes == inline.changes
        assert pool._pool is not None
        [worker] = pool._pool._processes
        assert worker != os.getpid()
        # The worker takes a good second to start (spawn, numpy): the loop
        # must have kept beating meanwhile, never stalled for 200 ms.
        assert len(beats) > 10
        assert max(b - a for a, b in pairwise(beats)) < 0.2
    finally:
        pool.close()


async def test_no_grid_for_the_route_starts_no_worker(tmp_path):
    _write(tmp_path, _grid())
    pool = RepairPool(tmp_path)
    assert await pool.repair([Point(10.0, 10.0), Point(10.1, 10.1)]) is None
    empty = tmp_path / "empty"
    empty.mkdir()
    assert await RepairPool(empty).repair([Point(47.05, -2.95), Point(47.06, -2.9)]) is None
    assert pool._pool is None


def test_the_repair_is_off_by_default_and_can_be_turned_on():
    assert parse_repair_mode(None) == "off"
    assert parse_repair_mode("") == "off"
    assert parse_repair_mode(" COMPUTE ") == "compute"
    assert parse_repair_mode(" OFF ") == "off"
    assert parse_repair_mode("suggest") == "suggest"
    # A typo never turns the repair on.
    assert parse_repair_mode("nonsense") == "off"


def test_without_a_directory_the_pool_reads_the_bundled_grids():
    pool = RepairPool()
    assert pool._dir == str(BUNDLED_GRIDS_DIR)
    assert len(pool.fine.regions) == 3
    # Marseille to Porquerolles lies in the Provence grid, Brest to Ouessant
    # in none (Ouessant is west of the Bretagne sud grid).
    assert pool.fine.region_for([Point(43.295, 5.361), Point(43.0, 6.242)]) is not None
    assert pool.fine.region_for([Point(48.38, -4.49), Point(48.46, -5.10)]) is None


def _threaded(monkeypatch, tmp_path, work) -> RepairPool:
    """A pool on the synthetic grid whose worker is a thread running ``work``."""
    _write(tmp_path, _grid())
    pool = RepairPool(tmp_path)
    executor = ThreadPoolExecutor(max_workers=1)
    monkeypatch.setattr(pool, "_executor", lambda: executor)
    monkeypatch.setattr(dispatch, "_worker_repair", work)
    return pool


def _route() -> list[Point]:
    g = _grid()
    return [Point(*g.latlon(100, 20)), Point(*g.latlon(100, 280))]


async def test_a_route_answered_once_is_answered_from_memory(monkeypatch, tmp_path):
    calls: list[int] = []

    def work(points):
        calls.append(1)
        return Repair(points=list(points), changes=["x"])

    pool = _threaded(monkeypatch, tmp_path, work)
    first = await pool.repair(_route())
    # Rounded to 5 decimals: the same route sent back through JSON hits.
    again = await pool.repair([Point(p.lat + 1e-9, p.lon) for p in _route()])
    assert first is again and len(calls) == 1 and pool.cache_hits == 1


async def test_a_full_queue_leaves_routes_unrepaired_and_never_fails(monkeypatch, tmp_path):
    def work(points):
        time.sleep(0.2)
        return Repair(points=list(points))

    pool = _threaded(monkeypatch, tmp_path, work)
    routes = [[Point(p.lat, p.lon + k * 1e-4) for p in _route()] for k in range(10)]
    started = time.perf_counter()
    results = await asyncio.gather(*(pool.repair(r) for r in routes))
    # The first MAX_PENDING are repaired one behind the other, the rest are
    # shed at once rather than queued behind them.
    assert sum(r is not None for r in results) == dispatch.MAX_PENDING
    assert pool.shed == len(routes) - dispatch.MAX_PENDING
    assert time.perf_counter() - started < 0.2 * dispatch.MAX_PENDING + 0.5
    assert pool._pending == 0


async def test_a_repair_too_slow_is_dropped(monkeypatch, tmp_path):
    monkeypatch.setattr(dispatch, "TIMEOUT_S", 0.1)

    def work(points):
        time.sleep(0.5)
        return Repair(points=list(points))

    pool = _threaded(monkeypatch, tmp_path, work)
    started = time.perf_counter()
    assert await pool.repair(_route()) is None
    assert time.perf_counter() - started < 0.4
    assert pool.shed == 1
