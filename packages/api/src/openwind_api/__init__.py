# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""OhMyWind REST API: a Starlette app, independent of any deployment.

``create_app(settings)`` returns the whole ``/api/v1`` surface plus the
landing page. Pass ``mcp_app`` to mount an MCP server behind it; leave it out
and the API serves on its own, which is what makes the MCP surface freezable
and this package redeployable anywhere.
"""

from openwind_api.app import create_app
from openwind_api.services import Services
from openwind_api.settings import Settings

__all__ = ["Services", "Settings", "create_app"]
