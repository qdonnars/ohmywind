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

import math
from dataclasses import dataclass
from datetime import datetime
from itertools import pairwise
from typing import Any

from openwind_data.adapters.cache_backed import CacheBackedAdapter
from openwind_data.routing.archetypes import BoatPolar
from openwind_data.routing.geometry import Point, parse_waypoints

from openwind_api.errors import RequestError, code_for_value_error

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

# The polar matrix ceiling, and the same value as the web's MOTOR_MAX_KN.
# Keep the three aligned or the web will show a motor the simulation silently
# ignores.
MAX_BOAT_SPEED_KN = 30.0


@dataclass(frozen=True, slots=True)
class PassageRequest:
    """What both passage routes need, whatever they call their timestamp."""

    waypoints: list[Point]
    archetype: str
    efficiency: float
    polar_override: BoatPolar | None
    model_chain: tuple[str, ...] | None
    adapter: CacheBackedAdapter | None


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
    )


def parse_timestamp(raw: Any, field: str) -> datetime:
    """ISO-8601, or a refusal naming the field the caller sent."""
    try:
        return datetime.fromisoformat(raw)
    except (ValueError, TypeError) as exc:
        raise RequestError(f"invalid {field}: {exc}", "invalid_datetime") from exc


def parse_optional_timestamp(raw: Any, field: str) -> datetime | None:
    return None if raw is None else parse_timestamp(raw, field)


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


def parse_polar(raw: Any) -> BoatPolar | None:
    """Build a BoatPolar from the web client's `polar` payload. Returns None
    when no payload is provided. Raises ValueError on shape mismatch / invalid
    values so the caller can surface a 422 with the original message.
    """
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise ValueError("polar must be an object")
    try:
        tws = [float(v) for v in raw["tws_kn"]]
        twa = [float(v) for v in raw["twa_deg"]]
        matrix = [[float(v) for v in row] for row in raw["boat_speed_kn"]]
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError(f"polar fields missing or non-numeric: {exc}") from exc
    if len(tws) < 2 or len(twa) < 2:
        raise ValueError("polar must have >= 2 TWS and >= 2 TWA entries")
    if any(a >= b for a, b in pairwise(tws)):
        raise ValueError("polar tws_kn must be strictly ascending")
    if any(a >= b for a, b in pairwise(twa)):
        raise ValueError("polar twa_deg must be strictly ascending")
    if twa[0] < 0 or twa[-1] > 180:
        raise ValueError("polar twa_deg must lie in [0, 180]")
    if len(matrix) != len(tws):
        raise ValueError(
            f"polar boat_speed_kn has {len(matrix)} rows, expected {len(tws)} (one per TWS)"
        )
    for i, row in enumerate(matrix):
        if len(row) != len(twa):
            raise ValueError(
                f"polar boat_speed_kn row {i} has {len(row)} cols, expected {len(twa)}"
            )
        for j, v in enumerate(row):
            if v < 0 or v > MAX_BOAT_SPEED_KN:
                raise ValueError(f"polar boat_speed_kn[{i}][{j}]={v} out of range [0, 30]")
    # Optional motor config. Both fields must be set together; either alone
    # is dropped silently so a half-filled web form never silently changes
    # the simulation (matches the frontend / backend "both or neither" rule).
    motor_threshold = parse_optional_kn(raw.get("motor_threshold_kn"), max_kn=MAX_BOAT_SPEED_KN)
    motor_speed = parse_optional_kn(raw.get("motor_speed_kn"), max_kn=MAX_BOAT_SPEED_KN)
    if motor_threshold is None or motor_speed is None:
        motor_threshold = None
        motor_speed = None
    # Min upwind angle is strict (422) where motor is tolerant: a malformed
    # value here silently reshapes every upwind ETA, so fail loudly instead.
    min_upwind: float | None = None
    raw_min_upwind = raw.get("min_upwind_twa_deg")
    if raw_min_upwind is not None:
        try:
            min_upwind = float(raw_min_upwind)
        except (TypeError, ValueError) as exc:
            raise ValueError("polar min_upwind_twa_deg must be a number in (0, 90)") from exc
        if not math.isfinite(min_upwind) or not 0 < min_upwind < 90:
            raise ValueError("polar min_upwind_twa_deg must be a number in (0, 90)")
    return BoatPolar(
        name=str(raw.get("name", "custom")),
        length_ft=int(raw.get("length_ft", 0) or 0),
        type=str(raw.get("type", "monohull")),
        category=str(raw.get("category", "custom")),
        examples=tuple(str(e) for e in raw.get("examples", ())),
        performance_class=str(raw.get("performance_class", "custom")),
        tws_kn=tuple(tws),
        twa_deg=tuple(twa),
        boat_speed_kn=tuple(tuple(row) for row in matrix),
        motor_threshold_kn=motor_threshold,
        motor_speed_kn=motor_speed,
        min_upwind_twa_deg=min_upwind,
    )


def parse_optional_kn(raw: Any, *, max_kn: float) -> float | None:
    """Coerce a numeric field to a positive bounded float, or None.

    Tolerant: any non-number, NaN, ``<= 0``, or ``> max_kn`` becomes None
    rather than raising. The motor config is opt-in UX so we'd rather drop
    a malformed value than 422 the whole passage.
    """
    if raw is None:
        return None
    try:
        v = float(raw)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(v) or v <= 0 or v > max_kn:
        return None
    return v
