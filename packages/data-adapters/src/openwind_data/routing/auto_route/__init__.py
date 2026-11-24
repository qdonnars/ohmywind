# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Auto-route spike (issue #540): a draft route at sea from a departure and an arrival.

Prototype. The MCP server uses it to repair a route that crosses land
(``repair``, ``dispatch``), only when ``OPENWIND_ROUTE_REPAIR`` asks for it.
"""

from openwind_data.routing.auto_route.engine import (
    AutoRoute,
    Leg,
    RouteParams,
    suggest_route,
)
from openwind_data.routing.auto_route.grid import NavGrid

__all__ = ["AutoRoute", "Leg", "NavGrid", "RouteParams", "suggest_route"]
