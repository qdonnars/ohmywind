# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The strict reading of a custom polar, the MCP tool's (issue #514).

The lenient default, the REST API's, is covered where it is used
(``api/tests/test_parse_polar.py``); here, only what ``strict`` adds and the
proof that the default does not refuse it.
"""

from __future__ import annotations

import pytest

from openwind_data.routing.custom_polar import (
    POLAR_MAX_TWA_ENTRIES,
    POLAR_MAX_TWS_ENTRIES,
    parse_polar,
)


def _payload(**overrides) -> dict:
    base = {
        "tws_kn": [6, 10, 16],
        "twa_deg": [40, 60, 90, 120],
        "boat_speed_kn": [
            [3.0, 4.0, 4.5, 4.2],
            [4.5, 5.5, 6.0, 5.8],
            [5.0, 6.2, 6.8, 6.6],
        ],
    }
    base.update(overrides)
    return base


def _grid(n_tws: int, n_twa: int) -> dict:
    return {
        "tws_kn": list(range(n_tws)),
        "twa_deg": [i * 180 / (n_twa - 1) for i in range(n_twa)],
        "boat_speed_kn": [[5.0] * n_twa for _ in range(n_tws)],
    }


def test_the_largest_grid_is_accepted() -> None:
    polar = parse_polar(_grid(POLAR_MAX_TWS_ENTRIES, POLAR_MAX_TWA_ENTRIES), strict=True)
    assert len(polar.tws_kn) == POLAR_MAX_TWS_ENTRIES
    assert len(polar.twa_deg) == POLAR_MAX_TWA_ENTRIES


@pytest.mark.parametrize(
    ("n_tws", "n_twa"),
    [(POLAR_MAX_TWS_ENTRIES + 1, 10), (10, POLAR_MAX_TWA_ENTRIES + 1)],
)
def test_a_larger_grid_is_refused_strict_only(n_tws: int, n_twa: int) -> None:
    with pytest.raises(ValueError, match="polar grid too large"):
        parse_polar(_grid(n_tws, n_twa), strict=True)
    assert parse_polar(_grid(n_tws, n_twa)) is not None


@pytest.mark.parametrize(
    ("overrides", "needle"),
    [
        ({"tws_kn": [6, "nan", 16]}, "polar tws_kn must hold finite numbers"),
        ({"twa_deg": [40, 60, 90, "inf"]}, "polar twa_deg must hold finite numbers"),
        (
            {"boat_speed_kn": [[3.0, 4.0, 4.5, 4.2], [4.5, "nan", 6.0, 5.8], [5, 6, 7, 6]]},
            r"polar boat_speed_kn\[1\]\[1\]=nan is not a finite number",
        ),
    ],
)
def test_non_finite_values_are_refused(overrides: dict, needle: str) -> None:
    with pytest.raises(ValueError, match=needle):
        parse_polar(_payload(**overrides), strict=True)


def test_an_out_of_range_motor_is_refused_strict_and_dropped_lenient() -> None:
    payload = _payload(motor_threshold_kn=4.0, motor_speed_kn=50.0)
    with pytest.raises(ValueError, match=r"polar motor_speed_kn must be in \[0.5, 30\] kn"):
        parse_polar(payload, strict=True)
    assert parse_polar(payload).motor_speed_kn is None


def test_a_valid_payload_reads_the_same_either_way() -> None:
    payload = _payload(min_upwind_twa_deg=42, motor_threshold_kn=2.0, motor_speed_kn=5.5)
    assert parse_polar(payload, strict=True) == parse_polar(payload)
