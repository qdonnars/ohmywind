# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""A route at sea between two points, and the repair of a drawn route that crosses land.

``engine`` searches a land grid for a way at sea; ``repair`` applies it to
the legs of a route that run over land, on the shoreline of ``land_tiles``;
``dispatch`` runs that in a worker process for the REST API and the MCP
server. The web app runs the same repair in the browser, in TypeScript.
"""

from openwind_data.routing.auto_route.engine import (
    AutoRoute,
    Leg,
    RouteParams,
    suggest_route,
)
from openwind_data.routing.auto_route.grid import NavGrid

__all__ = ["AutoRoute", "Leg", "NavGrid", "RouteParams", "suggest_route"]
