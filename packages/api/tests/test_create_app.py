# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""``create_app`` without an MCP server: the property the package exists for.

Lot 2 of the rework plan splits the REST API away from the MCP deployment so
that the MCP surface can be frozen, replaced, or removed without touching the
API, and so the API can be redeployed anywhere without carrying the MCP SDK.
Both halves of that promise are one import away from being false, and neither
would fail loudly: the tests below are what makes them observable.
"""

from __future__ import annotations

import subprocess
import sys

from starlette.testclient import TestClient

from openwind_api import Settings, create_app


def test_it_boots_and_serves_without_an_mcp_app() -> None:
    app = create_app(Settings())
    with TestClient(app) as client:
        assert client.get("/api/v1/archetypes").status_code == 200
        assert client.get("/").status_code == 200
        assert client.post("/api/v1/passage", json={}).status_code == 422
        assert client.get("/api/v1/marine/marc/coverage").json() == {"atlases": []}


def test_nothing_under_the_mount_answers_without_an_mcp_app() -> None:
    # No catch-all: an unknown path is a 404, not a confusing 500 from a
    # mount that is not there.
    with TestClient(create_app(Settings())) as client:
        assert client.get("/mcp").status_code == 404


def test_the_package_imports_without_the_mcp_sdk() -> None:
    """No transitive dependency on ``mcp``, asserted the only honest way.

    A plain ``import openwind_api`` in this process proves nothing: mcp-core
    is installed in the same environment, so the module would resolve whether
    or not the API reaches for it. Blocking the name in a subprocess is what
    turns an accidental import into a failure.
    """
    blocked = (
        "import sys\n"
        "class _Block:\n"
        "    def find_spec(self, name, path=None, target=None):\n"
        "        if name == 'mcp' or name.startswith('mcp.'):\n"
        "            raise ImportError('mcp is not available to openwind_api')\n"
        "        return None\n"
        "sys.meta_path.insert(0, _Block())\n"
        # Prove the blocker works before trusting what it lets through.
        "try:\n"
        "    import mcp\n"
        "except ImportError:\n"
        "    pass\n"
        "else:\n"
        "    raise SystemExit('the import blocker is a no-op')\n"
        "import openwind_api\n"
        "openwind_api.create_app(openwind_api.Settings())\n"
        "print('ok')\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", blocked], capture_output=True, text=True, check=False
    )
    assert result.returncode == 0, result.stderr
    assert "ok" in result.stdout


def test_the_services_are_reachable_from_the_app() -> None:
    # How a handler finds the atlases, and how a test replaces them.
    app = create_app(Settings())
    assert app.state.services.marc.atlases == ()
    assert app.state.settings == Settings()
