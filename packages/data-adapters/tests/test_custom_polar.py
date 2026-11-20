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


def test_a_transposed_grid_is_named_as_such() -> None:
    """One row per TWA, the way polar tables are written: the refusal says to
    swap rows and columns, where a bare row count leaves the caller to guess."""
    payload = _payload()
    n_tws, n_twa = len(payload["tws_kn"]), len(payload["twa_deg"])
    assert n_tws != n_twa
    payload["boat_speed_kn"] = [list(col) for col in zip(*payload["boat_speed_kn"], strict=True)]
    with pytest.raises(ValueError, match=r"expected 3 \(one per TWS\); it looks transposed"):
        parse_polar(payload)


def test_a_wrong_row_count_that_is_not_a_transposition_keeps_the_plain_message() -> None:
    payload = _payload()
    payload["boat_speed_kn"] = payload["boat_speed_kn"][:2]
    with pytest.raises(ValueError) as excinfo:
        parse_polar(payload)
    assert str(excinfo.value).endswith("(one per TWS)")


# A 5 x 5 table as a sailor writes it, one line per TWA (45 to 150 deg), one
# column per TWS (6 to 24 kn): the square grid of the 2026-11-20 bench.
_SQUARE_TWS = [6, 10, 14, 18, 24]
_SQUARE_TWA = [45, 60, 90, 120, 150]
_SQUARE_BY_TWA = [
    [4.6, 6.1, 6.8, 7.0, 7.1],
    [5.2, 6.7, 7.3, 7.6, 7.8],
    [5.6, 7.2, 7.9, 8.4, 8.9],
    [5.3, 7.0, 8.1, 9.0, 10.2],
    [4.2, 5.9, 7.2, 8.4, 9.8],
]


def _square(by_tws: list[list[float]]) -> dict:
    return {"tws_kn": _SQUARE_TWS, "twa_deg": _SQUARE_TWA, "boat_speed_kn": by_tws}


def test_a_square_grid_sent_one_row_per_twa_is_refused_strict() -> None:
    """Nothing in the shape gives a square grid away, so the speeds do: read
    as sent, the boat would slow down as the wind rises."""
    with pytest.raises(ValueError, match="looks transposed: read as sent, at TWA 45 deg"):
        parse_polar(_square(_SQUARE_BY_TWA), strict=True)


def test_the_same_square_grid_the_right_way_round_is_read() -> None:
    by_tws = [list(col) for col in zip(*_SQUARE_BY_TWA, strict=True)]
    polar = parse_polar(_square(by_tws), strict=True)
    assert polar is not None
    assert polar.boat_speed_kn[0] == (4.6, 5.2, 5.6, 5.3, 4.2)


def test_the_lenient_reader_keeps_taking_a_square_grid_as_sent() -> None:
    """REST is unchanged: the web app builds the payload from a file whose
    layout it has parsed, it has no row order to guess."""
    assert parse_polar(_square(_SQUARE_BY_TWA)) is not None


def test_a_flat_square_grid_is_not_mistaken_for_a_transposed_one() -> None:
    flat = [[6.0] * 5 for _ in range(5)]
    assert parse_polar(_square(flat), strict=True) is not None


def test_every_bundled_polar_cut_square_passes_and_is_caught_turned_over() -> None:
    """The check against real grids: none is refused the right way round,
    and turned over every one is, the two that slow down in a blow included
    (the sail-and-oar dinghy and the IMOCA)."""
    from openwind_data.routing.archetypes import list_archetypes

    caught = []
    for polar in list_archetypes():
        n = min(len(polar.tws_kn), len(polar.twa_deg))
        cols = [round(k * (len(polar.twa_deg) - 1) / (n - 1)) for k in range(n)]
        by_tws = [[polar.boat_speed_kn[i][j] for j in cols] for i in range(n)]
        payload = {
            "tws_kn": list(polar.tws_kn[:n]),
            "twa_deg": [polar.twa_deg[j] for j in cols],
            "boat_speed_kn": by_tws,
        }
        assert parse_polar(payload, strict=True) is not None, polar.name
        turned = payload | {"boat_speed_kn": [list(c) for c in zip(*by_tws, strict=True)]}
        try:
            parse_polar(turned, strict=True)
        except ValueError as exc:
            assert "looks transposed" in str(exc)
            caught.append(polar.name)
    assert caught == [p.name for p in list_archetypes()]
