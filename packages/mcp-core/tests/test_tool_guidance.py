# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Guards on the instructions the tool descriptions carry to the client.

A tool description is prompt, not documentation: it is the only thing standing
between the model and a plausible wrong call. The land rule is the one worth
pinning, because breaking it fails silently. Nothing on this server checks that
a leg stays at sea, so a route drawn through a peninsula returns a normal-looking
passage that is too short, too fast, and scored on conditions the boat would
never meet. No exception, no warning, no way for the user to tell.

These assertions match on section headings and a couple of load-bearing phrases.
Reword them freely, but do it deliberately: a failure here means the client just
lost a rule it cannot infer on its own.
"""

from __future__ import annotations

import pytest

from openwind_mcp_core import build_server


@pytest.fixture
async def by_name():
    tools = await build_server(adapter=object()).list_tools()
    return {t.name: t for t in tools}


def test_plan_passage_makes_the_land_rule_prominent(by_name) -> None:
    """Not buried in the Args block, where it lived until this test existed."""
    description = by_name["plan_passage"].description
    assert "## Waypoints must stay in the water" in description
    assert "no land check" in description

    # Ahead of the payload docs: the caller has to read it before it matters,
    # not after it has already drawn the route.
    heading = description.index("## Waypoints must stay in the water")
    assert heading < description.index("## Returned payload")


def test_plan_passage_shows_a_route_that_needs_the_rule(by_name) -> None:
    """An abstract rule gets acknowledged and ignored; a worked example sticks.

    One per basin, both first-class scope: the direct line really does cross
    land on each.
    """
    description = by_name["plan_passage"].description
    assert "Toulon to Saint-Tropez" in description
    assert "Brest to Douarnenez" in description


def test_marine_forecast_warns_that_land_points_lose_sea_state(by_name) -> None:
    """Open-Meteo answers for an inland point rather than refusing it.

    Wind comes back normally, every wave value comes back null. Verified
    against the live API on a Vercors point at 1085 m.
    """
    description = by_name["get_marine_forecast"].description
    assert "Pass a point at sea" in description


def test_plan_passage_tells_the_model_to_relay_the_disclaimer(by_name) -> None:
    """A payload field the model is not told to use is a field it drops.

    The warning only reaches the user if the reply carries it, so the
    instruction is as load-bearing as the field itself.
    """
    description = by_name["plan_passage"].description
    assert "## ALWAYS relay the disclaimer" in description
    assert "``disclaimer``" in description

    # After the numbers, not instead of them: the instruction says so, and the
    # section sits past the payload docs so the model reads it in that order.
    assert description.index("## Returned payload") < description.index(
        "## ALWAYS relay the disclaimer"
    )
