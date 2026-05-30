"""Boat archetype registry — loads ORC-style polars from `polars/*.json`.

V1 ships 7 archetypes (5 monohull cruisers from 20 to 50 ft, 1 catamaran, 1
racer-cruiser). The LLM is expected to map a user's commercial boat name
(e.g. "Sun Odyssey 32") to the closest archetype using `examples`, `length_ft`,
`type`, and `performance_class`. No server-side mapping table.

Polars are symmetric around the wind axis: `lookup_polar` clamps TWA to [0, 180]
and TWS to the polar's grid edges. Bilinear interpolation in (TWS, TWA) inside
the grid.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from importlib.resources import files


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
    )


_ARCHETYPE_NAMES = (
    "cruiser_20ft",
    "cruiser_25ft",
    "cruiser_30ft",
    "cruiser_40ft",
    "cruiser_50ft",
    "catamaran_40ft",
    "racer_cruiser",
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
