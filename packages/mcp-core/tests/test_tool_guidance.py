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
    assert "coarse land check" in description
    assert "Redraw it and call again" in description

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


def test_plan_passage_describes_the_disclaimer_as_meant_for_the_user(by_name) -> None:
    """The field says who it is for; how the reply carries it is the host's.

    The MCP directory review holds connector text to what a tool does and
    returns, never how to word the reply, so the description no longer tells
    the model to relay it. It still says the warning is intended for the user,
    in the payload docs of both modes.
    """
    description = by_name["plan_passage"].description
    payload = description[description.index("## Returned payload") :]
    assert payload.count("``disclaimer``: usage warning intended for the user") == 2
    assert "not a navigation instrument" in payload


# Phrases that tell the model how to word or format its reply. The directory
# review rejects them in tool descriptions, server instructions and anything
# else the model reads from this server, payload included. Guidance on which
# tool to call and how to fill its inputs is fine and stays.
_REPLY_DIRECTIVES = (
    "your reply",
    "in the reply",
    "answer first",
    "answer in",
    "answer from your own knowledge",
    "relay",
    "say so",
    "present a short",
    "present it",
    "present them",
    "present the answer",
    "offer ``openwind_url``",
    "phrase the link",
    "phrased naturally",
    "in the user's language",
    "end your reply",
    "let the user choose",
    "car or at the bar",
    "voir sur la carte",
    "show the user",
    "give a trend",
)


async def test_no_text_for_the_model_dictates_the_reply(by_name) -> None:
    from openwind_mcp_core.server import SERVER_INSTRUCTIONS

    read_me = await build_server(adapter=object()).call_tool("read_me", {})
    texts = {
        "instructions": SERVER_INSTRUCTIONS,
        "read_me": str(read_me),
        **{name: tool.description or "" for name, tool in by_name.items()},
    }
    for where, text in texts.items():
        lowered = text.lower()
        for phrase in _REPLY_DIRECTIVES:
            assert phrase not in lowered, f"{where}: {phrase!r}"


def test_server_instructions_route_questions_and_say_when_to_call_nothing() -> None:
    """The instructions reach the model before any tool description.

    They are what sends a point question to the point tool, a pass to the
    request-free tidal tool, and a question about marinas to no tool at all.
    """
    from openwind_mcp_core.server import SERVER_INSTRUCTIONS

    server = build_server(adapter=object())
    assert server.instructions == SERVER_INSTRUCTIONS
    for tool in ("get_marine_forecast", "get_tidal_stream", "plan_passage", "read_me"):
        assert tool in SERVER_INSTRUCTIONS
    assert "Don't call OhMyWind's tools" in SERVER_INSTRUCTIONS
    assert "alternatives" in SERVER_INSTRUCTIONS
    assert "\u2014" not in SERVER_INSTRUCTIONS


def test_plan_passage_lists_the_archetypes_it_takes(by_name) -> None:
    """Seven of twenty passage questions spent a round on list_boat_archetypes.

    The list in the description comes from the polars: every archetype is
    there, with its examples, and the model still makes the match itself.
    """
    from openwind_data.routing import list_archetypes

    description = by_name["plan_passage"].description
    assert "{archetypes}" not in description
    for p in list_archetypes():
        assert f"``{p.name}``" in description
    assert "Sun Odyssey 32" in description
    # A "12 mètres" went out as cruiser_25ft: the metres sit beside the feet.
    assert "40 ft (12 m)" in description


def test_server_instructions_cover_offsets_parallel_calls_and_the_engine() -> None:
    """What the Haiku traces got wrong: UTC read as local, a loop of several
    days planned as one 42 h passage, calls made one after the other, and a
    calm passage sailed for 24 h without the engine."""
    from openwind_mcp_core.server import SERVER_INSTRUCTIONS

    assert "UTC offset" in SERVER_INSTRUCTIONS
    assert "same turn" in SERVER_INSTRUCTIONS
    assert "several days" in SERVER_INSTRUCTIONS
    assert "motor_threshold_kn" in SERVER_INSTRUCTIONS
    assert "weekday" in SERVER_INSTRUCTIONS
    assert "the pass rather than the nearest town" in SERVER_INSTRUCTIONS
