# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Unit tests for ``_parse_polar`` — the gate every custom polar from the web
app passes through. First coverage of this function: it existed since the
custom-polar feature with zero tests, and it is exactly where new payload
fields (``min_upwind_twa_deg``) land.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

import pytest
from fake_requests import FakeRequest
from openwind_data.routing.archetypes import effective_min_upwind_twa

from openwind_api import parsing
from openwind_api.routes import passage as passage_routes


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


class TestShapeAndBounds:
    def test_none_passthrough(self) -> None:
        assert parsing.parse_polar(None) is None

    def test_valid_payload_round_trip(self) -> None:
        polar = parsing.parse_polar(_payload())
        assert polar.tws_kn == (6.0, 10.0, 16.0)
        assert polar.twa_deg == (40.0, 60.0, 90.0, 120.0)
        assert polar.boat_speed_kn[1][2] == 6.0
        assert polar.name == "custom"
        assert polar.motor_threshold_kn is None
        assert polar.min_upwind_twa_deg is None

    def test_non_object_refused(self) -> None:
        with pytest.raises(ValueError, match="must be an object"):
            parsing.parse_polar([1, 2, 3])

    def test_missing_key_refused(self) -> None:
        payload = _payload()
        del payload["twa_deg"]
        with pytest.raises(ValueError, match="missing or non-numeric"):
            parsing.parse_polar(payload)

    def test_non_ascending_tws_refused(self) -> None:
        with pytest.raises(ValueError, match="tws_kn must be strictly ascending"):
            parsing.parse_polar(_payload(tws_kn=[10, 6, 16]))

    def test_non_ascending_twa_refused(self) -> None:
        with pytest.raises(ValueError, match="twa_deg must be strictly ascending"):
            parsing.parse_polar(_payload(twa_deg=[40, 40, 90, 120]))

    def test_twa_above_180_refused(self) -> None:
        with pytest.raises(ValueError, match=r"twa_deg must lie in \[0, 180\]"):
            parsing.parse_polar(_payload(twa_deg=[40, 60, 90, 200]))

    def test_row_count_mismatch_refused(self) -> None:
        with pytest.raises(ValueError, match="rows, expected"):
            parsing.parse_polar(_payload(boat_speed_kn=[[3.0, 4.0, 4.5, 4.2]]))

    def test_col_count_mismatch_refused(self) -> None:
        bad = _payload()
        bad["boat_speed_kn"][1] = [4.5, 5.5]
        with pytest.raises(ValueError, match="cols, expected"):
            parsing.parse_polar(bad)

    def test_speed_out_of_range_refused(self) -> None:
        bad = _payload()
        bad["boat_speed_kn"][0][0] = 31.0
        with pytest.raises(ValueError, match=r"out of range \[0, 30\]"):
            parsing.parse_polar(bad)


class TestMotorFields:
    def test_both_valid_accepted(self) -> None:
        polar = parsing.parse_polar(_payload(motor_threshold_kn=2.0, motor_speed_kn=5.5))
        assert polar.motor_threshold_kn == 2.0
        assert polar.motor_speed_kn == 5.5

    def test_threshold_alone_dropped(self) -> None:
        polar = parsing.parse_polar(_payload(motor_threshold_kn=2.0))
        assert polar.motor_threshold_kn is None
        assert polar.motor_speed_kn is None

    def test_fast_boat_pair_accepted(self) -> None:
        # The 30 kn cap mirrors the polar matrix ceiling; a "motor unless the
        # sails do better than 15 kn" config is legitimate (fast cat, RIB).
        polar = parsing.parse_polar(_payload(motor_threshold_kn=15.0, motor_speed_kn=25.0))
        assert polar.motor_threshold_kn == 15.0
        assert polar.motor_speed_kn == 25.0

    def test_out_of_range_pair_dropped(self) -> None:
        # Motor stays tolerant (silent drop), unlike min_upwind_twa_deg. The
        # web clamps at input, so anything above 30 here is a bypassing client.
        polar = parsing.parse_polar(_payload(motor_threshold_kn=15.0, motor_speed_kn=50.0))
        assert polar.motor_threshold_kn is None
        assert polar.motor_speed_kn is None


class TestMinUpwind:
    def test_valid_value_accepted(self) -> None:
        polar = parsing.parse_polar(_payload(min_upwind_twa_deg=47.5))
        assert polar.min_upwind_twa_deg == 47.5

    def test_absent_stays_none(self) -> None:
        assert parsing.parse_polar(_payload()).min_upwind_twa_deg is None

    @pytest.mark.parametrize("bad", ["abc", 0, 90, -5, float("nan")])
    def test_malformed_refused(self, bad) -> None:
        with pytest.raises(ValueError, match=r"min_upwind_twa_deg must be a number in \(0, 90\)"):
            parsing.parse_polar(_payload(min_upwind_twa_deg=bad))

    def test_zero_column_grid_accepted_and_derives_floor(self) -> None:
        # Imported qtVlm files often carry a 0° row of zeros. The payload is
        # legal, and the derived min upwind angle must skip the dead column.
        polar = parsing.parse_polar(
            _payload(
                twa_deg=[0, 40, 60, 90],
                boat_speed_kn=[
                    [0.0, 3.0, 4.0, 4.5],
                    [0.0, 4.5, 5.5, 6.0],
                    [0.0, 5.0, 6.2, 6.8],
                ],
            )
        )
        assert effective_min_upwind_twa(polar) == 40.0


@pytest.mark.asyncio
async def test_endpoint_returns_422_on_bad_min_upwind() -> None:
    body = {
        "waypoints": [[43.30, 5.35], [43.00, 6.20]],
        "departure": datetime(2026, 5, 1, 6, 0, tzinfo=UTC).isoformat(),
        "archetype": "cruiser_40ft",
        "polar": _payload(min_upwind_twa_deg=120),
    }
    resp = await passage_routes.api_passage(FakeRequest(body))
    assert resp.status_code == 422
    assert "min_upwind_twa_deg" in json.loads(bytes(resp.body))["error"]
