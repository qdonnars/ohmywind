# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Route repairs run in a worker process and leave the event loop free."""

from __future__ import annotations

import asyncio
import math
import os
import time
from itertools import pairwise
from pathlib import Path

import numpy as np

from openwind_data.routing.auto_route import NavGrid
from openwind_data.routing.auto_route.dispatch import RepairPool
from openwind_data.routing.auto_route.repair import FineLand, repair_route
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
    assert await RepairPool(None).repair([Point(47.05, -2.95), Point(47.06, -2.9)]) is None
    assert pool._pool is None
