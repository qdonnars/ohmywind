# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""HF Space entry point: the REST API with the MCP server mounted behind it.

Everything this file used to hold now lives in two libraries. The REST surface
is ``openwind_api`` (``create_app``), the MCP tools are ``openwind_mcp_core``
(``build_server``), and neither knows about Hugging Face. What is left here is
what is genuinely specific to this deployment: reading the environment,
allowing the Space's own Host header through FastMCP's DNS-rebinding guard,
and running uvicorn with the proxy flags HF's TLS edge requires.

Re-deploying on Fly, Modal or a VPS is a different file of about this size.
Freezing the MCP surface is dropping the ``mcp_app`` argument.

Transport: ``streamable-http`` on port 7860 (HF Spaces default). Clients
connect through ``mcp.ohmywind.fr``.

Trade-off explicitly accepted: HF Docker SDK Spaces do not get the ``MCP``
badge or the one-click connector flow that Gradio ``mcp_server=True`` Spaces
get. Discoverability is via the project website, not via the HF catalog.
Re-evaluate if traffic plateaus.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

import uvicorn
from mcp.server.transport_security import TransportSecuritySettings
from openwind_api import Settings, create_app
from openwind_api.security import warn_if_edge_secret_missing
from openwind_mcp_core import build_server

PORT = 7860

# FastMCP's streamable-http transport ships DNS-rebinding protection that
# rejects any Host header outside ``localhost`` by default. On HF that
# manifests as 421 "Invalid Host header" with the Space hostname. The Space
# is fronted by HF's TLS proxy which we already authorize via
# ``proxy_headers``, so we extend the allowed-hosts list to include the
# Space hostname (overridable via env for future custom domains / migrations).
DEFAULT_ALLOWED_HOSTS = [
    # The Host the Worker presents upstream, and the public one a direct
    # caller sends. Both must pass or one of the two paths 421s.
    "qdonnars-openwind-mcp.hf.space",
    "mcp.ohmywind.fr",
]
ALLOWED_HOSTS = [
    h.strip()
    for h in os.environ.get("OPENWIND_ALLOWED_HOSTS", ",".join(DEFAULT_ALLOWED_HOSTS)).split(",")
    if h.strip()
]

# The landing page's demo loop and its poster, copied into the image by the
# Dockerfile. They stay with the deployment rather than inside the API
# package: 2.5 MB of binary belongs to what ships, not to what is imported.
STATIC_DIR = Path(__file__).resolve().parent / "static"


def settings_from_env() -> Settings:
    """Read this deployment's configuration, once, at startup."""
    return Settings(
        marc_atlas_dir=os.environ.get("MARC_ATLAS_DIR", ""),
        shom_c2d_dir=os.environ.get("SHOM_C2D_DIR", ""),
        static_dir=STATIC_DIR,
    )


def build_mcp_app() -> Any:
    """The FastMCP streamable-http app, with the Space's hosts allowed."""
    server = build_server()
    server.settings.transport_security = TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=ALLOWED_HOSTS,
    )
    return server.streamable_http_app()


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    warn_if_edge_secret_missing()
    app = create_app(settings_from_env(), mcp_app=build_mcp_app())
    # Run uvicorn explicitly (rather than ``server.run(transport=...)``) so we
    # can enable ``proxy_headers``/``forwarded_allow_ips``. HF terminates TLS
    # at the edge; without these flags ASGI sees ``http`` + the internal Host
    # and emits broken redirects.
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=PORT,
        proxy_headers=True,
        forwarded_allow_ips="*",
    )


if __name__ == "__main__":
    main()
