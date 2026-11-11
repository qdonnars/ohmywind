# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The state of the sea on one stretch of water, decided and named in one place.

Three readers used to decide it, each with its own numbers and its own words:
the complexity scorer (bands at 1, 2 and 3 m, "agitée", "forte"), the web
app's leg list (1.25 and 2.5 m on the *mean* height of a leg, "mer formée",
"grosse mer") and the web app again for chop and wind against current, from
leg averages. A leg could be orange in the list and unmentioned in the
warnings, or the reverse.

This module is the one that decides. The passage engine stamps its verdict on
every segment (``SegmentReport.sea_level`` and ``sea_flag``), the complexity
scorer builds the passage's score and warnings from the same two functions,
and a client only translates the codes.

Band edges are those of the Douglas scale the marine bulletins use (1.25,
2.5 and 4 m), and so are the words, with one exception: level 3 is "formée",
the sailors' word, where the bulletin says "agitée". A product decision, one
vocabulary from the leg list to the MCP answer. The other languages of the
web app use their own bulletins' terms (see the web dictionaries).
"""

from __future__ import annotations

import math
from typing import Literal

from openwind_data.adapters.base import (
    CHOP_FOLLOWING_TWA_DEG,
    CHOP_HS_FLOOR_M,
    CHOP_INDEX_THRESHOLD,
    WIND_AGAINST_CURRENT_OPPOSITION_DEG,
    WIND_AGAINST_CURRENT_WARNING_THRESHOLD_KN,
)

# (upper_bound_exclusive, level, label), on the significant wave height in
# metres. The label is the adjective, as it reads after "mer" in a rationale.
SEA_BANDS: tuple[tuple[float, int, str], ...] = (
    (0.5, 1, "plate"),
    (1.25, 2, "peu agitée"),
    (2.5, 3, "formée"),
    (4.0, 4, "forte"),
    (float("inf"), 5, "très forte"),
)

# Lowest level that is worth a warning: under it the sea is only described.
SEA_WARNING_LEVEL = 3

# The name of a sea worth a warning, as a warning opens with it and as a leg
# is flagged with it.
SEA_NAMES: dict[int, str] = {
    3: "Mer formée",
    4: "Mer forte",
    5: "Mer très forte",
}

SeaFlag = Literal["wind_against_current", "chop_short", "chop_following"]


def as_printed(value: float, digits: int) -> float:
    """``value`` rounded the way a reader sees it, half up, to ``digits``.

    Bands are read on the printed figure, not the raw forecast: a warning
    says "Hs 1.2 m" and a table cell "1,2", so a 1.249 m sea that the bands
    put above an edge the printed figure is under (or the reverse) shows the
    reader one number and two verdicts. Half up, like the web app's
    ``Math.round``, rather than Python's ``round``, which rounds half to even.
    """
    scale = 10**digits
    return math.floor(value * scale + 0.5) / scale


def sea_level(hs_m: float | None) -> int | None:
    """Level 1 to 5 of a significant wave height, ``None`` without one.

    Read on the height to the tenth of a metre, as it is printed: 2.46 m
    reads "2.5" and is a "Mer forte".
    """
    if hs_m is None:
        return None
    shown = as_printed(hs_m, 1)
    for upper, level, _ in SEA_BANDS:
        if shown < upper:
            return level
    raise AssertionError("bands must end with +inf")  # pragma: no cover


def sea_flag(
    *,
    twd_deg: float,
    twa_deg: float,
    hs_m: float | None,
    wave_period_s: float | None,
    current_speed_kn: float | None,
    current_direction_to_deg: float | None,
) -> SeaFlag | None:
    """What makes the sea worse than its height says, on one segment.

    - ``"wind_against_current"``: a current of 1.5 kt or more setting against
      the wind (the wind's heading, ``twd + 180``, at 120° or more from the
      current's). It is about the wind, not about the boat: a current on the
      nose with the wind behind it is a slow leg, not a broken sea.
    - ``"chop_short"``: a short, steep wind sea, ``Hs / Tp²`` above 0.05 with
      at least 0.8 m of it.
    - ``"chop_following"``: the same, taken from behind (``|TWA|`` of 120° or
      more), where the boat runs with the wave instead of slamming into it.

    Wind against current wins over chop on the same segment: both say
    "broken sea", and the first names its cause.
    """
    if (
        current_speed_kn is not None
        and current_direction_to_deg is not None
        and current_speed_kn >= WIND_AGAINST_CURRENT_WARNING_THRESHOLD_KN
    ):
        wind_to = (twd_deg + 180.0) % 360.0
        delta = abs(((wind_to - current_direction_to_deg + 540.0) % 360.0) - 180.0)
        if delta >= WIND_AGAINST_CURRENT_OPPOSITION_DEG:
            return "wind_against_current"

    if hs_m is None or wave_period_s is None:
        return None
    if hs_m < CHOP_HS_FLOOR_M or wave_period_s <= 0:
        return None
    if hs_m / (wave_period_s**2) > CHOP_INDEX_THRESHOLD:
        return "chop_following" if abs(twa_deg) >= CHOP_FOLLOWING_TWA_DEG else "chop_short"
    return None
