# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The sailing itself: polar geometry, waves, engine, current.

Every function here is pure and takes plain numbers or a ``BoatPolar``. None
of them knows about routes, forecasts or time, which is what makes them the
part of the engine that can be checked against a table by hand.
"""

from __future__ import annotations

import math

from openwind_data.routing.archetypes import (
    BoatPolar,
    effective_min_upwind_twa,
    grid_min_sailable_twa,
    lookup_polar,
)
from openwind_data.routing.passage.constants import (
    LAYOUT_REF_TWA_DEG,
    LAYOUT_REF_TWS_KN,
    MIN_BOAT_SPEED_KN,
    WAVE_DERATE_FLOOR,
    WAVE_DERATE_K,
    WAVE_DERATE_P,
)
from openwind_data.routing.passage.models import PassageReport


def wave_derate(hs_m: float, twa_deg: float) -> float:
    """Multiplicative speed factor in waves; returns 1.0 in flat water.

    Form: ``max(floor, 1 - k * Hs^p * f(TWA))`` with ``f(TWA) = cos²(TWA/2)``
    peaking head-seas (TWA=0) and zero down-seas (TWA=180). Defaults
    ``k=0.05``, ``p=1.75``, ``floor=0.5`` see README for sourcing.
    """
    if hs_m < 0:
        raise ValueError("hs_m must be >= 0")
    angular_factor = math.cos(math.radians(twa_deg / 2)) ** 2
    return max(WAVE_DERATE_FLOOR, 1.0 - WAVE_DERATE_K * hs_m**WAVE_DERATE_P * angular_factor)


def best_vmg_upwind(polar: BoatPolar, tws_kn: float) -> tuple[float, float]:
    """Return (optimal_twa_deg, polar_speed_kn) that maximises VMG upwind.

    Sweeps TWA from the boat's minimum upwind angle to 90 deg to find the angle
    maximising polar(twa) * cos(twa). Sweeping below that floor is wrong twice
    over: `lookup_polar` clamps flat under the first grid angle while cos(twa)
    keeps rising (which used to pin the optimum at the old 30-deg sweep floor
    for every archetype), and grids carrying a 0-deg row of zeros would let
    interpolated half-zero speeds win on geometry alone.
    Returns the optimal TWA and the polar speed at that angle (not the VMG value
    itself), so the caller can compute the tacking-geometry correction:
      effective_speed = polar_speed * cos(optimal_twa - segment_twa)
    """
    # The sweep floor is the boat's min upwind angle, but never below the
    # grid's real data: a user pinning tighter than the polar's first angle
    # would put the sweep back on clamp-flat speeds where cos alone decides
    # (the historical 30-deg bug). Pinching below the data cannot beat the
    # polar's VMG, so the extension is display-only on the client side.
    floor_deg = max(effective_min_upwind_twa(polar), grid_min_sailable_twa(polar))
    floor = min(90, max(0, math.ceil(floor_deg)))
    best_twa, best_speed, best_vmg = float(floor), 0.0, 0.0
    for twa_int in range(floor, 91):
        twa = float(twa_int)
        sp = lookup_polar(polar, tws_kn, twa)
        vmg = sp * math.cos(math.radians(twa))
        if vmg > best_vmg:
            best_vmg = vmg
            best_twa = twa
            best_speed = sp
    return best_twa, best_speed


def _apply_motor(polar: BoatPolar, sail_speed_kn: float) -> tuple[float, bool]:
    """Return (effective_speed_kn, motor_used) given the polar's motor config.

    Switches to ``polar.motor_speed_kn`` whenever the pure-sail estimate
    falls under ``polar.motor_threshold_kn`` AND both motor knobs are set.
    Either knob alone (e.g. user typed only the threshold) is ignored so the
    behaviour stays predictable. The motor speed bypasses ``efficiency`` and
    wave derate: under power those don't apply (efficiency is a sail-trim
    proxy, wave derate is a heeling/slamming proxy — engine just chugs along).
    """
    threshold = polar.motor_threshold_kn
    motor_kn = polar.motor_speed_kn
    if threshold is None or motor_kn is None:
        return sail_speed_kn, False
    if sail_speed_kn >= threshold:
        return sail_speed_kn, False
    return motor_kn, True


def _layout_speed_kn(polar: BoatPolar, efficiency: float) -> float:
    """Boat-aware cruising estimate used to lay out weather-sampling mid-times.

    Polar speed at the reference point (LAYOUT_REF_TWS_KN / LAYOUT_REF_TWA_DEG)
    scaled by ``efficiency`` — the motor threshold compares post-efficiency
    sail speeds — then run through the motor rule. A motor-dominant config
    (threshold above its sailing speeds) lays out at motor speed, which makes
    its mid-times near-exact: under power the actual speed does not depend on
    the wind we haven't fetched yet.
    """
    sail = lookup_polar(polar, LAYOUT_REF_TWS_KN, LAYOUT_REF_TWA_DEG) * efficiency
    speed, _ = _apply_motor(polar, sail)
    return max(speed, MIN_BOAT_SPEED_KN)


def _apply_current(
    boat_speed_kn: float,
    bearing_deg: float,
    current_speed_kn: float | None,
    current_direction_to_deg: float | None,
) -> float | None:
    """SOG = STW + (current projected on bearing). Returns None when current
    data is absent so callers can preserve no-current semantics.

    Convention: ``current_direction_to_deg`` is "going to" (oceanographic), so a
    current setting along the bearing adds to STW. Floored at MIN_BOAT_SPEED_KN
    to keep duration finite when a strong opposing current would otherwise
    reverse SOG — the wind-against-current warning surfaces the qualitative
    issue.
    """
    if current_speed_kn is None or current_direction_to_deg is None:
        return None
    along = current_speed_kn * math.cos(math.radians(bearing_deg - current_direction_to_deg))
    return max(boat_speed_kn + along, MIN_BOAT_SPEED_KN)


def _categorize_twa(twa_deg: float) -> str:
    if twa_deg < 45.0:
        return "pres"
    elif twa_deg < 90.0:
        return "travers"
    elif twa_deg < 135.0:
        return "largue"
    else:
        return "portant"


def build_conditions_summary(report: PassageReport) -> dict:
    tws = [s.tws_kn for s in report.segments]
    counts: dict[str, int] = {}
    for s in report.segments:
        cat = _categorize_twa(s.twa_deg)
        counts[cat] = counts.get(cat, 0) + 1
    predominant = max(counts, key=lambda k: counts[k])
    hs = [s.hs_m for s in report.segments if s.hs_m is not None]
    return {
        "tws_min_kn": round(min(tws), 1),
        "tws_max_kn": round(max(tws), 1),
        "predominant_sail_angle": predominant,
        # Both bounds so consumers (web table, MCP App widget) can render a
        # range like "0.3-0.6m" instead of a single max value. PR #69 added
        # hs_min_m but it was dropped by the squash-merge — restored here.
        "hs_min_m": round(min(hs), 2) if hs else None,
        "hs_max_m": round(max(hs), 2) if hs else None,
    }
