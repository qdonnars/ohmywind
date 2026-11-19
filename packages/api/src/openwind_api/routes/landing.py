# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""What a human gets for visiting the API's root.

The page itself is ``static/landing.html``, shipped inside this package and
read once at import. It used to be a 230-line string literal in the middle of
the request handlers, where a copy edit and a routing change lived in the same
diff.

It speaks the web app's five languages. The HTML is one template with a
``{{t:<key>}}`` slot per piece of text, the words live in ``landing_copy``,
and every language is rendered at import: a missing key, a stray key or a
leftover slot stops the import instead of reaching a reader. Each request
picks its language from ``?lang=`` first, then ``Accept-Language``, then
English.

The demo video lives on YouTube; what the page serves itself is the poster
the player hides behind until someone presses play, so that nothing from
YouTube loads on a visit. The poster does not ship here: binary belongs to a
deployment, not to a library, so the deployment points
``Settings.static_dir`` at it. Without it the page still serves, with a
poster that finds nothing and a link to the video that still works, which is
the right degraded state for a redeployment that has not copied it yet.
"""

from __future__ import annotations

import re
from importlib import resources
from pathlib import Path

from starlette.requests import Request
from starlette.responses import FileResponse, HTMLResponse, PlainTextResponse, RedirectResponse

from openwind_api.routes.landing_copy import COPY, LANGUAGE_NAMES

# The assistants' official connector directories that list OhMyWind, one
# entry per directory, each filling the ``{{<name>_directory_url}}`` slot of
# the page. The URL lives here and nowhere else in the page: when another
# directory approves the connector, its listing is one line here, one block
# in the page and one ``<name>_cta`` line per language in ``landing_copy``.
DIRECTORY_URLS = {
    "claude": "https://claude.ai/directory/ohmywind",
}

# The languages of the web app, in the order the picker shows them. English
# is the fallback: a Dutch or Portuguese sailor is likelier to read it than
# French, which is the web app's reasoning too.
LANGUAGES = ("en", "fr", "de", "it", "es")
DEFAULT_LANGUAGE = "en"

# Where search engines find each language. Absolute, as hreflang requires,
# and always the public host: the dev Space must not advertise itself as an
# alternate of production. The picker itself uses relative links, so it
# works on every host.
PUBLIC_URL = "https://mcp.ohmywind.fr/"

_COPY_SLOT = re.compile(r"\{\{t:([a-z0-9_]+)\}\}")


def _check_parity() -> None:
    """Every language carries exactly the English keys, no more, no less."""
    if set(COPY) != set(LANGUAGES) or set(LANGUAGE_NAMES) != set(LANGUAGES):
        raise RuntimeError("landing_copy languages differ from LANGUAGES")
    reference = set(COPY[DEFAULT_LANGUAGE])
    for lang in LANGUAGES:
        keys = set(COPY[lang])
        missing, extra = sorted(reference - keys), sorted(keys - reference)
        if missing or extra:
            raise RuntimeError(
                f"landing_copy[{lang!r}] is out of step with English: "
                f"missing {missing}, extra {extra}"
            )


def _alternates() -> str:
    links = [
        f'  <link rel="alternate" hreflang="{lang}" href="{PUBLIC_URL}?lang={lang}">'
        for lang in LANGUAGES
    ]
    links.append(f'  <link rel="alternate" hreflang="x-default" href="{PUBLIC_URL}">')
    return "\n".join(links)


def _language_switcher(current: str) -> str:
    items = []
    for lang in LANGUAGES:
        name = LANGUAGE_NAMES[lang]
        if lang == current:
            items.append(f'<span lang="{lang}" aria-current="true">{name}</span>')
        else:
            items.append(f'<a href="?lang={lang}" hreflang="{lang}" lang="{lang}">{name}</a>')
    return '  <nav class="langs" aria-label="{{t:language_nav}}">' + "".join(items) + "</nav>"


def render_landing(template: str, lang: str = DEFAULT_LANGUAGE) -> str:
    """The landing page in ``lang``, with every slot filled.

    Fails at import rather than serving a page with a ``{{...}}`` in it: a
    slot without its entry is a typo, not a degraded state. So does a copy
    key the template never uses, which is a translation for nothing.
    """
    copy = COPY[lang]
    html = (
        template.replace("{{lang}}", lang)
        .replace("{{alternates}}", _alternates())
        .replace("{{language_switcher}}", _language_switcher(lang))
    )

    used: set[str] = set()

    def fill(match: re.Match[str]) -> str:
        key = match.group(1)
        if key not in copy:
            raise RuntimeError(f"landing.html has a {{{{t:{key}}}}} slot with no entry in COPY")
        used.add(key)
        return copy[key]

    html = _COPY_SLOT.sub(fill, html)
    # Only on a full page: a fragment (a test, a new block being tried out)
    # is not expected to use every key.
    if "<html" in template:
        unused = sorted(set(copy) - used)
        if unused:
            raise RuntimeError(f"landing_copy has keys landing.html never uses: {unused}")
    for name, url in DIRECTORY_URLS.items():
        html = html.replace("{{" + name + "_directory_url}}", url)
    if "{{" in html:
        raise RuntimeError("landing.html has a {{...}} slot with no entry in DIRECTORY_URLS")
    return html


_check_parity()
_TEMPLATE = (
    resources.files("openwind_api").joinpath("static/landing.html").read_text(encoding="utf-8")
)
# Rendered once per language at import, so a broken translation stops the
# deployment rather than one reader's page.
LANDING_PAGES = {lang: render_landing(_TEMPLATE, lang) for lang in LANGUAGES}
LANDING_HTML = LANDING_PAGES[DEFAULT_LANGUAGE]


def negotiate_language(accept_language: str | None) -> str:
    """The language to serve for an ``Accept-Language`` header.

    Highest quality first, the header's own order breaking ties; a regional
    tag counts for its language (``fr-CA`` is ``fr``), ``q=0`` means "not
    this one", and a malformed entry is skipped rather than failing the page.
    """
    ranked: list[tuple[float, int, str]] = []
    for position, entry in enumerate((accept_language or "").split(",")):
        tag, *params = (part.strip() for part in entry.split(";"))
        quality = 1.0
        for param in params:
            name, _, value = param.partition("=")
            if name.strip().lower() == "q":
                try:
                    quality = float(value)
                except ValueError:
                    quality = 0.0
        base = tag.lower().split("-")[0]
        if 0 < quality <= 1 and base in LANGUAGES:
            ranked.append((-quality, position, base))
    return min(ranked)[2] if ranked else DEFAULT_LANGUAGE


def pick_language(request: Request) -> str:
    """``?lang=xx`` when it names a language we serve, else the header."""
    asked = request.query_params.get("lang", "").lower().split("-")[0]
    if asked in LANGUAGES:
        return asked
    return negotiate_language(request.headers.get("accept-language"))


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


async def index(request: Request) -> HTMLResponse:
    lang = pick_language(request)
    # ``Vary`` because the same URL answers in five languages: a browser or
    # a cache that honours it keys on the header too. Cloudflare's edge cache
    # does not, which is why the Worker in packages/edge-proxy must never put
    # ``/`` among its CACHEABLE_PATHS.
    return HTMLResponse(
        LANDING_PAGES[lang],
        headers={"Vary": "Accept-Language", "Content-Language": lang},
    )


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
