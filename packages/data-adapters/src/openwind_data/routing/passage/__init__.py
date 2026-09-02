# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Passage time + complexity estimation along a polyline of waypoints.

V1 design choices:

- **Single-pass approximation** (challenge #7): we do not iterate until convergence
  on segment timings. We first lay out per-segment mid-times using a boat-aware
  cruising estimate (polar at the reference point x efficiency, through the motor
  rule, see `physics._layout_speed_kn`), fetch wind at each mid-time/mid-position,
  then compute the actual speed and accumulate true durations. Because the layout
  speed tracks the boat (a 20 kn cat lays out at ~20 kn, a motor-dominant config
  at motor speed), the wind window we hit is shifted by at most a few hours,
  well within the temporal correlation length of the forecast.
  ``PassageReport.max_sampling_drift_h`` reports the residual shift observed.
- **Efficiency factor 0.75** (challenge #8): polars are ORC theoretical maxima.
  Real-world cruising (sail trim, comfort margins, sea state, helmsman, currents)
  costs ~25%. See `docs/boat-archetypes.md`. Override via the `efficiency` arg.
- **Wind only** (no wave-driven slow-down in V1). Sea state feeds `warnings`,
  not `boat_speed`.
- **No tack handling**: TWA in [0, 180] only; polars are symmetric.

## Layout

This was one 1263-line module until the 2026-09 audit; the split follows the
order in which a passage is computed, so a reader can walk it top to bottom:

| Module | What lives there |
|---|---|
| `constants` | the tuning numbers, and why each is what it is |
| `models` | `SegmentReport`, `PassageReport`, `EtaPassagePlan`, `NoModelCoveredError` |
| `physics` | polar geometry, wave derate, motor rule, current projection. Pure |
| `sampling` | route cutting, sampling times, the fetch and its fallback chain |
| `engine` | one segment, the walk, the warnings |
| `single` | `estimate_passage`, `estimate_passage_for_arrival` |
| `sweep` | `estimate_passage_windows`, `resolve_sweep_interval` |

Everything the rest of the codebase imports is re-exported here, so
``from openwind_data.routing.passage import X`` keeps working unchanged for
every X it worked for before. Importing from a submodule is fine too, and is
what the modules do among themselves; the flat surface exists for callers
outside the package, which should not have to know where a name landed.
"""

from __future__ import annotations

from openwind_data.routing.passage.constants import (
    LAYOUT_REF_TWA_DEG,
    LAYOUT_REF_TWS_KN,
    LIGHT_WIND_THRESHOLD_KN,
    MAX_SAMPLED_SEGMENTS,
    MAX_SEG_LENGTH_NM,
    MAX_SWEEP_SIMULATIONS,
    MAX_SWEEP_WINDOWS,
    MIN_BOAT_SPEED_KN,
    MIN_SEG_LENGTH_NM,
    PREWARM_MIN_SPEED_KN,
    WAVE_DERATE_FLOOR,
    WAVE_DERATE_K,
    WAVE_DERATE_P,
    WIND_FETCH_WINDOW,
)
from openwind_data.routing.passage.models import (
    EtaPassagePlan,
    NoModelCoveredError,
    PassageReport,
    SegmentReport,
)

# Private, but imported by the passage tests: the layout speed is the one
# number that decides which weather window a passage samples, and it is
# asserted directly rather than through a whole estimate. Re-exported under
# its own name so the split does not move a test's import.
from openwind_data.routing.passage.physics import _layout_speed_kn as _layout_speed_kn
from openwind_data.routing.passage.physics import (
    best_vmg_upwind,
    build_conditions_summary,
    wave_derate,
)
from openwind_data.routing.passage.single import (
    estimate_passage,
    estimate_passage_for_arrival,
)
from openwind_data.routing.passage.sweep import (
    estimate_passage_windows,
    resolve_sweep_interval,
)

__all__ = [
    "LAYOUT_REF_TWA_DEG",
    "LAYOUT_REF_TWS_KN",
    "LIGHT_WIND_THRESHOLD_KN",
    "MAX_SAMPLED_SEGMENTS",
    "MAX_SEG_LENGTH_NM",
    "MAX_SWEEP_SIMULATIONS",
    "MAX_SWEEP_WINDOWS",
    "MIN_BOAT_SPEED_KN",
    "MIN_SEG_LENGTH_NM",
    "PREWARM_MIN_SPEED_KN",
    "WAVE_DERATE_FLOOR",
    "WAVE_DERATE_K",
    "WAVE_DERATE_P",
    "WIND_FETCH_WINDOW",
    "EtaPassagePlan",
    "NoModelCoveredError",
    "PassageReport",
    "SegmentReport",
    "best_vmg_upwind",
    "build_conditions_summary",
    "estimate_passage",
    "estimate_passage_for_arrival",
    "estimate_passage_windows",
    "resolve_sweep_interval",
    "wave_derate",
]
