# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Boat archetype registry — loads ORC-style polars from `polars/*.json`.

V1 ships 8 archetypes (5 monohull cruisers from 20 to 50 ft, 1 catamaran, 1
racer-cruiser, 1 open sail-and-oar dinghy). The LLM is expected to map a user's
commercial boat name (e.g. "Sun Odyssey 32") to the closest archetype using
`examples`, `length_ft`, `type`, and `performance_class`. No server-side
mapping table.

Polars are symmetric around the wind axis: `lookup_polar` clamps TWA to [0, 180]
and TWS to the polar's grid edges. Bilinear interpolation in (TWS, TWA) inside
the grid.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from importlib.resources import files

# Bounds of the motor knobs, the one place both shells read them from. The
# ceiling is the system-wide 30 kn boat-speed ceiling, the one the polar
# matrix, the REST polar parser and the web form (``MOTOR_MAX_KN``) already
# use: a fast catamaran or a RIB under power is a legitimate config. The
# motor speed has a floor too, 0.5 kn, the floor the engine already puts
# under a stalled sail (``MIN_BOAT_SPEED_KN``, not imported: the passage
# package imports this module): under it the arithmetic broke (0 divided a
# leg by zero, 1e-6 kn made a 41 nm passage last 31 million hours, a
# negative speed ran it backwards in time).
MOTOR_THRESHOLD_MAX_KN = 30.0
MOTOR_SPEED_MIN_KN = 0.5
MOTOR_SPEED_MAX_KN = 30.0


def validate_motor(threshold_kn: float | None, speed_kn: float | None) -> None:
    """Refuse a motor knob outside its range.

    ``motor_threshold_kn`` in ``(0, 30]`` kn, ``motor_speed_kn`` in
    ``[0.5, 30]`` kn. ``None`` is "not set" and always passes, alone or
    with the other one (either alone is ignored by the engine, see
    :class:`BoatPolar`). NaN and infinity are refused explicitly: a plain
    range comparison lets NaN through.

    Raises:
        ValueError: naming the parameter, its range and the value received.
    """
    if threshold_kn is not None and (
        not math.isfinite(threshold_kn) or not 0.0 < threshold_kn <= MOTOR_THRESHOLD_MAX_KN
    ):
        raise ValueError(
            f"motor_threshold_kn must be in (0, {MOTOR_THRESHOLD_MAX_KN:g}] kn, got {threshold_kn}"
        )
    if speed_kn is not None and (
        not math.isfinite(speed_kn) or not MOTOR_SPEED_MIN_KN <= speed_kn <= MOTOR_SPEED_MAX_KN
    ):
        raise ValueError(
            f"motor_speed_kn must be in [{MOTOR_SPEED_MIN_KN:g}, {MOTOR_SPEED_MAX_KN:g}] kn, "
            f"got {speed_kn}"
        )


@dataclass(frozen=True, slots=True)
class BoatPolar:
    name: str
    length_ft: int
    type: str  # "monohull" | "catamaran"
    category: str  # "cruising" | "racer-cruiser"
    examples: tuple[str, ...]
    performance_class: str
    tws_kn: tuple[float, ...]  # ascending
    twa_deg: tuple[float, ...]  # ascending, in [0, 180]
    boat_speed_kn: tuple[tuple[float, ...], ...]  # [tws_idx][twa_idx]
    # Optional motor configuration. When ``motor_threshold_kn`` is set AND
    # ``motor_speed_kn`` is set, segments where the polar speed falls under
    # the threshold are computed at ``motor_speed_kn`` instead. Both ``None``
    # by default = no motor, pure-sail behaviour. Either alone is ignored
    # (frontend validation enforces "both or neither"; backend stays
    # tolerant). Motivated by user feedback: in the Mediterranean, when the
    # polar produces 1.5 kn in light wind / wrong chop, real sailors fire
    # up the engine rather than wait hours for the mistral.
    motor_threshold_kn: float | None = None
    motor_speed_kn: float | None = None
    # Minimum sailable TWA (deg). Below this angle the boat is in the no-go
    # zone; the VMG sweep never searches under it. ``None`` = derive from the
    # grid (first TWA column with real speeds, see effective_min_upwind_twa).
    min_upwind_twa_deg: float | None = None

    def __post_init__(self) -> None:
        # Here rather than only at the boundary: ``dataclasses.replace`` is
        # how both shells put the caller's motor on an archetype, and it goes
        # through ``__init__``, so no engine run can see a motor out of range.
        validate_motor(self.motor_threshold_kn, self.motor_speed_kn)


