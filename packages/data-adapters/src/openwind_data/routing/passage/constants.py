# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Tuning constants of the passage engine, and why each one is where it is.

Gathered here rather than next to their first use because most of them are
read from two or three modules, and because a number that decides how the
product behaves deserves to be found by looking for it rather than by
following an import.
"""

from __future__ import annotations

from datetime import timedelta

# Reference conditions for the boat-aware layout speed (`_layout_speed_kn`):
# moderate breeze on a broad reach, the regime a coastal passage mostly sails
# in. For a classic cruiser this lands near the ~6 kn constant the layout
# used before it became boat-aware.
LAYOUT_REF_TWS_KN = 12.0


LAYOUT_REF_TWA_DEG = 110.0


WIND_FETCH_WINDOW = timedelta(hours=3)


MIN_BOAT_SPEED_KN = 0.5  # floor to avoid division blow-up in extreme stalls


# Strong-wind and sea-state warnings are emitted by `score_complexity` (which
# also reports affected route distance). Only the light-wind warning lives here
# because complexity doesn't model boat-speed stalls.
LIGHT_WIND_THRESHOLD_KN = 3.0  # under this min boat speed, surface "vent faible"


PREWARM_MIN_SPEED_KN = 2.0  # conservative floor to upper-bound passage duration for cache prewarm


MAX_SWEEP_WINDOWS = 336  # 14 days x 24h hard cap


# A sweep costs windows x segments simulations, and until now only the two
# factors were bounded (MAX_SWEEP_WINDOWS here, MAX_WAYPOINTS in geometry),
# never their product. Asking for both maxima at once is what a hostile caller
# does, and it is reachable without a key: /mcp is deliberately exempt from the
# REST rate limiter so a legitimate MCP session is never throttled.
#
# Measured on a 2026-08 laptop, network stubbed, real cache and slicing:
#   96 sims (5 wpt, 3 d)      12 ms
#   1848 sims (12 wpt, 7 d)  146 ms
#   11760 sims (50 wpt, 10 d) 906 ms
# so the budget below is roughly 650 ms of CPU, several times that on the
# Space's shared vCPU. It sits well above any route a human draws (336 windows
# still allow a 23-segment route) which is why exceeding it widens the
# interval instead of failing: the same "degrade and warn" contract as
# _resolve_segment_length, not a refusal the caller cannot act on.
MAX_SWEEP_SIMULATIONS = 8000


# Sample-cap heuristic: long passages would otherwise issue 20+ Open-Meteo
# fetches per window. Auto-stretch segment_length_nm so we sample at most
# MAX_SAMPLED_SEGMENTS points per route, but keep a [MIN, MAX] band so we
# never go below ~10 nm precision (Med thermal/local winds matter at that
# scale) nor above ~30 nm (would skip whole regimes like the mistral cutoff
# at Cap Sicié).
MAX_SAMPLED_SEGMENTS = 10


MIN_SEG_LENGTH_NM = 10.0


MAX_SEG_LENGTH_NM = 30.0


# Wave derate — see README "References" section for sources.
WAVE_DERATE_K = 0.05


WAVE_DERATE_P = 1.75


WAVE_DERATE_FLOOR = 0.5
