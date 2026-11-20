#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars
"""Draw a route the server repaired: the assistant's route, the final one, the fine shoreline.

``render(fine, drawn, final, added, title, out, zoom=None)``: land in grey
(OSM land + breakwaters, the grid the repair used), the route the assistant
sent dashed in red, the final route in blue with the server's legs (those
touching a waypoint it added) thick and green. Run with ``--with matplotlib``.
"""

from __future__ import annotations

from collections.abc import Sequence
from itertools import pairwise
from pathlib import Path

import numpy as np

from openwind_data.routing.auto_route.repair import FineLand
from openwind_data.routing.geometry import Point


def render(
    fine: FineLand,
    drawn: Sequence[tuple[float, float]],
    final: Sequence[tuple[float, float]],
    added: Sequence[int],
    title: str,
    out: Path,
    zoom: tuple[float, float, float, float] | None = None,
) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    pts = [Point(*p) for p in [*drawn, *final]]
    region = fine.region_for([Point(*p) for p in final]) or fine.region_for(pts)
    if zoom:
        corners = [Point(zoom[0], zoom[1]), Point(zoom[2], zoom[3])]
        grid = region.crop(corners, 0)
    else:
        grid = region.crop([p for p in pts if region.contains(p)], 1500)
    step = max(1, max(grid.shape) // 1600)
    land = grid.land[::step, ::step]
    ext = [
        grid.lon0,
        grid.lon0 + grid.shape[1] * grid.dlon,
        grid.lat0,
        grid.lat0 + grid.shape[0] * grid.dlat,
    ]
    h, w = grid.shape
    fig, ax = plt.subplots(figsize=(10, 10 * min(2.0, max(0.4, h / w))))
    ax.imshow(land, origin="lower", cmap="Greys", vmin=0, vmax=2.2, extent=ext, aspect="auto")
    d = np.array(drawn)
    ax.plot(d[:, 1], d[:, 0], "--", color="#d62728", lw=1.6, label="route de l'assistant")
    ax.plot(d[:, 1], d[:, 0], "o", color="#d62728", ms=4)
    f = np.array(final)
    srv = set(added)
    for i, (a, b) in enumerate(pairwise(final)):
        server = i in srv or i + 1 in srv
        ax.plot(
            [a[1], b[1]],
            [a[0], b[0]],
            "-",
            color="#2ca02c" if server else "#1f77b4",
            lw=3.0 if server else 1.6,
            label=None,
        )
    ax.plot(f[:, 1], f[:, 0], ".", color="#1f77b4", ms=6)
    ax.plot([], [], "-", color="#1f77b4", lw=1.6, label="route finale, tronçon de l'assistant")
    ax.plot([], [], "-", color="#2ca02c", lw=3.0, label="tronçon retracé par le serveur")
    ax.set_xlim(ext[0], ext[1])
    ax.set_ylim(ext[2], ext[3])
    ax.set_title(title, fontsize=10)
    ax.legend(loc="best", fontsize=8)
    fig.tight_layout()
    fig.savefig(out, dpi=80)
    plt.close(fig)
