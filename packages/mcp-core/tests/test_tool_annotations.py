"""Every tool declares what it does to the world.

Annotations drive how clients present a tool: read-only ones can be offered
without a confirmation prompt, writing ones should not be. An unannotated tool
is treated conservatively by some hosts and carelessly by others, which is the
worst of both.

They are also a hard requirement of Anthropic's connector directory, so this
is the cheap groundwork for listing rather than a nicety.
"""

from __future__ import annotations

import pytest

from openwind_mcp_core import build_server

# The one tool that writes. Kept as data so the "nothing else writes" assertion
# below reads as a decision rather than a magic string.
WRITING_TOOLS = {"feedback"}


@pytest.fixture
async def tools():
    return await build_server(adapter=object()).list_tools()


async def test_every_tool_is_annotated(tools) -> None:
    missing = [t.name for t in tools if t.annotations is None]
    assert missing == [], f"tools with no annotations: {missing}"


async def test_every_tool_has_a_display_title(tools) -> None:
    """Without it, clients fall back to the raw function name."""
    untitled = [t.name for t in tools if not (t.annotations and t.annotations.title)]
    assert untitled == []


async def test_only_the_feedback_tool_writes(tools) -> None:
    """The assertion that earns its keep.

    Adding a tool that mutates anything without flipping readOnlyHint would let
    hosts run it unprompted. Failing here forces that to be a conscious choice
    rather than an omission.
    """
    writing = {t.name for t in tools if t.annotations and t.annotations.readOnlyHint is False}
    assert writing == WRITING_TOOLS


async def test_the_writing_tool_is_neither_destructive_nor_idempotent(tools) -> None:
    """``feedback`` appends one entry per call.

    Not destructive, because it never replaces or removes anything. Not
    idempotent, because calling it twice records twice — a host that assumed
    otherwise could silently retry and double-log.
    """
    feedback = next(t for t in tools if t.name == "feedback")
    assert feedback.annotations.destructiveHint is False
    assert feedback.annotations.idempotentHint is False


async def test_open_world_marks_the_tools_that_call_out(tools) -> None:
    """Distinguishes a live upstream fetch from a lookup in a bundled table.

    ``list_boat_archetypes`` and ``read_me`` are constants of this server;
    the other two reach Open-Meteo, whose availability we do not control.
    """
    by_name = {t.name: t.annotations.openWorldHint for t in tools}
    assert by_name["get_marine_forecast"] is True
    assert by_name["plan_passage"] is True
    assert by_name["list_boat_archetypes"] is False
    assert by_name["read_me"] is False
