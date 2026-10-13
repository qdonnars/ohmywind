# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Where a drawn route runs over land, from the coarse land mask.

The engine times a polyline exactly as drawn. A small model asked for
Cherbourg to Guernsey drew the leg straight across the Cotentin and got back
a quiet 11 h 40 passage; Brest to Ouessant went over the Léon, Ajaccio to
Calvi over Corsica. This walks each leg along the great circle the engine
sails, every 0.1 nm, against the mask the tidal overlay already uses
(Natural Earth 10 m, pixels of about 1 km, the sea dilated by two pixels so
a harbour or a river mouth stays at sea). A hit is therefore a point a
couple of kilometres inland, never a quay or an anchorage under a cliff;
the price is that a spit narrower than about 4 km, the tombolos of Giens,
goes unseen.

Pure functions of the points and the mask: an empty mask (no file shipped)
finds nothing.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from itertools import pairwise

from openwind_data.currents.land_mask import LandMask
from openwind_data.routing.geometry import Point, haversine_distance, interpolate_great_circle

# About 185 m: well under the mask's kilometre, so a crossing of one pixel
# is sampled at least five times.
STEP_NM = 0.1


@dataclass(frozen=True, slots=True)
class LandCrossing:
    """A leg that runs over land.

    ``leg`` counts from 0 (waypoint 0 to waypoint 1); ``land_nm`` is the
    length of the leg sampled ashore; ``lat``/``lon`` is the first sample
    ashore, where the leg leaves the sea.
    """

    leg: int
    land_nm: float
    lat: float
    lon: float


def waypoints_ashore(points: Sequence[Point], mask: LandMask) -> list[int]:
    """Indices of the waypoints that sit on land, inland of the dilated shore."""
    return [i for i, p in enumerate(points) if mask.is_land(p.lat, p.lon)]


def land_crossings(
    points: Sequence[Point], mask: LandMask, *, step_nm: float = STEP_NM
) -> list[LandCrossing]:
    """The legs whose open stretch, between their two waypoints, runs over land.

    The waypoints themselves are not sampled: :func:`waypoints_ashore` names
    them, so a departure placed inland can be told as a misplaced point and
    not only as the legs that reach it.
    """
    if not mask.loaded:
        return []
    out: list[LandCrossing] = []
    for i, (a, b) in enumerate(pairwise(points)):
        length = haversine_distance(a, b)
        n = max(2, math.ceil(length / step_nm))
        ashore = [
            p
            for p in (interpolate_great_circle(a, b, k / n) for k in range(1, n))
            if mask.is_land(p.lat, p.lon)
        ]
        if ashore:
            out.append(
                LandCrossing(
                    leg=i,
                    land_nm=round(len(ashore) * length / n, 1),
                    lat=ashore[0].lat,
                    lon=ashore[0].lon,
                )
            )
    return out
