# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The tide at a passage's two ends, as facts and never as a verdict.

A sailor reads a departure or an arrival against the water: "0.4 m, falling,
low water at 18:00" says at once whether the boat gets into a drying harbour,
over a sill or across a bar. This module turns an atlas height curve into
that reading. It says nothing about whether the water is enough: the
harbour's soundings and the boat's draught are the skipper's (or the model's,
reading a pilot book), not ours.

Each reading carries its scale, so a height is never read alone:
``cycle_range_m`` is the range of the tide running at that moment (the high
and low water around it), ``day_max_range_m`` the largest range of that day
at that point. Half a metre of range says the tide hardly matters (most of
the Mediterranean); five metres says it decides the plan.

Heights are given above chart datum (``"ZH"``, the reference of chart
soundings and drying heights) when the atlas cell carries one, around mean
sea level (``"MSL"``) otherwise. The atlas ``z0_hydro_m`` is the lowest
predicted level over a nodal cycle, the same shift the web's tide chart
applies: ZH = height around MSL - z0.

Pure: no I/O, no atlas lookup. The caller predicts the curve.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta

import numpy as np

# A reading needs the high and low water on both sides of it: half a lunar
# day either way covers the longest gap between two extremes, with room.
CURVE_MARGIN = timedelta(hours=14)
CURVE_STEP = timedelta(minutes=10)

# Two wiggles of one turn of the tide (a double high water, a stand) within
# this span are one event; the extreme one is kept. Same rule as the tidal
# stream tool.
_MERGE_WITHIN = timedelta(hours=2)


@dataclass(frozen=True, slots=True)
class Extreme:
    kind: str  # "high" or "low"
    time: datetime
    height_m: float  # in the curve's datum


@dataclass(frozen=True, slots=True)
class TideCurve:
    """A predicted height series at one point, in its datum, with its extremes."""

    times: tuple[datetime, ...]
    heights_m: np.ndarray  # same datum as ``datum``
    datum: str  # "ZH" or "MSL"
    source: str
    extremes: tuple[Extreme, ...] = field(default=())
    epochs: np.ndarray = field(default_factory=lambda: np.empty(0))

    @classmethod
    def build(
        cls,
        times: Sequence[datetime],
        heights_msl_m: Sequence[float],
        *,
        source: str,
        z0_hydro_m: float | None,
    ) -> TideCurve | None:
        """The curve in chart datum when ``z0_hydro_m`` is known, else around MSL."""
        h = np.asarray(heights_msl_m, dtype=float)
        if len(times) < 3 or len(h) != len(times) or not np.isfinite(h).all():
            return None
        datum = "MSL"
        if z0_hydro_m is not None and np.isfinite(z0_hydro_m):
            h = h - z0_hydro_m
            datum = "ZH"
        times = tuple(times)
        return cls(
            times=times,
            heights_m=h,
            datum=datum,
            source=source,
            extremes=_extremes(times, h),
            epochs=np.array([t.timestamp() for t in times]),
        )

    def covers(self, t: datetime) -> bool:
        return self.times[0] <= t <= self.times[-1]

    def height_at(self, t: datetime) -> float:
        return float(np.interp(t.timestamp(), self.epochs, self.heights_m))


def _extremes(times: Sequence[datetime], h: np.ndarray) -> tuple[Extreme, ...]:
    out: list[Extreme] = []
    for i in range(1, len(h) - 1):
        a, b, c = h[i - 1], h[i], h[i + 1]
        if b > a and b >= c:
            kind = "high"
        elif b < a and b <= c:
            kind = "low"
        else:
            continue
        if out and out[-1].kind == kind and times[i] - out[-1].time < _MERGE_WITHIN:
            if (b > out[-1].height_m) if kind == "high" else (b < out[-1].height_m):
                out[-1] = Extreme(kind, times[i], float(b))
            continue
        if out and out[-1].kind != kind and times[i] - out[-1].time < _MERGE_WITHIN:
            # A stand's dip between two humps of one high water: not a low.
            continue
        out.append(Extreme(kind, times[i], float(b)))
    return tuple(out)


def _extreme_view(e: Extreme) -> dict[str, object]:
    return {"type": e.kind, "time": e.time.isoformat(), "height_m": round(e.height_m, 2)}


def tide_reading(
    curve: TideCurve, t: datetime, *, coefficient: int | None = None
) -> dict[str, object] | None:
    """The tide at ``t``: height, trend, the extremes around it, and its scale.

    ``None`` when the curve does not frame ``t`` with an extreme on each side
    (a curve too short, or a point where the tide never turns).
    """
    if not curve.covers(t):
        return None
    previous = next((e for e in reversed(curve.extremes) if e.time <= t), None)
    upcoming = next((e for e in curve.extremes if e.time > t), None)
    if previous is None or upcoming is None:
        return None
    day = t.date()
    tz = t.tzinfo
    pairs = zip(curve.extremes, curve.extremes[1:], strict=False)
    day_ranges = [
        abs(a.height_m - b.height_m)
        for a, b in pairs
        if a.time.astimezone(tz).date() == day or b.time.astimezone(tz).date() == day
    ]
    out: dict[str, object] = {
        "height_m": round(curve.height_at(t), 2),
        "datum": curve.datum,
        "trend": "rising" if upcoming.kind == "high" else "falling",
        "previous": _extreme_view(previous),
        "next": _extreme_view(upcoming),
        "cycle_range_m": round(abs(previous.height_m - upcoming.height_m), 2),
        "day_max_range_m": round(max(day_ranges), 2) if day_ranges else None,
    }
    if coefficient is not None:
        out["coefficient"] = coefficient
    out["source"] = curve.source
    return out


def curve_times(start: datetime, end: datetime) -> list[datetime]:
    """The sampling a reading between ``start`` and ``end`` needs, margins included."""
    t, stop = start - CURVE_MARGIN, end + CURVE_MARGIN
    out = []
    while t <= stop:
        out.append(t)
        t += CURVE_STEP
    return out
