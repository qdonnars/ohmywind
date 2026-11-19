# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Auto-route spike (issue #540): a draft route at sea from a departure and an arrival.

Isolated prototype, imported by nothing in the API or the MCP server.
"""

from openwind_data.routing.auto_route.engine import (
    AutoRoute,
    Leg,
    RouteParams,
    suggest_route,
)
from openwind_data.routing.auto_route.grid import NavGrid

__all__ = ["AutoRoute", "Leg", "NavGrid", "RouteParams", "suggest_route"]