def _load_one(name: str) -> BoatPolar:
    raw = files("openwind_data.routing.polars").joinpath(f"{name}.json").read_text()
    data = json.loads(raw)
    return BoatPolar(
        name=data["name"],
        length_ft=int(data["length_ft"]),
        type=data["type"],
        category=data["category"],
        examples=tuple(data["examples"]),
        performance_class=data["performance_class"],
        tws_kn=tuple(float(v) for v in data["tws_kn"]),
        twa_deg=tuple(float(v) for v in data["twa_deg"]),
        boat_speed_kn=tuple(tuple(float(v) for v in row) for row in data["boat_speed_kn"]),
        min_upwind_twa_deg=(
            float(data["min_upwind_twa_deg"])
            if data.get("min_upwind_twa_deg") is not None
            else None
        ),
    )


_ARCHETYPE_NAMES = (
    "cruiser_20ft",
    "cruiser_25ft",
    "cruiser_30ft",
    "cruiser_40ft",
    "cruiser_50ft",
    "catamaran_40ft",
    "racer_cruiser",
    "voile_aviron_16ft",
)


_REGISTRY: dict[str, BoatPolar] | None = None


def _registry() -> dict[str, BoatPolar]:
    global _REGISTRY
    if _REGISTRY is None:
        _REGISTRY = {n: _load_one(n) for n in _ARCHETYPE_NAMES}
    return _REGISTRY


def list_archetypes() -> list[BoatPolar]:
    """Return all archetypes in a deterministic order."""
    reg = _registry()
    return [reg[n] for n in _ARCHETYPE_NAMES]


def list_archetypes_metadata() -> list[dict]:
    """Return archetype metadata (no polars) suitable for REST API responses."""
    reg = _registry()
    return [
        {
            "slug": n,
            "name": reg[n].name,
            "length_ft": reg[n].length_ft,
            "type": reg[n].type,
            "category": reg[n].category,
            "examples": list(reg[n].examples),
            "performance_class": reg[n].performance_class,
        }
        for n in _ARCHETYPE_NAMES
    ]


def get_polar(name: str) -> BoatPolar:
    """Fetch one archetype by name. Raises KeyError if unknown."""
    reg = _registry()
    if name not in reg:
        raise KeyError(f"unknown boat archetype {name!r}; available: {sorted(reg)}")
    return reg[name]


def grid_min_sailable_twa(polar: BoatPolar) -> float:
    """First grid TWA whose column carries real speed.

    Skips leading all-zero columns (imported files often carry a 0-deg row of
    zeros) so the derived floor lands on the first sailable angle.
    """
    for j, twa in enumerate(polar.twa_deg):
        if any(row[j] > 0.1 for row in polar.boat_speed_kn):
            return twa
    return polar.twa_deg[0]


def effective_min_upwind_twa(polar: BoatPolar) -> float:
    """Explicit min upwind angle, else the grid-derived sailable floor."""
    if polar.min_upwind_twa_deg is not None:
        return polar.min_upwind_twa_deg
    return grid_min_sailable_twa(polar)


def _bracket(values: tuple[float, ...], v: float) -> tuple[int, int, float]:
    """Return (lo, hi, frac) such that values[lo] <= v <= values[hi] and
    v == (1-frac)*values[lo] + frac*values[hi]. Clamps to edges (frac=0).
    Assumes `values` is sorted ascending and non-empty.
    """
    if v <= values[0]:
        return 0, 0, 0.0
    if v >= values[-1]:
        last = len(values) - 1
        return last, last, 0.0
    for i in range(1, len(values)):
        if values[i] >= v:
            lo, hi = i - 1, i
            f = (v - values[lo]) / (values[hi] - values[lo])
            return lo, hi, f
    last = len(values) - 1
    return last, last, 0.0


def lookup_polar(polar: BoatPolar, tws_kn: float, twa_deg: float) -> float:
    """Bilinearly interpolate boat speed (kn) at (TWS, TWA), clamped at grid edges.

    TWA is symmetric: the caller is expected to pass it in [0, 180].
    """
    twa = max(0.0, min(180.0, twa_deg))
    i_lo, i_hi, fi = _bracket(polar.tws_kn, tws_kn)
    j_lo, j_hi, fj = _bracket(polar.twa_deg, twa)
    v00 = polar.boat_speed_kn[i_lo][j_lo]
    v01 = polar.boat_speed_kn[i_lo][j_hi]
    v10 = polar.boat_speed_kn[i_hi][j_lo]
    v11 = polar.boat_speed_kn[i_hi][j_hi]
    v_lo = (1.0 - fj) * v00 + fj * v01
    v_hi = (1.0 - fj) * v10 + fj * v11
    return (1.0 - fi) * v_lo + fi * v_hi
