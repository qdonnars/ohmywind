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

import math
from dataclasses import dataclass, field
from typing import Any, Literal

from openwind_data.routing.notices import notice
from openwind_data.routing.passage import PassageReport, SegmentReport
from openwind_data.routing.sea_state import SEA_BANDS, SEA_WARNING_LEVEL, SeaFlag, sea_flag

# (upper_bound_exclusive, level, label). Last bucket has math.inf.
_WIND_BANDS: tuple[tuple[float, int, str], ...] = (
    (10.0, 1, "calme"),
    (15.0, 2, "modéré"),
    (20.0, 3, "soutenu"),
    (25.0, 4, "fort"),
    (float("inf"), 5, "très fort"),
)

# The sea's bands, words and flags live in ``routing.sea_state``, which the
# passage engine reads too: a segment and the passage's score cannot disagree.

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


def _segment_sea_flag(s: SegmentReport) -> SeaFlag | None:
    """The sea flag of a segment, from its raw values.

    Recomputed rather than read from ``s.sea_flag``: a report built by hand
    (a test, a caller of this module alone) carries the values but not the
    engine's stamp, and the two come from the same function anyway.
    """
    return sea_flag(
        twd_deg=s.twd_deg,
        twa_deg=s.twa_deg,
        hs_m=s.hs_m,
        wave_period_s=s.wave_period_s,
        current_speed_kn=s.current_speed_kn,
        current_direction_to_deg=s.current_direction_to_deg,
    )


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
    # ``message`` as a code and the values that filled it, for a client that
    # says it in another language (see ``routing.notices``). Defaults keep
    # the positional constructors of the tests working.
    code: str = ""
    params: dict[str, Any] = field(default_factory=dict)


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
    elif not math.isfinite(max_hs_m) or max_hs_m < 0:
        # NaN used to pass the comparison and fail deep in the banding with
        # "bands must end with +inf", a sentence about our tables.
        raise ValueError(f"max_hs_m must be >= 0 and finite, got {max_hs_m}")

    if max_hs_m is None:
        sea_level: int | None = None
        sea_label: str | None = None
        level = wind_level
        rationale = f"vent max {tws_max:.0f} kn ({wind_label})"
    else:
        sea_level, sea_label = _classify(max_hs_m, SEA_BANDS)
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
        n = notice(f"complexity.wind.{wind_level}", tws_range=tws_range, nm=f"{affected_nm:.0f}")
        warnings.append(
            ComplexityWarning(
                kind="wind",
                level=wind_level,
                message=n.message,
                affected_segments=affected,
                code=n.code,
                params=n.params,
            )
        )
    if sea_level is not None and sea_level >= SEA_WARNING_LEVEL and max_hs_m is not None:
        threshold = _lower_bound(sea_level, SEA_BANDS)
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
        n = notice(f"complexity.sea.{sea_level}", hs_range=hs_range, nm=f"{affected_sea_nm:.0f}")
        warnings.append(
            ComplexityWarning(
                kind="sea",
                level=sea_level,
                message=n.message,
                affected_segments=affected_sea,
                code=n.code,
                params=n.params,
            )
        )

    # Wind against current and chop, segment by segment, from the one
    # function the engine stamps each segment with (``sea_state.sea_flag``).
    # Wind against current: a current of 1.5 kt or more opposed to the wind.
    # Mediterranean legs almost never qualify; Atlantic tidal passes (Goulet
    # de Brest, Raz de Sein) routinely do. Chop: a short, steep wind sea. A
    # segment already flagged for wind against current is not flagged for
    # chop as well: both say "broken sea", one warning is enough. Either
    # bumps the overall level by one (cap 5), once in total.
    flags = [_segment_sea_flag(s) for s in passage.segments]
    wac_indices = [i for i, f in enumerate(flags) if f == "wind_against_current"]
    # A flagged segment has a current, a height and a period: the filters
    # only tell the type checker so.
    wac_currents = [
        cur for i in wac_indices if (cur := passage.segments[i].current_speed_kn) is not None
    ]
    wind_against_current = bool(wac_indices)

    chop_indices = [i for i, f in enumerate(flags) if f in ("chop_short", "chop_following")]
    chop_hs = [hs for i in chop_indices if (hs := passage.segments[i].hs_m) is not None]
    chop_tp = [tp for i in chop_indices if (tp := passage.segments[i].wave_period_s) is not None]

    chop_present = bool(chop_indices)
    # Following chop (sea from behind) is much less penalising — emit the
    # warning so the sailor sees it but skip the bump when *every* chop
    # segment is on a running angle. A single bow-on or beam segment in the
    # set still bumps, because that's where slamming happens.
    chop_following_only = chop_present and all(flags[i] == "chop_following" for i in chop_indices)
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
        n = notice("complexity.current", current_range=cur_range, nm=f"{affected_wac_nm:.0f}")
        warnings.append(
            ComplexityWarning(
                kind="current",
                level=bumped_level,
                message=n.message,
                affected_segments=affected_wac,
                code=n.code,
                params=n.params,
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
            chop_code = "complexity.chop_following"
            chop_warning_level = level  # no bump credited to this warning
        else:
            chop_label = "Clapot court"
            chop_code = "complexity.chop_short"
            chop_warning_level = bumped_level
        n = notice(chop_code, hs_range=hs_range, tp_range=tp_range, nm=f"{affected_chop_nm:.0f}")
        warnings.append(
            ComplexityWarning(
                kind="chop",
                level=chop_warning_level,
                message=n.message,
                affected_segments=affected_chop,
                code=n.code,
                params=n.params,
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
