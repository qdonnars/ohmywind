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
    MCP_URL,
    PAGES,
    PUBLIC_URL,
    QUESTIONS,
    negotiate_language,
    render_landing,
)
from openwind_api.routes.landing_copy import COPY, LINKS

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
    "questions_label",
    "send_label",
    "copied",
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
    """What a reader sees: no styles, no script, no comments, no tags."""
    html = re.sub(r"<(style|script)\b.*?</\1>|<!--.*?-->", " ", html, flags=re.S)
    return re.sub(r"<[^>]+>", " ", html)


def _between(html: str, start: str, end: str) -> str:
    """The stretch of ``html`` from ``start`` to the first ``end`` after it."""
    head = html[html.index(start) :]
    return head[: head.index(end) + len(end)]


def _devs(html: str) -> str:
    return _between(html, '<details class="devs"', "</details>")


def _vibe_steps(html: str) -> str:
    return _between(html, '<section id="vibe"', "</section>")


def _opening(html: str, tag: str, attrs: str) -> str:
    """The opening tag ``<tag ... attrs...>``: attrs is where it starts."""
    match = re.search(rf"<{tag} {re.escape(attrs)}[^>]*>", html)
    assert match, attrs
    return match.group(0)


def _sections(html: str) -> list[str]:
    """The ids of the page's titled sections, top to bottom."""
    return re.findall(r'<h2 id="([a-z]+)">', html)


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
    steps = _vibe_steps(page)
    assert page.index('<div class="assistants">') < page.index('<section id="vibe"')
    assert copy["vibe_step_menu"] in steps
    assert MCP_URL in steps
    # Vibe goes by its new name everywhere; Le Chat only ever appears as
    # what it was called before.
    assert "Le Chat" not in page.replace("Le Chat)", "").replace("Le Chat de", "").replace(
        "Le Chat von", ""
    ).replace("Le Chat di", "").replace("Le Chat&rsquo;s", "")


@pytest.mark.parametrize("lang", LANGUAGES)
def test_the_three_buttons_in_order_each_with_its_mark(lang: str) -> None:
    page = LANDING_PAGES[lang]
    row = page[page.index('<div class="assistants">') :]
    row = row[: row.index("</div>")]
    assert re.findall(r"</svg>([A-Za-z]+)</a>", row) == ["Claude", "Vibe", "ChatGPT"]
    assert row.count("<svg") == 3


@pytest.mark.parametrize("lang", LANGUAGES)
def test_another_assistant_gets_the_server_address_in_the_developer_block(lang: str) -> None:
    devs = _devs(LANDING_PAGES[lang])
    after = devs[devs.index(COPY[lang]["devs_address"]) :]
    assert f'<code id="mcp-url">{MCP_URL}</code>' in after
    assert after.index(MCP_URL) < after.index(COPY[lang]["devs_other"])


@pytest.mark.parametrize("lang", LANGUAGES)
def test_the_url_lives_in_one_place(lang: str) -> None:
    page = LANDING_PAGES[lang]
    assert "{{" not in page
    for url in DIRECTORY_URLS.values():
        assert page.count(url) == 1
    # The server address: in the developer block, and in Vibe's steps
    # because Vibe needs it pasted. Nowhere else.
    rest = page.replace(_devs(page), "").replace(_vibe_steps(page), "")
    assert MCP_URL not in rest
    assert page.count(MCP_URL) == 2


def test_a_slot_without_its_entry_fails_loudly() -> None:
    with pytest.raises(RuntimeError, match="DIRECTORY_URLS"):
        render_landing('<a href="{{gemini_directory_url}}">Add to Gemini</a>')
    with pytest.raises(RuntimeError, match="LINKS"):
        render_landing('<a href="{{url:discord}}">Discord</a>')


# ── The page, for sailors first ──────────────────────────────────────────────


def test_the_sections_in_order() -> None:
    # The top of the page (the three questions) comes first, untitled
    # beyond its h1.
    assert LANDING_HTML.index("<h1>") < LANDING_HTML.index('<div class="ask">')
    assert LANDING_HTML.index('<div class="ask">') < LANDING_HTML.index("<h2")
    assert _sections(LANDING_HTML) == ["video", "why", "skipper", "noassist", "faq"]
    # Then the developer block, then the footer.
    assert LANDING_HTML.index('id="faq"') < LANDING_HTML.index('<details class="devs"')
    assert LANDING_HTML.index("</details>") < LANDING_HTML.index('<footer class="foot">')


@pytest.mark.parametrize("lang", LANGUAGES)
def test_the_developer_block_is_folded(lang: str) -> None:
    page = LANDING_PAGES[lang]
    markup = re.sub(r"<(style|script)\b.*?</\1>|<!--.*?-->", "", page, flags=re.S)
    openings = re.findall(r"<details\b[^>]*>", markup)
    assert len(openings) == 1
    opening = openings[0]
    assert " open" not in opening
    assert "<summary>" in _devs(page)


@pytest.mark.parametrize("lang", LANGUAGES)
def test_no_tool_names_or_protocol_jargon_above_the_developer_block(lang: str) -> None:
    page = LANDING_PAGES[lang]
    rest = page.replace(_devs(page), "")
    for jargon in ("plan_passage", "MCP Apps", "MCP-Apps", "LLM", "AROME", "iframe"):
        assert jargon not in _text(rest), jargon


