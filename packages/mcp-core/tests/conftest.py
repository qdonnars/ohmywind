# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Shared test setup for the MCP server."""

from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def route_repair_off(monkeypatch):
    """Plan routes as drawn unless a test asks for the repair.

    The repair is off by default; this pins it off whatever the shell
    exports, because most tests here plan Marseille to Porquerolles, whose
    straight line cuts the coast: left on, every one of them would spawn a
    repair worker and test the repair instead of what it is about. The tests
    of the repair set ``OPENWIND_ROUTE_REPAIR`` themselves (the repaired
    goldens, ``TestRouteRepairDefault``, the guidance tests).
    """
    monkeypatch.setenv("OPENWIND_ROUTE_REPAIR", "off")
