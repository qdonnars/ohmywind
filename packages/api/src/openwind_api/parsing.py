# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Reading an untrusted passage request, once instead of three times.

``/api/v1/passage`` and ``/api/v1/passage-by-eta`` ask for the same thing
under two names, and each used to parse it with its own copy of sixty lines.
The copies had already drifted: one coerced ``efficiency`` in two steps and
the other in one, and only one of them checked waypoint bounds before the
first upstream call. The 2026-09 audit filed that as M4.

Order of operations is preserved exactly, because it decides which message a
malformed request gets when several fields are wrong at once: required fields,
then the timestamp, then the route, then efficiency, then the polar, then the
model list, then the browser cache.

Every refusal raises ``RequestError`` with the wording the web client already
reads, plus a stable code.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from openwind_data.adapters.cache_backed import CacheBackedAdapter
from openwind_data.routing.archetypes import BoatPolar

# The polar reader lives in the domain since #514, shared with the MCP tool;
# re-exported here so this module stays the one place the routes read from.
from openwind_data.routing.custom_polar import (
    MAX_BOAT_SPEED_KN,
    optional_float,
    parse_polar,
)
from openwind_data.routing.geometry import Point, parse_waypoints

from openwind_api.errors import RequestError, code_for_value_error

__all__ = [
    "DEFAULT_EFFICIENCY",
    "MAX_BOAT_SPEED_KN",
    "MODEL_NAME_MAP",
    "PassageRequest",
    "build_cache_adapter",
    "optional_float",
    "parse_optional_timestamp",
    "parse_passage_request",
    "parse_polar",
    "parse_sweep_interval",
    "parse_timestamp",
    "translate_models",
]

DEFAULT_EFFICIENCY = 0.75

# Maps the web client's user-facing model names (see packages/web/src/config/
# modelConfig.ts) to the Open-Meteo unified-API slugs that the data-adapter
# already exercises in AUTO_FALLBACK_CHAIN. V1 scope: only the four chain
# members translate. Other web models (ARPEGE_*, ICON_GLOBAL/_D2, UKMO_*, GEM,
# DMI, METNO, ECMWF_AIFS) stay in the web table for forecast display but are
# silently dropped here because their slugs haven't been validated end-to-end
# against passage timing. Always append gfs_seamless as ultimate fallback so
# an exotic top-of-chain pick never leaves the chain empty at far horizons.
MODEL_NAME_MAP: dict[str, str] = {
    "AROME": "meteofrance_arome_france",
    "ICON": "icon_eu",
    "ECMWF": "ecmwf_ifs025",
    "GFS": "gfs_seamless",
}


@dataclass(frozen=True, slots=True)
class PassageRequest:
    """What both passage routes need, whatever they call their timestamp."""

    waypoints: list[Point]
    archetype: str
    efficiency: float
    polar_override: BoatPolar | None
    model_chain: tuple[str, ...] | None
    adapter: CacheBackedAdapter | None
    # ``repair_route`` (default true): whether the server may repair a route
    # that crosses land before planning it. The web app sends false for
    # « Revenir à mon tracé ».
    repair: bool = True
    # The chain the ``models`` field asked for, before a ``forecast_cache``
    # replaced it with the models it sampled: a repaired route is planned
    # live, off the cache, on this one.
    requested_model_chain: tuple[str, ...] | None = None


