# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""What a human gets for visiting the API's root.

The page itself is ``static/landing.html``, shipped inside this package and
read once at import. It used to be a 230-line string literal in the middle of
the request handlers, where a copy edit and a routing change lived in the same
diff.

The demo video lives on YouTube; what the page serves itself is the poster
the player hides behind until someone presses play, so that nothing from
YouTube loads on a visit. The poster does not ship here: binary belongs to a
deployment, not to a library, so the deployment points
``Settings.static_dir`` at it. Without it the page still serves, with a
poster that finds nothing and a link to the video that still works, which is
the right degraded state for a redeployment that has not copied it yet.
"""

from __future__ import annotations

from importlib import resources
from pathlib import Path

from starlette.requests import Request
from starlette.responses import FileResponse, HTMLResponse, PlainTextResponse, RedirectResponse

# The assistants' official connector directories that list OhMyWind, one
# entry per directory, each filling the ``{{<name>_directory_url}}`` slot of
# the page. The URL lives here and nowhere else in the page: when another
# directory approves the connector, its listing is one line here and one
# button in the page.
DIRECTORY_URLS = {
    "claude": "https://claude.ai/directory/ohmywind",
}


def render_landing(template: str) -> str:
    """The landing page with every directory slot filled.

    Fails at import rather than serving a button that points at
    ``{{...}}``: a slot without its entry is a typo, not a degraded state.
    """
    html = template
    for name, url in DIRECTORY_URLS.items():
        html = html.replace("{{" + name + "_directory_url}}", url)
    if "{{" in html:
        raise RuntimeError("landing.html has a {{...}} slot with no entry in DIRECTORY_URLS")
    return html


LANDING_HTML = render_landing(
    resources.files("openwind_api").joinpath("static/landing.html").read_text(encoding="utf-8")
)

# Connector pickers in chat hosts (Claude, etc.) often scrape the server
# URL's favicon / og:image to badge the connector. Our app responded 404
# on /favicon.ico and the host fell back to HuggingFace branding. Redirect
# every common icon probe to the OhMyWind PNG/SVG hosted on ohmywind.fr.
ICON_REDIRECTS = {
    "/favicon.ico": "https://ohmywind.fr/favicon.svg",
    "/favicon.svg": "https://ohmywind.fr/favicon.svg",
    "/icon-192.png": "https://ohmywind.fr/icon-192.png",
    "/icon-512.png": "https://ohmywind.fr/icon-512.png",
    "/apple-touch-icon.png": "https://ohmywind.fr/icon-maskable-512.png",
    "/apple-touch-icon-precomposed.png": "https://ohmywind.fr/icon-maskable-512.png",
}

# The video poster ships with the deployment rather than coming from
# i.ytimg.com: fetching YouTube's thumbnail would tell Google about every
# visit, which the click-to-load player exists to avoid. One file means an
# explicit allowlist rather than a StaticFiles mount, which keeps the routing
# table readable and makes path traversal impossible by construction. A new
# poster ships under a new name: the old one sits in caches for a week.
STATIC_ASSETS = {
    "video-poster.jpg": "image/jpeg",
}


async def index(_request: Request) -> HTMLResponse:
    return HTMLResponse(LANDING_HTML)


async def icon_redirect(request: Request) -> RedirectResponse:
    target = ICON_REDIRECTS[request.url.path]
    return RedirectResponse(
        target, status_code=302, headers={"Cache-Control": "public, max-age=86400"}
    )


def static_asset_route(static_dir: Path | None):
    """Build the ``/static/{asset}`` handler bound to a deployment directory."""

    async def static_asset(request: Request) -> FileResponse | PlainTextResponse:
        name = request.path_params["asset"]
        media_type = STATIC_ASSETS.get(name)
        if media_type is None or static_dir is None:
            return PlainTextResponse("Not found", status_code=404)
        path = static_dir / name
        if not path.is_file():
            return PlainTextResponse("Not found", status_code=404)
        # A new cut ships under the same name on redeploy and the deployment
        # restarts with it, so a week of edge caching costs nothing but a
        # stale week for anyone who visited mid-deploy.
        return FileResponse(
            path,
            media_type=media_type,
            headers={"Cache-Control": "public, max-age=604800"},
        )

    return static_asset
