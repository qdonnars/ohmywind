# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Shared test setup for the MCP server."""

from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def route_repair_off(monkeypatch):
    """Plan routes as drawn unless a test asks for the repair.

    The server repairs a route over land by default, and most tests here
    plan Marseille to Porquerolles, whose straight line cuts the coast: left
    on, every one of them would spawn a repair worker and test the repair
    instead of what it is about. The tests of the repair set
    ``OPENWIND_ROUTE_REPAIR=compute`` themselves (``test_route_repair_gate``,
    the repaired goldens, the REST parity test).
    """
    monkeypatch.setenv("OPENWIND_ROUTE_REPAIR", "off")
