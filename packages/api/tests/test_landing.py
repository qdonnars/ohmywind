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
    "claude_cta",
    "vibe_cta",
    "chatgpt_cta",
)

# Inline markup a translation may legitimately add or drop (a quoted English
# label is a <strong>). Everything else is page structure and must match.
INLINE_TAGS = {"a", "strong", "code", "span", "br"}


def _button(html: str, name: str) -> str:
    """The opening tag of the assistant button that reads ``name``."""
    match = re.search(
        rf'<a class="assistant"[^>]*>(?=<svg[^>]*><path[^>]*/></svg>{name}</a>)', html
    )
    assert match, name
    return match.group(0)


def _skeleton(html: str) -> list[str]:
    tags = re.findall(r"<(/?[a-z][a-z0-9]*)", html)
    return [tag for tag in tags if tag.lstrip("/") not in INLINE_TAGS]


def _hrefs(html: str) -> Counter[str]:
    # The picker links to the four other languages, which differ by design.
    return Counter(h for h in re.findall(r'href="([^"]*)"', html) if not h.startswith("?lang="))


def _text(html: str) -> str:
    return re.sub(r"<[^>]+>", " ", html)


# ── The three assistants, in every language ─────────────────────────────────


@pytest.mark.parametrize("lang", LANGUAGES)
def test_claude_and_chatgpt_open_on_their_directory_listing(lang: str) -> None:
    assert DIRECTORY_URLS == {
        "claude": "https://claude.ai/directory/ohmywind",
        "chatgpt": "https://chatgpt.com/plugins/ohmywind",
    }
    page, copy = LANDING_PAGES[lang], COPY[lang]
    for name, key in (("Claude", "claude"), ("ChatGPT", "chatgpt")):
        button = _button(page, name)
        assert f'href="{DIRECTORY_URLS[key]}"' in button
        assert 'target="_blank"' in button
        # The accessible name says what the button does and holds its label.
        assert f'aria-label="{copy[key + "_cta"]}"' in button
        assert name in copy[key + "_cta"]


@pytest.mark.parametrize("lang", LANGUAGES)
def test_vibe_unfolds_its_steps_under_the_buttons(lang: str) -> None:
    page, copy = LANDING_PAGES[lang], COPY[lang]
    button = _button(page, "Vibe")
    # A link to the steps, so they open without script; folded by default.
    assert 'href="#vibe"' in button
    assert 'aria-controls="vibe"' in button
    assert 'aria-expanded="false"' in button
    assert "Vibe" in copy["vibe_cta"]
    steps = page[page.index('<section id="vibe"') :]
    steps = steps[: steps.index("</section>")]
    assert page.index('<div class="assistants">') < page.index('<section id="vibe"')
    assert copy["vibe_step_menu"] in steps
    assert "https://mcp.ohmywind.fr/mcp" in steps
    assert "Le Chat" not in page


@pytest.mark.parametrize("lang", LANGUAGES)
def test_the_three_buttons_in_order_each_with_its_mark(lang: str) -> None:
    page = LANDING_PAGES[lang]
    row = page[page.index('<div class="assistants">') :]
    row = row[: row.index("</div>")]
    assert re.findall(r"</svg>([A-Za-z]+)</a>", row) == ["Claude", "Vibe", "ChatGPT"]
    assert row.count("<svg") == 3


@pytest.mark.parametrize("lang", LANGUAGES)
def test_another_assistant_gets_the_server_address(lang: str) -> None:
    page = LANDING_PAGES[lang]
    after = page[page.index(COPY[lang]["other_assistant"]) :]
    assert after.index("https://mcp.ohmywind.fr/mcp") < after.index("<h2>")


@pytest.mark.parametrize("lang", LANGUAGES)
def test_the_url_lives_in_one_place(lang: str) -> None:
    assert "{{" not in LANDING_PAGES[lang]
    for url in DIRECTORY_URLS.values():
        assert LANDING_PAGES[lang].count(url) == 1


def test_a_slot_without_its_entry_fails_loudly() -> None:
    with pytest.raises(RuntimeError, match="DIRECTORY_URLS"):
        render_landing('<a href="{{gemini_directory_url}}">Add to Gemini</a>')


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
    monkeypatch.setitem(COPY, "it", {**COPY["it"], "gemini_cta": "Aggiungi a Gemini"})
    with pytest.raises(RuntimeError, match=r"extra \['gemini_cta'\]"):
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
