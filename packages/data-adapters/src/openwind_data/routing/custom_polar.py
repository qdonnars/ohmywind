# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""A caller's own polar, read from an untrusted payload.

The web app posts one to the REST API when the user imported the polar of
their boat; an MCP client can pass the same object to ``plan_passage``. One
reader for both shells, here in the domain, so the two refuse the same grid
with the same words (issue #514).

The payload::

    {
        "tws_kn": [6, 10, 16],          # strictly ascending, knots
        "twa_deg": [40, 60, 90, 120],   # strictly ascending, in [0, 180]
        "boat_speed_kn": [[...], ...],  # one row per TWS, one column per TWA
        "min_upwind_twa_deg": 42,       # optional, in (0, 90)
        "motor_threshold_kn": 2,        # optional, with motor_speed_kn
        "motor_speed_kn": 5.5,
    }
"""

from __future__ import annotations

import math
from itertools import pairwise
from typing import Any

from openwind_data.routing.archetypes import BoatPolar, validate_motor

# The polar matrix ceiling, the same value as the web's MOTOR_MAX_KN and as
# the domain's motor bounds (``MOTOR_THRESHOLD_MAX_KN``, ``MOTOR_SPEED_MAX_KN``).
# Keep them aligned or the web will show a motor the simulation silently
# ignores.
MAX_BOAT_SPEED_KN = 30.0


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
    # The rule is the domain's (``validate_motor``), the tolerance is this
    # reader's: out of range is dropped here, refused by the MCP tool.
    motor_threshold = optional_float(raw.get("motor_threshold_kn"))
    motor_speed = optional_float(raw.get("motor_speed_kn"))
    try:
        validate_motor(motor_threshold, motor_speed)
    except ValueError:
        motor_threshold = None
        motor_speed = None
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


def optional_float(raw: Any) -> float | None:
    """Coerce an optional numeric field to a float, or None.

    Tolerant: any non-number becomes None rather than raising. The motor
    config is opt-in UX so we'd rather drop a malformed value than 422 the
    whole passage; its range is checked by the domain (``validate_motor``).
    """
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None
