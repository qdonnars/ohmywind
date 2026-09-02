# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Tidal atlas overlay, and where it is worth asking at all."""

from __future__ import annotations

import asyncio
import math
from datetime import UTC, datetime, timedelta
from typing import Any

from openwind_data.routing.geometry import validate_point
from starlette.requests import Request
from starlette.responses import JSONResponse

from openwind_api.errors import error
from openwind_api.services import Services

# Hard ceiling on the number of instants a single overlay call may ask for.
# See the comment at the check site in ``api_marc_overlay``.
MAX_MARC_STEPS = 800

# One ten-thousandth of a degree, about 11 m. Fine enough that rounding is
# invisible to a client deciding whether to call, coarse enough to keep the
# payload readable.
_BBOX_QUANTUM = 1e-4


def _services(request: Request) -> Services:
    return request.app.state.services


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
    step_minutes = 60
    if "step_minutes" in request.query_params:
        try:
            step_minutes = int(request.query_params["step_minutes"])
        except ValueError:
            return error("step_minutes must be an integer", "invalid_query_params")
        if step_minutes < 5 or step_minutes > 360:
            return error("step_minutes must be between 5 and 360", "invalid_query_params")

    if start.tzinfo is None:
        start = start.replace(tzinfo=UTC)
    if end.tzinfo is None:
        end = end.replace(tzinfo=UTC)
    if end <= start:
        return error("end must be after start", "invalid_time_window")
    span_days = (end - start).total_seconds() / 86400
    if span_days > 30:
        return error("time window must be at most 30 days", "invalid_time_window")

    # The two ceilings above bound the window and the step separately, and
    # their product is what actually costs: the SHOM predictor runs a Python
    # loop per instant (~1 ms each, measured 2026-09), so 30 days at a 5-minute
    # step is 8641 instants and ~8.8 s of blocking CPU on the single worker,
    # MCP sessions included. 800 steps keeps the worst case under a second and
    # still allows every shape the web app asks for: 30 days hourly is 721.
    n_steps = int((end - start).total_seconds() // (step_minutes * 60)) + 1
    if n_steps > MAX_MARC_STEPS:
        return error(
            f"requested {n_steps} steps, at most {MAX_MARC_STEPS}: "
            f"shorten the window or widen step_minutes",
            "too_many_steps",
        )

    marc_loaded = bool(services.marc.atlases)
    shom_covers = services.shom.covers(lat, lon)
    cell = services.marc.cell_at(lat, lon) if marc_loaded else None
    # If neither MARC nor SHOM has anything at this point, return uncovered
    # so the client keeps its Open-Meteo SMOC baseline.
    if cell is None and not shom_covers:
        if not marc_loaded:
            return JSONResponse(
                {"covered": False, "reason": "no atlas dataset loaded on this Space"},
                headers={"Cache-Control": "public, max-age=300"},
            )
        return JSONResponse(
            {"covered": False},
            headers={"Cache-Control": "public, max-age=86400"},
        )

    times = [start + timedelta(minutes=step_minutes * i) for i in range(n_steps)]

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
        "tide_coefficient": services.shom.tide_coefficient(start)
        if services.shom.ref_ports
        else None,
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
    return JSONResponse(
        payload,
        headers={"Cache-Control": "public, max-age=86400"},
    )


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
