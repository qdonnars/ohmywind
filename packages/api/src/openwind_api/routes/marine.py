# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Tidal atlas overlay, and where it is worth asking at all.

One point per call (``GET``) or a corridor at a time (``POST .../batch``).
The two answer the same object for the same point, from the same function:
the batch is a transport optimisation, not a second implementation, and a
client is free to mix them.
"""

from __future__ import annotations

import asyncio
import math
import os
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from openwind_data.routing.geometry import validate_point
from starlette.requests import Request
from starlette.responses import JSONResponse

from openwind_api.errors import RequestError, error
from openwind_api.parsing import parse_timestamp
from openwind_api.services import Services

# Hard ceiling on the number of instants a single overlay call may ask for.
# See the comment at the check site in ``_resolve_window``.
MAX_MARC_STEPS = 800

# Hard ceiling on the points one batch may carry. The web app samples a
# corridor at one point per segment and PR 0.3 brought a 200 nm route down to
# 21 of them, so 120 is several times the longest passage anyone plans here.
MAX_MARC_BATCH_POINTS = 120

# And a ceiling on the two multiplied, because neither of the others bounds
# it: 120 points is acceptable, 800 steps is acceptable, and 96 000
# point-steps is not. The series is materialised once and shared, but the
# prediction runs per point, so what a call costs is points x steps.
#
# Measured on the real atlases (2026-09-03, Iroise and rade de Brest, SHOM
# cascade): 21 points over 7 days hourly, which is the web app's own call, is
# 3549 point-steps and 0.29 s; 120 points over 7 days hourly is 20 280 and
# 1.7 s; the corner the first two ceilings left open, 120 points over 30 days
# hourly, is 86 520 and 5.2 s. The GET's 800-step ceiling was sized to keep
# one call under a second, and an overlay bucket of 120 requests a minute per
# IP cannot also hand out five seconds of CPU apiece.
#
# 24 000 is set from what the endpoint is for rather than from what it can
# survive: the web app sits seven times inside it, a 60-point corridor over 7
# days hourly (10 140) still fits, and the shapes it refuses are the ones
# nobody plans. It bounds the worst accepted call at 1.9 s rather than 5.2 s,
# measured the same way; that is a bound, not a comfortable one, and the
# number to lower if the overlay bucket ever has to be defended harder.
# Env-configurable so a deployment with more CPU than this one can raise it
# without a release.
MAX_BATCH_CELLS = int(os.environ.get("OPENWIND_MARC_BATCH_MAX_CELLS", "24000"))


@dataclass(frozen=True, slots=True)
class _Window:
    """The instants an overlay call asks about, already checked and built.

    Built once per request and shared by every point of a batch: the series
    depends only on ``start``, ``step_minutes`` and the count, so 120 points
    materialise one list of datetimes rather than 120 identical ones.
    """

    start: datetime
    step_minutes: int
    times: list[datetime]


class _TideCoefficient:
    """The national coefficient for this window, computed at most once.

    Brest-anchored and therefore the same everywhere, so it depends on the
    start of the window and on nothing else: a 120-point batch needs one
    evaluation, not 120. A thunk rather than a value because an uncovered
    point never reports it, and a wholly uncovered batch must not pay for a
    25-hour harmonic sweep nobody reads.
    """

    _UNSET = object()

    def __init__(self, services: Services, start: datetime) -> None:
        self._services = services
        self._start = start
        self._value: Any = self._UNSET

    def value(self) -> int | None:
        if self._value is self._UNSET:
            shom = self._services.shom
            self._value = shom.tide_coefficient(self._start) if shom.ref_ports else None
        return self._value


def _parse_step_minutes(raw: Any) -> int:
    """5 to 360 minutes, integer. ``None`` means the hourly default.

    A string because the query parameter is one, a JSON number because the
    batch body sends one; a float that is not whole, or a bool, is a mistake
    worth naming rather than truncating.
    """
    if raw is None:
        return 60
    if isinstance(raw, str):
        try:
            step = int(raw)
        except ValueError as exc:
            raise RequestError("step_minutes must be an integer", "invalid_query_params") from exc
    elif isinstance(raw, int) and not isinstance(raw, bool):
        step = raw
    else:
        raise RequestError("step_minutes must be an integer", "invalid_query_params")
    if step < 5 or step > 360:
        raise RequestError("step_minutes must be between 5 and 360", "invalid_query_params")
    return step


def _resolve_window(start: datetime, end: datetime, step_minutes: int) -> _Window:
    """The rules both overlay routes apply to a requested time window.

    Naive timestamps are read as UTC rather than refused: clients do send
    them, and a 422 here would only push the guess into the client.
    """
    if start.tzinfo is None:
        start = start.replace(tzinfo=UTC)
    if end.tzinfo is None:
        end = end.replace(tzinfo=UTC)
    if end <= start:
        raise RequestError("end must be after start", "invalid_time_window")
    span_days = (end - start).total_seconds() / 86400
    if span_days > 30:
        raise RequestError("time window must be at most 30 days", "invalid_time_window")

    # The two ceilings above bound the window and the step separately, and
    # their product is what actually costs: the SHOM predictor runs a Python
    # loop per instant (~1 ms each, measured 2026-09), so 30 days at a 5-minute
    # step is 8641 instants and ~8.8 s of blocking CPU on the single worker,
    # MCP sessions included. 800 steps keeps the worst case under a second and
    # still allows every shape the web app asks for: 30 days hourly is 721.
    n_steps = int((end - start).total_seconds() // (step_minutes * 60)) + 1
    if n_steps > MAX_MARC_STEPS:
        raise RequestError(
            f"requested {n_steps} steps, at most {MAX_MARC_STEPS}: "
            f"shorten the window or widen step_minutes",
            "too_many_steps",
        )
    return _Window(
        start=start,
        step_minutes=step_minutes,
        times=[start + timedelta(minutes=step_minutes * i) for i in range(n_steps)],
    )


# One ten-thousandth of a degree, about 11 m. Fine enough that rounding is
# invisible to a client deciding whether to call, coarse enough to keep the
# payload readable.
_BBOX_QUANTUM = 1e-4


def _services(request: Request) -> Services:
    return request.app.state.services


def overlay_for_point(
    services: Services,
    lat: float,
    lon: float,
    window: _Window,
    coefficient: _TideCoefficient,
) -> tuple[dict[str, Any], int]:
    """One point's overlay, and the max-age the GET stamps on it.

    The single implementation behind ``GET /api/v1/marine/marc`` and
    ``POST /api/v1/marine/marc/batch``: whatever the batch returns for a
    point is, byte for byte, what the GET returns for it. Two copies of this
    would drift on the first cascade change, and the client that overrides
    Open-Meteo with one of the two would silently disagree with itself.

    Pure: no request, no response, no clock. The caller decides the transport.
    """
    marc_loaded = bool(services.marc.atlases)
    shom_covers = services.shom.covers(lat, lon)
    cell = services.marc.cell_at(lat, lon) if marc_loaded else None
    # If neither MARC nor SHOM has anything at this point, return uncovered
    # so the client keeps its Open-Meteo SMOC baseline.
    if cell is None and not shom_covers:
        if not marc_loaded:
            # Cached briefly: attaching the dataset must not take a day to
            # become visible.
            return {"covered": False, "reason": "no atlas dataset loaded on this Space"}, 300
        return {"covered": False}, 86400

    times = window.times

    # MARC gives heights + currents on a regular grid (when covered); SHOM
    # gives hand-curated currents only (no heights). Tide always comes from
    # MARC because SHOM C2D ships no height series.
    h_result = services.marc.predict_height_series(lat, lon, times) if cell else None
    marc_c_result = services.marc.predict_current_series(lat, lon, times) if cell else None
    shom_c_result = services.shom.predict_current_series(lat, lon, times) if shom_covers else None

    # Cascade for currents: SHOM > MARC. atlas_resolution_m and z0_hydro_m
    # stay on MARC because SHOM resolution varies per cartouche and SHOM
    # has no chart-datum reference.
    if shom_c_result is not None:
        c_speeds_dirs_source: tuple[Any, Any, str] | None = shom_c_result
        atlas_resolution_m = None
    elif marc_c_result is not None:
        c_speeds_dirs_source = marc_c_result
        atlas_resolution_m = next(
            (a.resolution_m for a in services.marc.atlases if cell and a.name == cell.atlas_name),
            None,
        )
    else:
        c_speeds_dirs_source = None
        atlas_resolution_m = None

    payload: dict[str, Any] = {
        "covered": True,
        "atlas_resolution_m": atlas_resolution_m,
        "z0_hydro_m": cell.z0_hydro_m if cell else None,
        "times": [t.isoformat() for t in times],
        # National tidal coefficient at the start of the requested window
        # (Brest-anchored, integer in [20, 120]). Surfaced whenever the
        # SHOM registry has Brest constants loaded so the web client can
        # render the "Coef 87, vives-eaux" pill alongside the tide chart.
        "tide_coefficient": coefficient.value(),
    }
    if h_result is not None:
        payload["tide_height_m"] = [round(float(v), 4) for v in h_result[0]]
    if c_speeds_dirs_source is not None:
        speeds, dirs, source = c_speeds_dirs_source
        payload["current_speed_kn"] = [round(float(v), 4) for v in speeds]
        payload["current_direction_to_deg"] = [round(float(v), 2) for v in dirs]
        # SHOM source already comes as "shom_c2d_<atlas>_<zone>"; MARC needs
        # to be reformatted into the canonical "marc_<atlas>_<res>m" pattern.
        if source.lower().startswith("shom_c2d_"):
            payload["current_source"] = source.lower()
        elif cell and atlas_resolution_m:
            payload["current_source"] = f"marc_{cell.atlas_name.lower()}_{atlas_resolution_m}m"
        else:
            payload["current_source"] = source.lower()
    elif h_result is not None and cell and atlas_resolution_m:
        payload["current_source"] = f"marc_{cell.atlas_name.lower()}_{atlas_resolution_m}m"
    return payload, 86400


async def api_marc_overlay(request: Request) -> JSONResponse:
    """Return MARC PREVIMER currents and tide-height predictions for a point.

    Designed as a low-overhead overlay on top of Open-Meteo Marine: the web
    client calls Open-Meteo direct from the browser (per-IP scaling, no
    backend bottleneck) and in parallel calls this endpoint. When ``covered``
    is true, the client overrides Open-Meteo currents and tide_height_m with
    the MARC values; otherwise (Mediterranean, open ocean, polar regions),
    the client keeps the Open-Meteo response unchanged.

    Query params:
      ``lat``, ``lon`` -- required floats.
      ``start``, ``end`` -- required ISO-8601 timestamps (UTC assumed).
      ``step_minutes`` -- optional, default 60 (hourly series).

    Response shape (always 200 to avoid client-side 404 noise):
      ``{"covered": false}`` when outside MARC coverage.
      ``{"covered": true, "current_source": "marc_finis_250m",
         "atlas_resolution_m": 250, "z0_hydro_m": -3.85, "times": [...],
         "current_speed_kn": [...], "current_direction_to_deg": [...],
         "tide_height_m": [...]}`` when covered.

    Cache: 1 day (predictions are deterministic harmonics, time-series only
    differs per requested ``[start, end, step]``).

    ``POST /api/v1/marine/marc/batch`` answers the same object for many
    points at once; see ``api_marc_batch``.
    """
    services = _services(request)
    try:
        lat = float(request.query_params["lat"])
        lon = float(request.query_params["lon"])
        start = datetime.fromisoformat(request.query_params["start"])
        end = datetime.fromisoformat(request.query_params["end"])
    except (KeyError, ValueError, TypeError) as exc:
        return error(
            f"missing or invalid query params (lat, lon, start, end): {exc}",
            "invalid_query_params",
        )
    try:
        validate_point(lat, lon)
    except ValueError as exc:
        return error(str(exc), "waypoint_out_of_range")
    try:
        window = _resolve_window(
            start, end, _parse_step_minutes(request.query_params.get("step_minutes"))
        )
    except RequestError as exc:
        return exc.response()

    payload, max_age = overlay_for_point(
        services, lat, lon, window, _TideCoefficient(services, window.start)
    )
    return JSONResponse(payload, headers={"Cache-Control": f"public, max-age={max_age}"})


def _parse_points(raw: Any) -> list[tuple[float, float]]:
    """The corridor a batch asks about, in the order it was sent.

    Each point is validated exactly as the GET validates its ``lat``/``lon``,
    so a coordinate that would be refused one at a time is refused here too,
    with the same code. Order is the whole contract of the answer: the client
    zips the overlays back onto its own points by index.
    """
    if not isinstance(raw, list) or not raw:
        raise RequestError(
            "points must be a non-empty list of [lat, lon] pairs", "invalid_waypoints"
        )
    if len(raw) > MAX_MARC_BATCH_POINTS:
        raise RequestError(
            f"requested {len(raw)} points, at most {MAX_MARC_BATCH_POINTS}: "
            f"split the corridor across several calls",
            "too_many_points",
        )
    points: list[tuple[float, float]] = []
    for index, entry in enumerate(raw):
        if not isinstance(entry, list | tuple) or len(entry) != 2:
            raise RequestError(
                f"invalid point at index {index}: expected [lat, lon]", "invalid_waypoints"
            )
        try:
            lat, lon = float(entry[0]), float(entry[1])
        except (TypeError, ValueError) as exc:
            raise RequestError(
                f"invalid point at index {index}: expected [lat, lon]", "invalid_waypoints"
            ) from exc
        try:
            validate_point(lat, lon)
        except ValueError as exc:
            raise RequestError(str(exc), "waypoint_out_of_range") from exc
        points.append((lat, lon))
    return points


def _parse_batch(body: Any) -> tuple[list[tuple[float, float]], _Window]:
    """Read a batch request, or refuse it naming the field that is wrong."""
    if not isinstance(body, dict):
        raise RequestError("invalid JSON body", "invalid_json")
    missing = [key for key in ("points", "start", "end") if body.get(key) is None]
    if missing:
        raise RequestError(f"missing fields: {missing}", "missing_fields")
    points = _parse_points(body["points"])
    window = _resolve_window(
        parse_timestamp(body["start"], "start"),
        parse_timestamp(body["end"], "end"),
        _parse_step_minutes(body.get("step_minutes")),
    )
    # Last, because it is the only rule that needs both halves, and because
    # a caller who broke one of the first two should hear about that one.
    cells = len(points) * len(window.times)
    if cells > MAX_BATCH_CELLS:
        raise RequestError(
            f"requested {cells} point-steps, at most {MAX_BATCH_CELLS}: "
            f"fewer points, a shorter window or a wider step",
            "batch_too_large",
        )
    return points, window


async def api_marc_batch(request: Request) -> JSONResponse:
    """The overlay for a whole corridor, in one request.

    The web app asks for one overlay per corridor point, up to 21 on a 200 nm
    route since PR 0.3. Twenty-one round trips over a marina 4G link is
    twenty-one latencies, twenty-one rate-limit hits and twenty-one repeats
    of a time series that is identical for every one of them. This is the
    same work, once.

    Body::

        {"points": [[lat, lon], ...], "start": "<ISO>", "end": "<ISO>",
         "step_minutes": 60}

    Answers ``{"overlays": [...]}``, **one object per point, in the order the
    points were sent**, each exactly what ``GET /api/v1/marine/marc`` returns
    for that point, ``covered: false`` entries included. A client zips them
    back onto its own list by index, so nothing is dropped and nothing needs
    matching on coordinates.

    The window rules are the GET's, applied once for the whole call: the same
    422s, the same wording, the same 800-step ceiling. Two refusals are this
    route's own: ``too_many_points`` past 120 points, and ``batch_too_large``
    past ``MAX_BATCH_CELLS`` point-steps, which is the ceiling on what the
    call actually costs. The web app's own request is 3549 point-steps.

    Not cached. The GET is cacheable because its URL is the request; a POST
    body is not a cache key any intermediary would honour, and pretending
    otherwise with a ``Cache-Control`` header would only mislead. Clients
    that want the day-long cache still have the GET.

    Counts once against the overlay's own rate-limit bucket, whatever the
    number of points: replacing 21 requests with 1 must not cost 21 tokens,
    or the endpoint would be pointless.
    """
    services = _services(request)
    try:
        body = await request.json()
    except Exception:
        return error("invalid JSON body", "invalid_json")
    try:
        points, window = _parse_batch(body)
    except RequestError as exc:
        return exc.response()

    coefficient = _TideCoefficient(services, window.start)
    # Off the event loop: the predictor is vectorised per point but still
    # synchronous, and a full corridor is the one shape of request that can
    # hold the single worker long enough for an MCP session to notice. The
    # GET stays inline; one point is not worth a thread hop.
    overlays = await asyncio.to_thread(
        lambda: [
            overlay_for_point(services, lat, lon, window, coefficient)[0] for lat, lon in points
        ]
    )
    return JSONResponse({"overlays": overlays})


def _widen_to_quantum(bbox: tuple[float, float, float, float]) -> list[float]:
    """Round a bounding box outward, never inward.

    The boxes carry a promise: a point outside every one of them is a point
    the atlases do not cover. Rounding a bound the wrong way would shave a
    few metres off that promise and silently drop a covered point, so the
    minima floor and the maxima ceil.
    """
    lat_min, lon_min, lat_max, lon_max = bbox
    # The final round only cancels the binary representation error the
    # multiplication leaves behind (-20.0295 came out as -20.029500000000002
    # on the deployed answer). It moves a bound by ~1e-15 degrees, fifteen
    # orders of magnitude below the quantum the floor and ceil just added, so
    # the outward guarantee survives it intact.
    return [
        round(math.floor(lat_min / _BBOX_QUANTUM) * _BBOX_QUANTUM, 4),
        round(math.floor(lon_min / _BBOX_QUANTUM) * _BBOX_QUANTUM, 4),
        round(math.ceil(lat_max / _BBOX_QUANTUM) * _BBOX_QUANTUM, 4),
        round(math.ceil(lon_max / _BBOX_QUANTUM) * _BBOX_QUANTUM, 4),
    ]


async def api_marc_coverage(request: Request) -> JSONResponse:
    """Where the tidal atlases have anything to say, as bounding boxes.

    Exists so a client can decide not to ask. ``/api/v1/marine/marc`` answers
    200 with ``covered: false`` outside coverage, which is the right contract
    for a single point and the wrong cost for a route: a Mediterranean plan
    measured 14 uncovered answers out of 14 calls, one per corridor point,
    every one of them a round trip that could not have returned anything.

    Response::

        {"atlases": [{"name": "FINIS", "source": "marc",
                      "bbox": [lat_min, lon_min, lat_max, lon_max],
                      "cells": [[lat_min, lon_min, lat_max, lon_max], ...]}, ...]}

    Degrees WGS84, latitude first, matching the ``lat``/``lon`` order of the
    overlay's own query parameters. Sorted by source then name so a client can
    diff two answers, and an empty list when the deployment ships without the
    dataset (the same state the overlay reports as ``covered: false``).

    **Filter on ``cells``, not on ``bbox``.** A point outside every ``cells``
    entry is a point the atlases refuse; ``bbox`` is only the outer envelope
    and it is far too coarse to decide with. MARC coverage polygons are
    written as bounding boxes at build time, so ATLNE's runs from 39.98 N to
    64.99 N and from 20.03 W to 15.00 E and swallows the whole Mediterranean,
    where the model holds no valid cell: filtering on ``bbox`` alone skips
    nothing there, which is exactly where skipping pays (14 uncovered answers
    out of 14 in the live measurement). ``cells`` is the set of tiles that
    actually hold data, merged into rectangles; for SHOM it is the single
    zone box, which is already tight.

    The promise runs one way only, for both fields: outside every box there
    is nothing to fetch, inside one there may still be nothing. A MARC tile is
    half a degree wide and contains land; the SHOM cloud is scattered and has
    gaps. A client skipping outside them loses no data; a client assuming
    coverage inside them would be wrong.

    ``bbox`` is kept unchanged for the clients already reading it.
    """
    services = _services(request)
    # Off the event loop: on a cold cache this walks one Parquet footer per
    # tile, measured 2.4 s for an ATLNE-sized 3500-tile atlas. The startup
    # warm-up normally gets there first and this returns in microseconds.
    marc_cells = dict(await asyncio.to_thread(services.marc.coverage_cells))
    atlases: list[dict[str, Any]] = [
        {
            "name": atlas.name,
            "source": "marc",
            "bbox": _widen_to_quantum(atlas.bbox),
            "cells": [_widen_to_quantum(cell) for cell in marc_cells.get(atlas.name, ())],
        }
        for atlas in services.marc.atlases
    ]
    atlases += [
        {
            "name": name,
            "source": "shom",
            "bbox": _widen_to_quantum(bbox),
            # The zone box already wraps the points themselves rather than a
            # build-time envelope, so there is nothing finer to say.
            "cells": [_widen_to_quantum(bbox)],
        }
        for name, bbox in services.shom.coverage_zones()
    ]
    atlases.sort(key=lambda entry: (entry["source"], entry["name"]))
    # An empty answer is cached briefly, exactly like the overlay's "no atlas
    # dataset loaded" case: a deployment that boots before the dataset is
    # attached would otherwise tell every client to skip the atlases for a
    # whole day.
    max_age = 86400 if atlases else 300
    return JSONResponse(
        {"atlases": atlases},
        headers={"Cache-Control": f"public, max-age={max_age}"},
    )
