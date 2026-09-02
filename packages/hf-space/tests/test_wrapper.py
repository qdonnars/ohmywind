# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""What is left of this package once the libraries were extracted.

``app.py`` is now about a hundred lines whose whole job is to hand the REST
app an MCP server and the location of the landing media. Both of those are
one-line mistakes away from a Space that boots and serves 404s, and neither
is covered by the API package's own tests, which deliberately run without an
MCP server at all.
"""

from __future__ import annotations

import contextlib
import importlib.util
import pathlib

import pytest
from starlette.responses import PlainTextResponse
from starlette.testclient import TestClient

_HF_DIR = pathlib.Path(__file__).parents[1].resolve()

_MCP_BODY = "mounted mcp app"


def _load_app():
    """Load app.py by path: the Space runs it as a script, not as a module."""
    spec = importlib.util.spec_from_file_location("hf_app_wrapper", _HF_DIR / "app.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class _StubMcpApp:
    """Stands in for FastMCP's streamable-http app: a route and a lifespan."""

    class _Router:
        @staticmethod
        def lifespan_context(_app):
            @contextlib.asynccontextmanager
            async def _noop(_):
                yield

            return _noop(_app)

    router = _Router()

    async def __call__(self, scope, receive, send):
        await PlainTextResponse(_MCP_BODY)(scope, receive, send)


@pytest.fixture
def wrapper():
    return _load_app()


def test_the_mcp_app_is_mounted_under_the_rest_routes(wrapper) -> None:
    """The mount is the wrapper's reason to exist.

    ``create_app`` serves the REST surface with or without it, so nothing in
    the API package can notice this going missing. Here it is the difference
    between a working connector and a 404.
    """
    app = wrapper.create_app(wrapper.settings_from_env(), mcp_app=_StubMcpApp())
    with TestClient(app) as client:
        assert client.get("/api/v1/archetypes").status_code == 200
        assert client.get("/anything-the-mcp-app-owns").text == _MCP_BODY


def test_the_landing_media_ship_with_the_image(wrapper) -> None:
    """The Dockerfile COPYs a directory, the API package serves a name list.

    An asset can be committed, mirrored to the Space, and still be missing
    from the image, or renamed on one side only. Either way the landing page
    would show a broken player.
    """
    from openwind_api.routes.landing import STATIC_ASSETS

    for name in STATIC_ASSETS:
        assert (wrapper.STATIC_DIR / name).is_file(), name


def test_settings_point_at_the_shipped_media(wrapper) -> None:
    assert wrapper.settings_from_env().static_dir == wrapper.STATIC_DIR


def test_the_space_hostnames_are_allowed_through_the_rebinding_guard(wrapper) -> None:
    # FastMCP refuses any Host outside localhost by default; on HF that is a
    # 421 on every request, which is how this was found the first time.
    assert "mcp.ohmywind.fr" in wrapper.ALLOWED_HOSTS
