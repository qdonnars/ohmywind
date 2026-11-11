# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""A process-wide budget of Open-Meteo calls, spent before Open-Meteo says no.

Open-Meteo's free tier is counted per IP: 600 calls a minute, 5 000 an hour,
10 000 a day (https://open-meteo.com/en/terms). A deployment has one egress
address, shared by every user of the service, so the day the quota runs out
it runs out for everyone at once, and an hourly or daily refusal lasts. One
``plan_passage`` costs 20 to 120 weighted calls, which is a few hundred
plans an hour.

So the adapter asks this object before every request, and the object says
no a little before Open-Meteo would: by default at about 80 % of each
counter. A refusal here costs the one caller a clear error with a wait; a
refusal there costs every caller the same, without warning, and on a shared
IP it can also be the neighbours' traffic that tipped it.

What is counted is what Open-Meteo counts (its pricing page, and
https://github.com/open-meteo/open-meteo/issues/1295): a request weighs
``max(1, variables / 10) x max(1, days / 14)`` per location, and a
multi-coordinate request of N points weighs N times that. A cache hit never
reaches the network and never reaches this object.

The windows slide (the last 60 s, 3 600 s, 86 400 s) where Open-Meteo's clocks
are fixed. Sliding is the stricter of the two, so a budget that never refuses
here cannot be overrun there by a burst across a boundary.

Cloud-agnostic and synchronous: no I/O, a lock for the counters, nothing
that knows where it runs.
"""

from __future__ import annotations

import logging
import math
import threading
import time
from collections import deque
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import date

from openwind_data.adapters.base import RateLimitWindow, UpstreamBudgetExhaustedError

_logger = logging.getLogger(__name__)

# Open-Meteo's free tier, per IP.
FREE_TIER_LIMITS: dict[RateLimitWindow, int] = {"minute": 600, "hour": 5000, "day": 10000}

# The share of each counter this process allows itself by default. Below the
# whole quota because the address is shared: another tenant of the same
# egress spends from the same counters, and a refusal must come from us while
# there is still room for the requests already in flight.
DEFAULT_SHARE = 0.8
DEFAULT_LIMITS: dict[str, float] = {
    window: float(int(limit * DEFAULT_SHARE)) for window, limit in FREE_TIER_LIMITS.items()
}

_WINDOWS: tuple[RateLimitWindow, ...] = ("minute", "hour", "day")
_WINDOW_S: dict[RateLimitWindow, float] = {"minute": 60.0, "hour": 3600.0, "day": 86400.0}

# Environment variables a deployment wrapper may read (see ``from_env``).
BUDGET_ENABLED_ENV = "OPENWIND_UPSTREAM_BUDGET"
BUDGET_LIMIT_ENV: dict[RateLimitWindow, str] = {
    "minute": "OPENWIND_UPSTREAM_BUDGET_PER_MINUTE",
    "hour": "OPENWIND_UPSTREAM_BUDGET_PER_HOUR",
    "day": "OPENWIND_UPSTREAM_BUDGET_PER_DAY",
}


def request_weight(params: Mapping[str, object]) -> float:
    """What one Open-Meteo request counts for, read off its query parameters.

    ``latitude`` holds one value per location, comma-separated; ``hourly``
    one name per variable; ``start_date`` and ``end_date`` are inclusive
    calendar days. A parameter that does not read falls back to the
    conservative 1 of its factor, never to 0: a request we cannot weigh still
    counts.
    """
    locations = max(1, len(str(params.get("latitude", "")).split(",")))
    variables = max(1, len([v for v in str(params.get("hourly", "")).split(",") if v]))
    days = 1
    try:
        start = date.fromisoformat(str(params["start_date"]))
        end = date.fromisoformat(str(params["end_date"]))
        days = max(1, (end - start).days + 1)
    except (KeyError, ValueError):
        pass
    return locations * max(1.0, variables / 10) * max(1.0, days / 14)


@dataclass(slots=True)
class _Window:
    """One sliding window: its stamps, their running sum, its ceiling."""

    name: RateLimitWindow
    span_s: float
    limit: float
    stamps: deque[tuple[float, float]]
    used: float = 0.0
    # True from the first refusal until a request passes again: the WARNING
    # is logged once per episode, not once per refused request.
    exhausted: bool = False

    def purge(self, now: float) -> None:
        cutoff = now - self.span_s
        while self.stamps and self.stamps[0][0] <= cutoff:
            _, weight = self.stamps.popleft()
            self.used -= weight
        if not self.stamps:
            # Floating-point residue from many additions and subtractions.
            self.used = 0.0

    def wait_for(self, weight: float, now: float) -> float:
        """Seconds until ``weight`` fits under the ceiling, 0 when it fits now."""
        if self.used + weight <= self.limit:
            return 0.0
        if weight > self.limit:
            # Could never fit, even in an empty window: say the whole window.
            return self.span_s
        freed = 0.0
        for stamp, w in self.stamps:
            freed += w
            if self.used - freed + weight <= self.limit:
                return max(0.0, stamp + self.span_s - now)
        return self.span_s


class UpstreamBudget:
    """Sliding-window counters over the calls this process sends Open-Meteo.

    ``limits`` maps a window to its ceiling in weighted calls; a window left
    out, or set to 0 or less, is not enforced. ``enabled=False`` turns the
    whole budget into a counter that never refuses, which still answers
    ``snapshot()`` for the health route.

    Thread-safe, although every request leaves from the event loop today:
    the lock costs nothing and makes the object safe to read from a worker
    thread, which is where the health route may one day compute.
    """

    def __init__(
        self,
        limits: Mapping[str, float] | None = None,
        *,
        enabled: bool = True,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        chosen: dict[str, float] = dict(DEFAULT_LIMITS if limits is None else limits)
        self.enabled = enabled
        self._clock = clock
        self._lock = threading.Lock()
        self._windows = [
            _Window(name=w, span_s=_WINDOW_S[w], limit=float(chosen[w]), stamps=deque())
            for w in _WINDOWS
            if w in chosen and chosen[w] > 0
        ]
        self.refused = 0
        self.spent = 0.0

    @classmethod
    def from_env(cls, environ: Mapping[str, str]) -> UpstreamBudget:
        """The budget a deployment asked for, defaults where it said nothing.

        ``OPENWIND_UPSTREAM_BUDGET=0`` (or ``off``, ``false``) disables it.
        ``OPENWIND_UPSTREAM_BUDGET_PER_MINUTE`` / ``_HOUR`` / ``_DAY`` set
        each ceiling in weighted calls, 0 leaving that window unenforced. An
        unreadable value keeps the default rather than failing the boot: a
        budget is a safety net, and a typo must not be what takes the
        deployment down.
        """
        enabled = environ.get(BUDGET_ENABLED_ENV, "1").strip().lower() not in {
            "0",
            "off",
            "false",
            "no",
        }
        limits: dict[str, float] = dict(DEFAULT_LIMITS)
        for window, name in BUDGET_LIMIT_ENV.items():
            raw = environ.get(name, "").strip()
            if not raw:
                continue
            try:
                limits[window] = float(raw)
            except ValueError:
                _logger.warning("ignoring %s=%r: not a number", name, raw)
        return cls(limits, enabled=enabled)

    def limits(self) -> dict[str, float]:
        """The enforced ceilings, by window; a window left out is not enforced."""
        return {window.name: window.limit for window in self._windows}

    def spend(self, weight: float) -> None:
        """Count ``weight`` against every window, or refuse it.

        Atomic: either every window records the call or none does, so a
        refused request leaves no trace in the counters and the window drains
        on schedule while the caller waits.

        Raises:
            UpstreamBudgetExhaustedError: the call would take a window past
                its ceiling. Carries the window and the wait until it fits.
        """
        with self._lock:
            now = self._clock()
            for window in self._windows:
                window.purge(now)
            if self.enabled:
                for window in self._windows:
                    wait = window.wait_for(weight, now)
                    if wait > 0:
                        self.refused += 1
                        if not window.exhausted:
                            window.exhausted = True
                            _logger.warning(
                                "open-meteo budget reached: window=%s used=%.0f limit=%.0f "
                                "retry_after=%.0fs; refusing upstream calls until it drains",
                                window.name,
                                window.used,
                                window.limit,
                                wait,
                            )
                        raise UpstreamBudgetExhaustedError(window.name, max(1.0, math.ceil(wait)))
            for window in self._windows:
                if window.exhausted:
                    window.exhausted = False
                    _logger.info("open-meteo budget available again: window=%s", window.name)
                window.stamps.append((now, weight))
                window.used += weight
            self.spent += weight

    def snapshot(self) -> dict[str, object]:
        """The counters as they stand: cheap, and free of anything personal."""
        with self._lock:
            now = self._clock()
            windows: dict[str, dict[str, float]] = {}
            for window in self._windows:
                window.purge(now)
                windows[window.name] = {
                    "used": round(window.used, 1),
                    "limit": window.limit,
                    "remaining": round(max(0.0, window.limit - window.used), 1),
                }
            return {
                "enabled": self.enabled,
                "windows": windows,
                "spent_total": round(self.spent, 1),
                "refused_total": self.refused,
            }