@pytest.mark.parametrize("lang", LANGUAGES)
def test_the_methodology_is_linked_twice(lang: str) -> None:
    # Once where the page says the calculations are public, once in the FAQ
    # answer on reliability; plus the footer.
    page = LANDING_PAGES[lang]
    href = f'href="{LINKS["methodology"]}"'
    assert page.count(href) == 3
    for key in ("skipper_2_body", "faq_reliable_a"):
        assert href in COPY[lang][key], key


@pytest.mark.parametrize("lang", LANGUAGES)
def test_the_page_links_the_app_youtube_and_github(lang: str) -> None:
    hrefs = _hrefs(LANDING_PAGES[lang])
    for name in ("app", "methodology", "youtube", "github"):
        assert hrefs[LINKS[name]] >= 1, name


@pytest.mark.parametrize("lang", LANGUAGES)
def test_copy_buttons_carry_their_target_and_their_feedback(lang: str) -> None:
    page, copy = LANDING_PAGES[lang], COPY[lang]
    buttons = re.findall(r'<button class="copy"[^>]*>[^<]*</button>', page)
    assert len(buttons) == 1
    for button in buttons:
        target = re.search(r'data-copy="([a-z0-9-]+)"', button).group(1)
        assert f'id="{target}"' in page
        assert f'data-copied="{copy["copied"]}"' in button


# ── The three questions at the top ───────────────────────────────────────────


@pytest.mark.parametrize("lang", LANGUAGES)
def test_three_questions_in_every_language(lang: str) -> None:
    page, copy = LANDING_PAGES[lang], COPY[lang]
    chips = re.findall(r'<a class="chip" href="([^"]*)" data-chip="(\d)"[^>]*>([^<]*)</a>', page)
    assert [(href, n) for href, n, _ in chips] == [
        (f"?lang={lang}&amp;q={n}", str(n)) for n in QUESTIONS
    ]
    assert [label for *_, label in chips] == [copy[f"q{n}_chip"] for n in QUESTIONS]
    for n in QUESTIONS:
        # The question, read whole by a screen reader, and its answer.
        assert f'<span class="sr-only">{copy[f"q{n}"]}</span>' in page
        assert copy[f"q{n}_answer"] in page
    # The answer is announced when it changes.
    assert '<div class="replies" aria-live="polite">' in page


@pytest.mark.parametrize("lang", LANGUAGES)
@pytest.mark.parametrize("question", QUESTIONS)
def test_the_question_asked_for_is_the_one_shown(lang: str, question: int) -> None:
    page = PAGES[lang, question]
    assert f'<div class="hero" id="hero" data-q="{question}">' in page
    for n in QUESTIONS:
        hidden = n != question
        for tag, attrs in (
            ("div", f'class="reply" data-for="{n}"'),
            ("p", f'class="ask-text" data-for="{n}"'),
        ):
            assert (" hidden" in _opening(page, tag, attrs)) is hidden, (tag, n)
        chip = _opening(page, "a", f'class="chip" href="?lang={lang}&amp;q={n}"')
        assert ('aria-current="true"' in chip) is not hidden, n


@pytest.mark.parametrize("lang", LANGUAGES)
def test_the_language_picker_keeps_the_question(lang: str) -> None:
    picker = PAGES[lang, 2][PAGES[lang, 2].index('<nav class="langs"') :]
    picker = picker[: picker.index("</nav>")]
    assert picker.count("&amp;q=2") == len(LANGUAGES) - 1
    first = LANDING_PAGES[lang][LANDING_PAGES[lang].index('<nav class="langs"') :]
    assert "q=" not in first[: first.index("</nav>")]


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


@pytest.mark.parametrize(
    ("lang", "familiar"),
    [
        ("fr", r"\b(tu|toi|ton|ta|tes)\b"),
        ("de", r"\b(du|dich|dir|dein|deine|deinen|deinem|deiner)\b"),
        ("es", r"\b(tú|tu|tus|te|ti|contigo)\b"),
    ],
)
def test_the_formal_register(lang: str, familiar: str) -> None:
    # Place names keep their own words (the Chenal du Four).
    text = _text(LANDING_PAGES[lang]).replace("Chenal du Four", "").lower()
    assert not re.findall(familiar, text)


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


@pytest.mark.parametrize(
    ("query", "expected"),
    [("", 1), ("?q=1", 1), ("?q=2", 2), ("?lang=fr&q=3", 3), ("?q=4", 1), ("?q=x", 1)],
)
def test_the_question_served_without_script(client, query: str, expected: int) -> None:
    # The chips are links: with no script, ?q= is what shows a question.
    response = client.get(f"/{query}", headers={"Accept-Language": "fr"})
    assert response.text == PAGES["fr", expected]


def test_vary_survives_the_middleware_stack(client) -> None:
    # Compression and CORS add their own Vary entries; ours must still be
    # there once they have, or a browser cache would mix languages.
    response = client.get(
        "/", headers={"Accept-Language": "fr", "Accept-Encoding": "gzip", "Origin": "https://x.y"}
    )
    vary = {v.strip().lower() for v in response.headers["vary"].split(",")}
    assert "accept-language" in vary
