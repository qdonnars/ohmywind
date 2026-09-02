# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Complexity scoring for a passage.

V1 design choices:

- **Two axes**: wind (TWS max over segments) and sea (Hs max). Each is binned
  into a 1-5 level. The passage level is `max(wind_level, sea_level)` — the worst
  axis dictates difficulty. No magic averaging.
- **Sea axis**: derived from per-segment Hs when present on the passage. Callers
  may pass `max_hs_m` explicitly to override (e.g., for tests that build minimal
  passages or to inject a forecast bulletin's worst case).
- **Rationale string**: human-readable f-string for the LLM/UI to surface.
- **Thresholds**: cruising-oriented bands. Documented in `docs/complexity.md`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from openwind_data.adapters.base import (
    CHOP_FOLLOWING_TWA_DEG,
    CHOP_HS_FLOOR_M,
    CHOP_INDEX_THRESHOLD,
    WIND_AGAINST_CURRENT_OPPOSITION_DEG,
    WIND_AGAINST_CURRENT_WARNING_THRESHOLD_KN,
)
from openwind_data.routing.passage import PassageReport

# (upper_bound_exclusive, level, label). Last bucket has math.inf.
_WIND_BANDS: tuple[tuple[float, int, str], ...] = (
    (10.0, 1, "calme"),
    (15.0, 2, "modéré"),
    (20.0, 3, "soutenu"),
    (25.0, 4, "fort"),
    (float("inf"), 5, "très fort"),
)

_SEA_BANDS: tuple[tuple[float, int, str], ...] = (
    (0.5, 1, "plate"),
    (1.0, 2, "belle"),
    (2.0, 3, "agitée"),
    (3.0, 4, "forte"),
    (float("inf"), 5, "très forte"),
)

_LEVEL_LABELS: dict[int, str] = {
    1: "facile",
    2: "modéré",
    3: "soutenu",
    4: "exigeant",
    5: "dangereux",
}


def _classify(value: float, bands: tuple[tuple[float, int, str], ...]) -> tuple[int, str]:
    for upper, level, label in bands:
        if value < upper:
            return level, label
    raise AssertionError("bands must end with +inf")  # pragma: no cover


def _lower_bound(level: int, bands: tuple[tuple[float, int, str], ...]) -> float:
    """Return the inclusive lower bound of value that maps to `level`."""
    prev: float = 0.0
    for upper, lv, _ in bands:
        if lv == level:
            return prev
        prev = upper
    return 0.0  # pragma: no cover


def _compact_range(values: list[float], decimals: int) -> str:
    """`"30"` for {30}, `"25-30"` for the spread, rounded to `decimals` digits.

    Reporting a single max obscured how the conditions actually played out:
    "TWS max 30 kn" reads like one moment of stress, when the affected stretch
    might have been steady at 25-30 kn. The range is more informative for both
    the LLM (decision-making) and the human reader.
    """
    rounded = sorted({round(v, decimals) for v in values})
    if len(rounded) == 1:
        return f"{rounded[0]:.{decimals}f}"
    return f"{rounded[0]:.{decimals}f}-{rounded[-1]:.{decimals}f}"


@dataclass(frozen=True, slots=True)
class ComplexityWarning:
    kind: Literal["wind", "sea", "current", "chop"]
    level: int  # 1..5 — same scale as the axis that triggered it
    message: str
    affected_segments: tuple[int, ...]  # indices into PassageReport.segments


@dataclass(frozen=True, slots=True)
class ComplexityScore:
    level: int  # 1..5
    label: str  # facile / modéré / soutenu / exigeant / dangereux
    wind_level: int
    wind_label: str
    sea_level: int | None
    sea_label: str | None
    tws_max_kn: float
    hs_max_m: float | None
    rationale: str
    warnings: tuple[ComplexityWarning, ...] = ()
    wind_against_current: bool = False  # True when at least one segment triggered the bump
    chop_present: bool = False  # True when short-period steep wind sea is flagged


def score_complexity(
    passage: PassageReport,
    *,
    max_hs_m: float | None = None,
) -> ComplexityScore:
    """Score a passage on a 1-5 scale from wind (and optionally sea).

    Args:
        passage: a `PassageReport` with at least one segment.
        max_hs_m: optional max significant wave height over the route, in meters.
            When `None`, derived from segment Hs values on the passage; falls
            back to the wind-only score if no segment carries Hs.
    """
    if not passage.segments:
        raise ValueError("passage has no segments")

    tws_max = max(s.tws_kn for s in passage.segments)
    wind_level, wind_label = _classify(tws_max, _WIND_BANDS)

    if max_hs_m is None:
        seg_hs = [s.hs_m for s in passage.segments if s.hs_m is not None]
        max_hs_m = max(seg_hs) if seg_hs else None
    elif max_hs_m < 0:
        raise ValueError("max_hs_m must be >= 0")

    if max_hs_m is None:
        sea_level: int | None = None
        sea_label: str | None = None
        level = wind_level
        rationale = f"vent max {tws_max:.0f} kn ({wind_label})"
    else:
        sea_level, sea_label = _classify(max_hs_m, _SEA_BANDS)
        level = max(wind_level, sea_level)
        rationale = (
            f"vent max {tws_max:.0f} kn ({wind_label}), mer max Hs={max_hs_m:.1f} m ({sea_label})"
        )

    warnings: list[ComplexityWarning] = []
    if wind_level >= 3:
        threshold = _lower_bound(wind_level, _WIND_BANDS)
        affected = tuple(i for i, s in enumerate(passage.segments) if s.tws_kn >= threshold)
        affected_nm = sum(passage.segments[i].distance_nm for i in affected)
        tws_range = _compact_range([passage.segments[i].tws_kn for i in affected], 0)
        warnings.append(
            ComplexityWarning(
                kind="wind",
                level=wind_level,
                message=f"Vent {wind_label} : TWS {tws_range} kn sur {affected_nm:.0f} nm",
                affected_segments=affected,
            )
        )
    if sea_level is not None and sea_level >= 3 and max_hs_m is not None:
        threshold = _lower_bound(sea_level, _SEA_BANDS)
        affected_sea = tuple(
            i for i, s in enumerate(passage.segments) if s.hs_m is not None and s.hs_m >= threshold
        )
        # If max_hs_m came from a route-level override (no per-segment Hs on the
        # passage), default the affected span to the whole route so the warning
        # still reports a meaningful distance instead of "0 nm".
        if not affected_sea:
            affected_sea = tuple(range(len(passage.segments)))
        affected_sea_nm = sum(passage.segments[i].distance_nm for i in affected_sea)
        # Bound to a name in the guard: reading ``passage.segments[i].hs_m``
        # twice is two subscripts, and nothing tells a reader (or a type
        # checker) that the second one still holds the value the first one
        # tested. The walrus makes the filtered list actually ``list[float]``.
        affected_hs = [hs for i in affected_sea if (hs := passage.segments[i].hs_m) is not None]
        hs_range = _compact_range(affected_hs, 1) if affected_hs else f"{max_hs_m:.1f}"
        warnings.append(
            ComplexityWarning(
                kind="sea",
                level=sea_level,
                message=f"Mer {sea_label} : Hs {hs_range} m sur {affected_sea_nm:.0f} nm",
                affected_segments=affected_sea,
            )
        )

    # Wind-against-current detection: a segment triggers when current ≥ 1.5 kt
    # AND wind_to (twd + 180) is opposed to current_to by ≥ 120°. Mediterranean
    # legs almost never qualify; Atlantic tidal passes (Goulet de Brest, Raz de
    # Sein) routinely do. Triggers a +1 bump on the overall level (cap 5) plus
    # an explicit warning so the LLM/UI can flag the chop, mirroring nautical
    # practice. The bump is shared with the chop detector below — both flag
    # broken/uncomfortable sea and only contribute +1 in total.
    wac_indices: list[int] = []
    wac_currents: list[float] = []
    for i, s in enumerate(passage.segments):
        if s.current_speed_kn is None or s.current_direction_to_deg is None:
            continue
        if s.current_speed_kn < WIND_AGAINST_CURRENT_WARNING_THRESHOLD_KN:
            continue
        wind_to = (s.twd_deg + 180.0) % 360.0
        delta = abs(((wind_to - s.current_direction_to_deg + 540.0) % 360.0) - 180.0)
        if delta >= WIND_AGAINST_CURRENT_OPPOSITION_DEG:
            wac_indices.append(i)
            wac_currents.append(s.current_speed_kn)

    wind_against_current = bool(wac_indices)

    # Chop detection: short-period steep wind sea ("clapot"). Index = Hs/Tp²
    # is a steepness proxy. We exclude segments already flagged by WAC since
    # the WAC warning ("mer hachée probable") already covers chop on those
    # legs — no need to fire two warnings for the same phenomenon.
    chop_indices: list[int] = []
    chop_hs: list[float] = []
    chop_tp: list[float] = []
    wac_index_set = set(wac_indices)
    for i, s in enumerate(passage.segments):
        if i in wac_index_set:
            continue
        if s.hs_m is None or s.wave_period_s is None:
            continue
        if s.hs_m < CHOP_HS_FLOOR_M or s.wave_period_s <= 0:
            continue
        if s.hs_m / (s.wave_period_s**2) > CHOP_INDEX_THRESHOLD:
            chop_indices.append(i)
            chop_hs.append(s.hs_m)
            chop_tp.append(s.wave_period_s)

    chop_present = bool(chop_indices)
    # Following chop (sea from behind) is much less penalising — emit the
    # warning so the sailor sees it but skip the bump when *every* chop
    # segment is on a running angle. A single bow-on or beam segment in the
    # set still bumps, because that's where slamming happens.
    chop_following_only = chop_present and all(
        abs(passage.segments[i].twa_deg) >= CHOP_FOLLOWING_TWA_DEG for i in chop_indices
    )
    chop_contributes_bump = chop_present and not chop_following_only

    # Single +1 bump shared by WAC and chop — both describe broken/uncomfortable
    # sea and don't compound. Without this, a passage with WAC on the first half
    # and chop on the second half would jump +2 levels for what is essentially
    # the same physical signal restated.
    bumped_level = min(5, level + 1) if (wind_against_current or chop_contributes_bump) else level

    if wind_against_current:
        affected_wac = tuple(wac_indices)
        affected_wac_nm = sum(passage.segments[i].distance_nm for i in affected_wac)
        cur_range = _compact_range(wac_currents, 1)
        warnings.append(
            ComplexityWarning(
                kind="current",
                level=bumped_level,
                message=(
                    f"Vent contre courant : courant {cur_range} kt opposé sur "
                    f"{affected_wac_nm:.0f} nm, mer hachée probable"
                ),
                affected_segments=affected_wac,
            )
        )
        rationale = f"{rationale}, vent contre courant"

    if chop_present:
        affected_chop = tuple(chop_indices)
        affected_chop_nm = sum(passage.segments[i].distance_nm for i in affected_chop)
        hs_range = _compact_range(chop_hs, 1)
        tp_range = _compact_range(chop_tp, 0)
        if chop_following_only:
            chop_label = "Clapot suiveur"
            chop_suffix: str | None = None
            chop_warning_level = level  # no bump credited to this warning
        else:
            chop_label = "Clapot court"
            chop_suffix = "mer désagréable"
            chop_warning_level = bumped_level
        suffix_part = f", {chop_suffix}" if chop_suffix else ""
        warnings.append(
            ComplexityWarning(
                kind="chop",
                level=chop_warning_level,
                message=(
                    f"{chop_label} : Hs {hs_range} m à Tp {tp_range} s sur "
                    f"{affected_chop_nm:.0f} nm{suffix_part}"
                ),
                affected_segments=affected_chop,
            )
        )
        rationale = f"{rationale}, {chop_label.lower()}"

    level = bumped_level

    return ComplexityScore(
        level=level,
        label=_LEVEL_LABELS[level],
        wind_level=wind_level,
        wind_label=wind_label,
        sea_level=sea_level,
        sea_label=sea_label,
        tws_max_kn=tws_max,
        hs_max_m=max_hs_m,
        rationale=rationale,
        warnings=tuple(warnings),
        wind_against_current=wind_against_current,
        chop_present=chop_present,
    )
