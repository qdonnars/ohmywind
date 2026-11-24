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

# Grid ceilings for a strict read (the MCP tool): one TWS entry per knot up to
# 60 kn, one TWA entry per degree. The finest polar files in use (qtVlm, 1 deg
# by 1 kn) fit; 60 x 181 speeds is about 65 KB of JSON, well under the 256 KiB
# body cap of ``/mcp``, so a call never fails on the transport instead of here.
POLAR_MAX_TWS_ENTRIES = 60
POLAR_MAX_TWA_ENTRIES = 181


def parse_polar(raw: Any, *, strict: bool = False) -> BoatPolar | None:
    """Build a BoatPolar from the web client's `polar` payload. Returns None
    when no payload is provided. Raises ValueError on shape mismatch / invalid
    values so the caller can surface a 422 with the original message.

    ``strict`` is the MCP tool's reading, which refuses where REST tolerates:
    a grid over ``POLAR_MAX_TWS_ENTRIES`` x ``POLAR_MAX_TWA_ENTRIES``, a value
    that is not a finite number (``"nan"`` passes every range comparison), and
    a motor pair out of range (REST drops it silently). The REST shell keeps
    the lenient default, unchanged since the web app first posted polars.
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
    if strict:
        _check_strict(tws, twa, matrix)
    if len(tws) < 2 or len(twa) < 2:
        raise ValueError("polar must have >= 2 TWS and >= 2 TWA entries")
    if any(a >= b for a, b in pairwise(tws)):
        raise ValueError("polar tws_kn must be strictly ascending")
    if any(a >= b for a, b in pairwise(twa)):
        raise ValueError("polar twa_deg must be strictly ascending")
    if twa[0] < 0 or twa[-1] > 180:
        raise ValueError("polar twa_deg must lie in [0, 180]")
    if len(matrix) != len(tws):
        # The usual mistake, and a silent one on a square grid: polar tables
        # are written with one line per TWA, the payload wants one per TWS.
        transposed = len(matrix) == len(twa) and all(len(row) == len(tws) for row in matrix)
        hint = (
            "; it looks transposed (one row per TWA): swap rows and columns" if transposed else ""
        )
        raise ValueError(
            f"polar boat_speed_kn has {len(matrix)} rows, expected {len(tws)} (one per TWS){hint}"
        )
    for i, row in enumerate(matrix):
        if len(row) != len(twa):
            raise ValueError(
                f"polar boat_speed_kn row {i} has {len(row)} cols, expected {len(twa)}"
            )
        for j, v in enumerate(row):
            if v < 0 or v > MAX_BOAT_SPEED_KN:
                raise ValueError(f"polar boat_speed_kn[{i}][{j}]={v} out of range [0, 30]")
    if strict and len(tws) == len(twa):
        _check_not_transposed(tws, twa, matrix)
    # Optional motor config. Both fields must be set together; either alone
    # is dropped silently so a half-filled web form never silently changes
    # the simulation (matches the frontend / backend "both or neither" rule).
    # The rule is the domain's (``validate_motor``), the tolerance is this
    # reader's: out of range is dropped here, refused by the MCP tool.
    motor_threshold = optional_float(raw.get("motor_threshold_kn"))
    motor_speed = optional_float(raw.get("motor_speed_kn"))
    try:
        validate_motor(motor_threshold, motor_speed)
    except ValueError as exc:
        if strict:
            raise ValueError(f"polar {exc}") from exc
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


def _check_strict(tws: list[float], twa: list[float], matrix: list[list[float]]) -> None:
    """The strict reader's extra refusals, before any shape check."""
    if len(tws) > POLAR_MAX_TWS_ENTRIES or len(twa) > POLAR_MAX_TWA_ENTRIES:
        raise ValueError(
            f"polar grid too large: {len(tws)} TWS x {len(twa)} TWA entries, at most "
            f"{POLAR_MAX_TWS_ENTRIES} x {POLAR_MAX_TWA_ENTRIES}"
        )
    for name, values in (("tws_kn", tws), ("twa_deg", twa)):
        if not all(math.isfinite(v) for v in values):
            raise ValueError(f"polar {name} must hold finite numbers")
    for i, row in enumerate(matrix):
        for j, v in enumerate(row):
            if not math.isfinite(v):
                raise ValueError(f"polar boat_speed_kn[{i}][{j}]={v} is not a finite number")


# Below this, two neighbouring speeds count as equal (kn): polar files are
# rounded to 0.1 kn, and a flat spot is not a fall.
_FALL_TOLERANCE_KN = 0.05


def _check_not_transposed(tws: list[float], twa: list[float], matrix: list[list[float]]) -> None:
    """Refuse a square grid that reads like one row per TWA.

    Polar tables are written with one line per TWA; the payload wants one row
    per TWS. Off a square grid the row count gives the mistake away. On a
    square one nothing does, and the passage is timed with speeds read at the
    wrong wind: Haiku 4.5 sent a 5 x 5 table the wrong way round twice in six
    runs (bench of 2026-11-20).

    The tell: a boat seldom slows down as the wind rises, and it does slow
    down past a reach, at every wind. So a grid whose speeds fall more often
    along the TWS axis than along the TWA axis is the other way round. Cut
    square, the nine bundled polars count 0 to 6 falls with the wind against
    20 to 26 towards the run: all pass, and turned over all are caught. A
    real grid can trip this only if it loses speed in more wind more often
    than it does off the wind, an upwind-only table with heavy-weather rows.
    """

    def falls(rows: list[list[float]]) -> int:
        return sum(1 for row in rows for a, b in pairwise(row) if b < a - _FALL_TOLERANCE_KN)

    by_twa = [list(col) for col in zip(*matrix, strict=True)]
    # ``by_twa`` rows run along the TWS axis, ``matrix`` rows along the TWA one.
    if falls(by_twa) <= falls(matrix):
        return
    j, i = next(
        (j, i)
        for j, col in enumerate(by_twa)
        for i, (a, b) in enumerate(pairwise(col))
        if b < a - _FALL_TOLERANCE_KN
    )
    raise ValueError(
        f"polar boat_speed_kn looks transposed: read as sent, at TWA {twa[j]:g} deg the boat "
        f"slows from {matrix[i][j]:g} to {matrix[i + 1][j]:g} kn when the wind rises from "
        f"{tws[i]:g} to {tws[i + 1]:g} kn, more often than it slows towards the run. "
        "Send one row per tws_kn entry (swap rows and columns)"
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
