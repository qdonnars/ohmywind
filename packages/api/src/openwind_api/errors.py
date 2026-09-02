# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""One place that turns a failure into a response.

Before this module the same six ``except`` clauses appeared three times in the
REST entry point, and the web client told the user what went wrong by matching
regular expressions against English sentences written for a different audience
(``"forecast horizon exceeded for model ..."``). Any rewording of an engine
message silently broke a French error screen.

So every body now carries a stable ``code`` **in addition to** ``error``
(GO 3). ``error`` is unchanged, byte for byte, for every existing case: it is
still what an operator reads in a log and what an older client displays. Codes
are the contract for anything that branches.

The codes:

===========================  ======  ===========================================
code                         status  meaning
===========================  ======  ===========================================
``invalid_json``             422     the body did not parse
``missing_fields``           422     a required field was absent
``invalid_datetime``         422     a timestamp did not parse
``naive_datetime``           422     a timestamp parsed but carries no offset
``invalid_waypoints``        422     the route did not parse
``too_few_waypoints``        422     fewer than 2 points
``too_many_waypoints``       422     more than ``MAX_WAYPOINTS``
``waypoint_out_of_range``    422     a coordinate is not on Earth
``unknown_archetype``        422     no such boat
``invalid_efficiency``       422     outside (0, 1]
``invalid_polar``            422     the custom polar is malformed
``invalid_forecast_cache``   422     the browser cache payload is malformed
``invalid_sweep_interval``   422     the sweep step did not parse, or is < 1
``sweep_too_large``          422     the sweep exceeds the window cap
``forecast_horizon``         422     no model reaches that far ahead
``no_model_covered``         422     no model has data over that route
``invalid_query_params``     422     a query parameter is missing or unreadable
``invalid_time_window``      422     start/end pair refused
``too_many_steps``           422     the series would be longer than allowed
``invalid_request``          422     anything else the domain refused
``body_too_large``           413     the request body exceeds the ceiling
``rate_limited``             429     our own limiter, with ``retry_after``
``upstream_timeout``         503     Open-Meteo did not answer in time
``upstream_rate_limited``    503     Open-Meteo is refusing us
===========================  ======  ===========================================

A caller that does not recognise a code must fall back on the status: the list
grows, and a client pinned to an exhaustive match would break on the next
addition.
"""

from __future__ import annotations

import httpx
from openwind_data.adapters.base import ForecastHorizonError, UpstreamRateLimitError
from openwind_data.routing.passage import NoModelCoveredError
from starlette.responses import JSONResponse

# Codes that a ``ValueError`` earns from the wording the domain raised it with.
# Matching on text is unpleasant exactly once, here, at the boundary, instead
# of in every client that ever displays an error. The alternative is a typed
# exception per rule across the engine, which is the right long-term shape and
# a much larger change than adding a field.
_VALUE_ERROR_CODES: tuple[tuple[str, str], ...] = (
    ("at least 2 waypoints required", "too_few_waypoints"),
    ("too many waypoints", "too_many_waypoints"),
    ("out of range", "waypoint_out_of_range"),
    ("invalid waypoints", "invalid_waypoints"),
    ("must be timezone-aware", "naive_datetime"),
    ("efficiency must be", "invalid_efficiency"),
    ("sweep would produce", "sweep_too_large"),
    ("sweep_interval_hours must be", "invalid_sweep_interval"),
    ("must be <=", "invalid_datetime"),
)

DEFAULT_VALUE_ERROR_CODE = "invalid_request"


class RequestError(Exception):
    """A refusal decided before the engine runs, carrying its own status.

    Lets the parsing layer fail where the problem is, rather than returning a
    sentinel that every caller has to remember to check. Routes turn it into a
    response with one ``except``.
    """

    def __init__(self, message: str, code: str, *, status: int = 422) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status = status

    def response(self) -> JSONResponse:
        return error(self.message, self.code, status=self.status)


def error(message: str, code: str, *, status: int = 422, **extra: object) -> JSONResponse:
    """Build an error body.

    ``error`` first, then ``code``, then anything else: the key order is
    recorded in the goldens, and appending rather than inserting is what let
    ``code`` be added without rewriting the shape of every existing answer.
    """
    return JSONResponse({"error": message, "code": code, **extra}, status_code=status)


def code_for_value_error(exc: ValueError) -> str:
    """Classify a domain refusal by the sentence it was raised with."""
    text = str(exc)
    for needle, code in _VALUE_ERROR_CODES:
        if needle in text:
            return code
    return DEFAULT_VALUE_ERROR_CODE


def engine_error_response(exc: Exception) -> JSONResponse | None:
    """Map an exception raised by the passage engine, or return ``None``.

    ``None`` means "not mine": the caller re-raises and the failure surfaces
    as a 500, which is the correct answer for a bug. Only the failures the
    engine raises deliberately are translated here.

    The order of the branches is the order of the ``except`` clauses it
    replaces, which matters for ``ForecastHorizonError`` and
    ``NoModelCoveredError``: both are ``RuntimeError`` subclasses, neither is
    a ``ValueError``, and putting ``ValueError`` first would still have been
    wrong if they ever changed base class.
    """
    if isinstance(exc, KeyError):
        return error(f"unknown archetype: {exc}", "unknown_archetype")
    if isinstance(exc, ForecastHorizonError):
        return error(str(exc), "forecast_horizon")
    if isinstance(exc, NoModelCoveredError):
        return error(str(exc), "no_model_covered")
    if isinstance(exc, ValueError):
        return error(str(exc), code_for_value_error(exc))
    if isinstance(exc, httpx.TimeoutException):
        return error(
            "upstream weather service did not respond in time",
            "upstream_timeout",
            status=503,
        )
    if isinstance(exc, UpstreamRateLimitError):
        return error(str(exc), "upstream_rate_limited", status=503)
    return None