def parse_passage_request(body: Any, *, timestamp_field: str) -> tuple[datetime, PassageRequest]:
    """Read the shared half of a passage request.

    Args:
        body: the decoded JSON object.
        timestamp_field: ``"departure"`` or ``"target_arrival"``. Named rather
            than inferred so the error message points at the field the caller
            actually sent.

    Raises:
        RequestError: on any malformed field, with the original wording.
    """
    if not isinstance(body, dict):
        raise RequestError("invalid JSON body", "invalid_json")

    missing = [k for k in ("waypoints", timestamp_field, "archetype") if body.get(k) is None]
    if missing:
        raise RequestError(f"missing fields: {missing}", "missing_fields")

    when = parse_timestamp(body[timestamp_field], timestamp_field)

    try:
        waypoints = parse_waypoints(body["waypoints"])
    except ValueError as exc:
        raise RequestError(str(exc), code_for_value_error(exc)) from exc

    try:
        efficiency = float(body.get("efficiency", DEFAULT_EFFICIENCY))
    except (TypeError, ValueError) as exc:
        raise RequestError(f"invalid efficiency: {exc}", "invalid_efficiency") from exc

    try:
        polar_override = parse_polar(body.get("polar"))
    except ValueError as exc:
        raise RequestError(f"invalid polar: {exc}", "invalid_polar") from exc

    model_chain = translate_models(body.get("models"))
    requested_model_chain = model_chain

    repair = body.get("repair_route", True)
    if not isinstance(repair, bool):
        raise RequestError("invalid repair_route: true or false", "invalid_repair_route")

    try:
        adapter = build_cache_adapter(body.get("forecast_cache"))
    except ValueError as exc:
        raise RequestError(f"invalid forecast_cache: {exc}", "invalid_forecast_cache") from exc
    if adapter is not None:
        # The cache's models are already backend slugs in priority order; use
        # them as the chain so AUTO only walks models actually sampled
        # client-side.
        model_chain = adapter.models

    return when, PassageRequest(
        waypoints=waypoints,
        archetype=body["archetype"],
        efficiency=efficiency,
        polar_override=polar_override,
        model_chain=model_chain,
        adapter=adapter,
        repair=repair,
        requested_model_chain=requested_model_chain,
    )


def parse_timestamp(raw: Any, field: str, *, require_aware: bool = False) -> datetime:
    """ISO-8601, or a refusal naming the field the caller sent.

    ``require_aware`` refuses a value without an offset. The engine already
    does that for ``departure``, ``latest_departure`` and ``target_arrival``,
    and answers the same 422 ``naive_datetime``; the fields the engine never
    sees have to be checked here or they get read in the container's local
    time instead (audit Mo5).
    """
    try:
        parsed = datetime.fromisoformat(raw)
    except (ValueError, TypeError) as exc:
        raise RequestError(f"invalid {field}: {exc}", "invalid_datetime") from exc
    if require_aware and parsed.tzinfo is None:
        raise RequestError(f"{field} must be timezone-aware", "naive_datetime")
    return parsed


def parse_optional_timestamp(
    raw: Any, field: str, *, require_aware: bool = False
) -> datetime | None:
    return None if raw is None else parse_timestamp(raw, field, require_aware=require_aware)


def parse_sweep_interval(raw: Any) -> int:
    try:
        return int(raw if raw is not None else 1)
    except (TypeError, ValueError) as exc:
        raise RequestError(
            f"invalid sweep_interval_hours: {exc}", "invalid_sweep_interval"
        ) from exc


def translate_models(raw: Any) -> tuple[str, ...] | None:
    """Translate web model names to Open-Meteo slugs.

    Returns None when the caller didn't send a `models` field or the list is
    empty after filtering. Always appends gfs_seamless as last-resort fallback
    unless already present.
    """
    if not isinstance(raw, list):
        return None
    translated: list[str] = []
    for name in raw:
        if not isinstance(name, str):
            continue
        slug = MODEL_NAME_MAP.get(name)
        if slug and slug not in translated:
            translated.append(slug)
    if not translated:
        return None
    if "gfs_seamless" not in translated:
        translated.append("gfs_seamless")
    return tuple(translated)


def build_cache_adapter(raw: Any) -> CacheBackedAdapter | None:
    """Build a CacheBackedAdapter from the request's ``forecast_cache``, or None.

    When the web client has sampled the route corridor in the browser it posts
    a ``forecast_cache`` object; we read weather from it instead of calling
    Open-Meteo (distributes the upstream load off the single deployment IP).
    When absent (every MCP client, and web clients that fell back), returns
    None so the planner uses the default live OpenMeteoAdapter.

    Raises ``ValueError`` on a malformed payload so the caller returns 422.
    """
    if raw is None:
        return None
    return CacheBackedAdapter.from_payload(raw)
