# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The server reports OhMyWind's version, not the MCP SDK's.

Directories and clients show serverInfo.version. Left to the SDK it read
1.27.2, the version of ``mcp``. The release process bumps one number, in
packages/web/package.json (docs/releases.md); this is the check that the
server reports that one.
"""

from __future__ import annotations

import json
from pathlib import Path

from openwind_mcp_core import build_server

_REPO = Path(__file__).resolve().parents[3]
_PACKAGE_JSON = _REPO / "packages" / "web" / "package.json"


def _release() -> str:
    return json.loads(_PACKAGE_JSON.read_text(encoding="utf-8"))["version"]


def test_server_reports_the_release_version() -> None:
    server = build_server(adapter=object())
    options = server._mcp_server.create_initialization_options()
    assert options.server_name == "ohmywind"
    assert options.server_version == _release()


def test_registry_entry_carries_the_release_version() -> None:
    """server.json is what the MCP registry lists. The publish workflow stamps
    the tag's version on it anyway; keeping the file in step means a manual
    run without a version publishes the right one too."""
    entry = json.loads((_REPO / "server.json").read_text(encoding="utf-8"))
    assert entry["version"] == _release()
