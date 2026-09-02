# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The two passage routes: pin a departure, or pin an arrival.

Both are thin by design. Reading the request is ``parsing``, turning a report
into JSON is ``openwind_data.views`` (shared with the MCP shell), turning a
failure into a body is ``errors``. What is left here is the sequencing, which
is the only part that differs between the two.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from openwind_data.routing.complexity import score_complexity
from openwind_data.routing.passage import (
    estimate_passage,
    estimate_passage_for_arrival,
    estimate_passage_windows,
    resolve_sweep_interval,
)
from openwind_data.views import (
    complexity_view,
    filter_windows_by_target_eta,
    passage_envelope,
    passage_view,
    skipped_windows_warning,
    sweep_view,
    widened_interval_warning,
    window_view,
)
from starlette.requests import Request
from starlette.responses import JSONResponse

from openwind_api.errors import RequestError, engine_error_response
from openwind_api.parsing import (
    PassageRequest,
    parse_optional_timestamp,
    parse_passage_request,
    parse_sweep_interval,
    parse_timestamp,
)


async def _json_body(request: Request) -> Any:
    try:
        return await request.json()
    except Exception as exc:
        raise RequestError("invalid JSON body", "invalid_json") from exc


async def api_passage(request: Request) -> JSONResponse:
    """Plan a passage from a departure time, or sweep a range of them.

    Sweep mode is triggered by ``latest_departure``: the same route, the same
    boat, every departure in the range, so a caller can compare windows
    without asking N times.
    """
    try:
        body = await _json_body(request)
        departure, parsed = parse_passage_request(body, timestamp_field="departure")
        latest_raw = body.get("latest_departure")
        if latest_raw is not None:
            return await _sweep(body, departure, parsed, latest_raw)
        return await _single(departure, parsed)
    except RequestError as exc:
        return exc.response()


async def api_passage_by_eta(request: Request) -> JSONResponse:
    """ETA-driven passage planner: caller pins arrival, solver finds departure.

    Body matches ``api_passage`` minus ``departure`` and plus
    ``target_arrival`` (ISO-8601, timezone-aware).

    Response shape mirrors ``api_passage`` single mode and adds an ``eta``
    block: ``{target_arrival}``.
    """
    try:
        body = await _json_body(request)
        target_arrival, parsed = parse_passage_request(body, timestamp_field="target_arrival")
    except RequestError as exc:
        return exc.response()

    try:
        plan = await estimate_passage_for_arrival(
            parsed.waypoints,
            target_arrival,
            parsed.archetype,
            efficiency=parsed.efficiency,
            model="auto",
            polar_override=parsed.polar_override,
            model_chain=parsed.model_chain,
            adapter=parsed.adapter,
        )
    except Exception as exc:
        response = engine_error_response(exc)
        if response is None:
            raise
        return response

    complexity = score_complexity(plan.report)
    return JSONResponse(
        passage_envelope(plan.report, complexity)
        | {
            "eta": {"target_arrival": plan.target_arrival.isoformat()},
            "forecast_updated_at": datetime.now(UTC).isoformat(),
        }
    )


async def _single(departure: datetime, parsed: PassageRequest) -> JSONResponse:
    try:
        passage = await estimate_passage(
            parsed.waypoints,
            departure,
            parsed.archetype,
            efficiency=parsed.efficiency,
            model="auto",
            polar_override=parsed.polar_override,
            model_chain=parsed.model_chain,
            adapter=parsed.adapter,
        )
    except Exception as exc:
        response = engine_error_response(exc)
        if response is None:
            raise
        return response

    complexity = score_complexity(passage)
    return JSONResponse(
        passage_envelope(passage, complexity)
        | {"forecast_updated_at": datetime.now(UTC).isoformat()}
    )


async def _sweep(
    body: Any, departure: datetime, parsed: PassageRequest, latest_raw: Any
) -> JSONResponse:
    latest_departure = parse_timestamp(latest_raw, "latest_departure")
    sweep_interval = parse_sweep_interval(body.get("sweep_interval_hours"))
    target_eta_raw = body.get("target_eta")
    target_eta_dt = parse_optional_timestamp(target_eta_raw, "target_eta")

    try:
        reports = await estimate_passage_windows(
            parsed.waypoints,
            departure,
            latest_departure,
            parsed.archetype,
            sweep_interval_hours=sweep_interval,
            efficiency=parsed.efficiency,
            model="auto",
            polar_override=parsed.polar_override,
            model_chain=parsed.model_chain,
            adapter=parsed.adapter,
        )
    except Exception as exc:
        response = engine_error_response(exc)
        if response is None:
            raise
        return response

    # Sweep is partial-tolerant: estimate_passage_windows skips windows that
    # hit ForecastHorizonError. Compute the expected count to surface a
    # meta-warning if some were dropped.
    #
    # Count against the interval the engine actually used, not the one
    # requested: it widens the spacing when windows x segments would blow the
    # simulation budget, and counting against the request would report the
    # windows we never intended to run as lost to a short forecast horizon.
    span_hours = (latest_departure - departure).total_seconds() / 3600
    effective_interval, expected_windows = (
        resolve_sweep_interval(span_hours, sweep_interval, len(reports[0].segments))
        if reports
        else (sweep_interval, int(span_hours / sweep_interval) + 1)
    )
    skipped_count = max(0, expected_windows - len(reports))

    windows: list[dict[str, Any]] = []
    for report in reports:
        score = score_complexity(report)
        window = window_view(report, score)
        # The full passage + complexity per window, so a frontend drill-down
        # ("click a row -> see detail") needs zero re-fetch. Appended after
        # the shared fields: the order is the contract.
        window["passage"] = passage_view(report)
        window["complexity_full"] = complexity_view(score)
        windows.append(window)

    meta_warnings: list[str] = []
    if effective_interval != sweep_interval:
        meta_warnings.append(
            widened_interval_warning(effective_interval, sweep_interval, len(reports[0].segments))
        )
    if skipped_count > 0:
        meta_warnings.append(skipped_windows_warning(skipped_count, len(windows)))
    if target_eta_dt is not None:
        windows, unmatched = filter_windows_by_target_eta(windows, target_eta_dt, target_eta_raw)
        if unmatched is not None:
            meta_warnings.append(unmatched)

    return JSONResponse(
        sweep_view(
            earliest=departure,
            latest=latest_departure,
            interval_hours=effective_interval,
            windows=windows,
            meta_warnings=meta_warnings,
        )
        | {"forecast_updated_at": datetime.now(UTC).isoformat()}
    )
