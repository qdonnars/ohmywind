# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The landing page: five languages kept in step, and the right one served.

What the import already refuses (a missing key, a stray key, a leftover slot)
is pinned here too, so that the refusal itself cannot quietly go away.
"""

from __future__ import annotations

import re
from collections import Counter

import pytest
from starlette.testclient import TestClient

from openwind_api import Settings, create_app
from openwind_api.routes import landing
from openwind_api.routes.landing import (
    DIRECTORY_URLS,
    LANDING_HTML,
    LANDING_PAGES,
    LANGUAGES,
    PUBLIC_URL,
    negotiate_language,
    render_landing,
)
from openwind_api.routes.landing_copy import COPY

# Keys whose value lands inside an HTML attribute or a JS string literal.
ATTRIBUTE_KEYS = (
    "title",
    "meta_description",
    "og_description",
    "language_nav",
    "video_label",
    "video_alt",
    "video_frame_title",
)

# Inline markup a translation may legitimately add or drop (a quoted English
# label is a <strong>). Everything else is page structure and must match.
INLINE_TAGS = {"a", "strong", "code", "span", "br"}


def _section(html: str, summary: str) -> str:
    section = html[html.index(f"<summary>{summary}") :]
    return section[: section.index("</details>")]


def _skeleton(html: str) -> list[str]:
    tags = re.findall(r"<(/?[a-z][a-z0-9]*)", html)
    return [tag for tag in tags if tag.lstrip("/") not in INLINE_TAGS]


def _hrefs(html: str) -> Counter[str]:
    # The picker links to the four other languages, which differ by design.
    return Counter(h for h in re.findall(r'href="([^"]*)"', html) if not h.startswith("?lang="))


def _text(html: str) -> str:
    return re.sub(r"<[^>]+>", " ", html)


# ── The Claude directory, in every language ─────────────────────────────────


@pytest.mark.parametrize("lang", LANGUAGES)
def test_claude_section_opens_on_the_directory_listing(lang: str) -> None:
    url = DIRECTORY_URLS["claude"]
    assert url == "https://claude.ai/directory/ohmywind"
    copy = COPY[lang]
    claude = _section(LANDING_PAGES[lang], "Claude")
    assert f'href="{url}"' in claude
    assert copy["claude_cta"] in claude
    # The button first, the manual steps underneath.
    assert claude.index(copy["claude_cta"]) < claude.index(copy["manual"])
    assert claude.index(copy["manual"]) < claude.index(copy["claude_step_add"])


def test_the_english_page_keeps_its_reference_wording() -> None:
    claude = _section(LANDING_HTML, "Claude")
    assert "Add to Claude" in claude
    assert claude.index("Add to Claude") < claude.index("Or add it manually")
    assert claude.index("Or add it manually") < claude.index("Add custom connector")


@pytest.mark.parametrize("lang", LANGUAGES)
def test_the_url_lives_in_one_place(lang: str) -> None:
    assert "{{" not in LANDING_PAGES[lang]
    assert LANDING_PAGES[lang].count(DIRECTORY_URLS["claude"]) == 1


def test_a_slot_without_its_entry_fails_loudly() -> None:
    with pytest.raises(RuntimeError, match="DIRECTORY_URLS"):
        render_landing('<a href="{{chatgpt_directory_url}}">Add to ChatGPT</a>')


# ── Parity: what a translation cannot get wrong ─────────────────────────────


def test_every_language_has_the_english_keys() -> None:
    for lang in LANGUAGES:
        assert set(COPY[lang]) == set(COPY["en"]), lang


@pytest.mark.parametrize("lang", LANGUAGES[1:])
def test_same_sections_in_every_language(lang: str) -> None:
    assert _skeleton(LANDING_PAGES[lang]) == _skeleton(LANDING_HTML)


@pytest.mark.parametrize("lang", LANGUAGES[1:])
def test_same_links_in_every_language(lang: str) -> None:
    assert _hrefs(LANDING_PAGES[lang]) == _hrefs(LANDING_HTML)


def test_a_missing_translation_stops_the_import(monkeypatch: pytest.MonkeyPatch) -> None:
    broken = dict(COPY["de"])
    del broken["claude_cta"]
    monkeypatch.setitem(COPY, "de", broken)
    with pytest.raises(RuntimeError, match=r"missing \['claude_cta'\]"):
        landing._check_parity()


def test_a_stray_translation_stops_the_import(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(COPY, "it", {**COPY["it"], "chatgpt_cta": "Aggiungi a ChatGPT"})
    with pytest.raises(RuntimeError, match=r"extra \['chatgpt_cta'\]"):
        landing._check_parity()


def test_a_key_the_page_never_uses_stops_the_import(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(COPY, "en", {**COPY["en"], "orphan": "Nobody reads this"})
    with pytest.raises(RuntimeError, match="orphan"):
        render_landing(landing._TEMPLATE, "en")


def test_a_slot_without_its_copy_stops_the_import() -> None:
    with pytest.raises(RuntimeError, match="COPY"):
        render_landing("<p>{{t:no_such_key}}</p>", "fr")


# ── Language markup ──────────────────────────────────────────────────────────


@pytest.mark.parametrize("lang", LANGUAGES)
def test_each_page_says_its_language_and_lists_the_others(lang: str) -> None:
    html = LANDING_PAGES[lang]
    assert f'<html lang="{lang}">' in html
    for other in LANGUAGES:
        assert f'hreflang="{other}" href="{PUBLIC_URL}?lang={other}"' in html
    assert f'hreflang="x-default" href="{PUBLIC_URL}"' in html
    # The picker: every other language is a link, the current one is not.
    picker = html[html.index('<nav class="langs"') : html.index("</nav>")]
    assert f'href="?lang={lang}"' not in picker
    assert 'aria-current="true"' in picker
    assert picker.count('href="?lang=') == len(LANGUAGES) - 1


# ── Copy rules ───────────────────────────────────────────────────────────────


@pytest.mark.parametrize("lang", LANGUAGES)
def test_no_em_dash(lang: str) -> None:
    assert "—" not in LANDING_PAGES[lang]


@pytest.mark.parametrize("lang", LANGUAGES)
def test_attribute_values_cannot_break_out(lang: str) -> None:
    for key in ATTRIBUTE_KEYS:
        assert '"' not in COPY[lang][key], key
        assert "<" not in COPY[lang][key], key


def test_french_says_vous() -> None:
    text = _text(LANDING_PAGES["fr"]).lower()
    assert not re.findall(r"\b(tu|toi|ton|ta|tes)\b", text)


@pytest.mark.parametrize("lang", LANGUAGES)
def test_says_it_is_open_source(lang: str) -> None:
    assert "open source" in _text(LANDING_PAGES[lang]).lower().replace("-", " ")


# ── Negotiation ──────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("header", "expected"),
    [
        (None, "en"),
        ("", "en"),
        ("fr-FR,fr;q=0.9,en;q=0.8", "fr"),
        ("de-AT", "de"),
        ("pt-BR,pt;q=0.9", "en"),
        ("pt-BR,pt;q=0.9,es;q=0.4", "es"),
        ("en;q=0.5, it;q=0.8", "it"),
        ("fr;q=0, es", "es"),
        ("fr;q=0.5, de;q=0.5", "fr"),
        ("*", "en"),
        ("fr;q=abc, it;q=0.1", "it"),
        ("fr;q=7, de", "de"),
        ("FR-ca", "fr"),
        (";;,", "en"),
    ],
)
def test_negotiate_language(header: str | None, expected: str) -> None:
    assert negotiate_language(header) == expected


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app(Settings())) as client:
        yield client


@pytest.mark.parametrize(
    ("query", "header", "expected"),
    [
        ("", None, "en"),
        ("", "es-ES,es;q=0.9", "es"),
        ("?lang=de", "fr-FR", "de"),
        ("?lang=IT", None, "it"),
        ("?lang=fr-CA", None, "fr"),
        ("?lang=pt", "it", "it"),
        ("?lang=pt", None, "en"),
        ("?lang=", "de", "de"),
    ],
)
def test_the_page_served(client, query: str, header: str | None, expected: str) -> None:
    headers = {"Accept-Language": header} if header is not None else {}
    response = client.get(f"/{query}", headers=headers)
    assert response.status_code == 200
    assert response.text == LANDING_PAGES[expected]
    assert response.headers["content-language"] == expected
    assert "accept-language" in response.headers["vary"].lower()


def test_vary_survives_the_middleware_stack(client) -> None:
    # Compression and CORS add their own Vary entries; ours must still be
    # there once they have, or a browser cache would mix languages.
    response = client.get(
        "/", headers={"Accept-Language": "fr", "Accept-Encoding": "gzip", "Origin": "https://x.y"}
    )
    vary = {v.strip().lower() for v in response.headers["vary"].split(",")}
    assert "accept-language" in vary
