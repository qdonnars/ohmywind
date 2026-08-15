# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Run the OhMyWind MCP server over stdio for local Claude Desktop integration.

Usage (in claude_desktop_config.json):

    {
      "mcpServers": {
        "ohmywind": {
          "command": "uv",
          "args": ["--directory", "/abs/path/to/packages/mcp-core",
                   "run", "python", "scripts/run_local.py"]
        }
      }
    }
"""

from __future__ import annotations

from openwind_mcp_core import build_server

if __name__ == "__main__":
    build_server().run()
