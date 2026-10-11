# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Where we know that we do not know the current.

``unknown_zones.geojson`` next to this module lists, by hand and with a
documented reason for each, the waters where no source we serve describes
the real current: a basin run by a tidal power plant (the Rance, whose level
and streams follow EDF's operating orders, not the tide), a lock-controlled
estuary, a channel narrower than any grid. Inside one, the honest answer is
"unknown", not the number an atlas happens to hold there: MARC MANW reads a
dead basin above the Rance barrage (M2 amplitude zero), MARC MANGA a free
tide, and the cascade would serve either with a confidence tag.

What this is not: the hand-drawn pass boxes that ``narrow_pass`` dropped in
2026-09 corrected a value by intuition. A zone here corrects nothing. It
withholds a value, says so, and cites why; adding one takes a source, not a
feeling. Candidates found by scanning the atlases for dead cells are listed
in ``docs/tidal-world/zones-inconnues.md`` and stay candidates until someone
documents them.

Each feature carries ``id``, ``name`` (quoted in notices), ``reason``
(:data:`REASONS`), ``fields`` (what is withheld: ``current``, ``tide``) and
``source`` (the citation). The web app bundles a byte-identical copy.

numpy only, loaded once.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from importlib import resources

import numpy as np

from openwind_data.currents.tidal_gaps import _in_polygon, _polygons

# Why the current is unknown there:
# - ``managed``: an engineering work sets the flow (tidal power plant, lock, sluice);
# - ``unresolved``: a channel narrower than every grid we serve;
# - ``non_tidal``: the stream is driven by something no tidal atlas holds (river flood, wind).
REASONS = frozenset({"managed", "unresolved", "non_tidal"})
FIELDS = frozenset({"current", "tide"})

# The ``current_source`` a leg or a sea point carries once its current has
# been withheld. Not a source: the marker that there is none worth showing.
UNKNOWN_CURRENT_SOURCE = "unknown"


@dataclass(frozen=True, slots=True)
class UnknownZone:
    """One documented zone: what it is called, why, and what it withholds."""

    id: str
    name: str
    reason: str
    fields: frozenset[str]


@dataclass(frozen=True, slots=True)
class _Zone:
    zone: UnknownZone
    rings: tuple[tuple[np.ndarray, tuple[np.ndarray, ...]], ...]


@lru_cache(maxsize=1)
def _load() -> tuple[_Zone, ...]:
    text = resources.files("openwind_data.currents").joinpath("unknown_zones.geojson").read_text()
    out = []
    for feat in json.loads(text)["features"]:
        props = feat["properties"]
        rings = tuple(
            (
                np.asarray(poly[0], dtype=float),
                tuple(np.asarray(h, dtype=float) for h in poly[1:]),
            )
            for poly in _polygons(feat["geometry"])
        )
        zone = UnknownZone(
            id=str(props["id"]),
            name=str(props["name"]),
            reason=str(props["reason"]),
            fields=frozenset(str(f) for f in props["fields"]),
        )
        out.append(_Zone(zone, rings))
    return tuple(out)


def unknown_zone_at(lat: float, lon: float) -> UnknownZone | None:
    """The documented zone ``(lat, lon)`` falls in, or ``None``."""
    for z in _load():
        if any(_in_polygon(lon, lat, outer, holes) for outer, holes in z.rings):
            return z.zone
    return None


def _crosses_ring(lon1: float, lat1: float, lon2: float, lat2: float, ring: np.ndarray) -> bool:
    """Whether the segment cuts any edge of ``ring`` (strict orientation test)."""
    ax, ay, bx, by = lon1, lat1, lon2, lat2
    cx, cy = ring[:, 0], ring[:, 1]
    dx, dy = np.roll(cx, -1), np.roll(cy, -1)

    def orient(px, py, qx, qy, rx, ry):
        return (qx - px) * (ry - py) - (qy - py) * (rx - px)

    o1 = orient(ax, ay, bx, by, cx, cy)
    o2 = orient(ax, ay, bx, by, dx, dy)
    o3 = orient(cx, cy, dx, dy, ax, ay)
    o4 = orient(cx, cy, dx, dy, bx, by)
    return bool(np.any((o1 * o2 < 0) & (o3 * o4 < 0)))


def unknown_zone_along(lat1: float, lon1: float, lat2: float, lon2: float) -> UnknownZone | None:
    """The documented zone a leg touches: an end inside, or the leg cutting its edge.

    The engine samples a leg at its midpoint; a 10 nm leg from Saint-Malo
    to the Châtelier lock has its midpoint in the basin, but a leg that only
    clips the basin must lose its current too, since the time it spends
    there is time spent in a stream nobody describes.
    """
    for z in _load():
        for outer, holes in z.rings:
            if (
                _in_polygon(lon1, lat1, outer, holes)
                or _in_polygon(lon2, lat2, outer, holes)
                or _crosses_ring(lon1, lat1, lon2, lat2, outer)
            ):
                return z.zone
    return None
