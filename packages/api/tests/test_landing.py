# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The landing page sends Claude users to the directory listing first."""

from __future__ import annotations

import pytest

from openwind_api.routes.landing import DIRECTORY_URLS, LANDING_HTML, render_landing


def test_claude_section_opens_on_the_directory_listing() -> None:
    url = DIRECTORY_URLS["claude"]
    assert url == "https://claude.ai/directory/ohmywind"
    claude = LANDING_HTML[LANDING_HTML.index("<summary>Claude") :]
    claude = claude[: claude.index("</details>")]
    assert f'href="{url}"' in claude
    assert "Add to Claude" in claude
    # The button first, the manual steps underneath.
    assert claude.index("Add to Claude") < claude.index("Or add it manually")
    assert claude.index("Or add it manually") < claude.index("Add custom connector")


def test_the_url_lives_in_one_place() -> None:
    assert "{{" not in LANDING_HTML
    assert LANDING_HTML.count(DIRECTORY_URLS["claude"]) == 1


def test_a_slot_without_its_entry_fails_loudly() -> None:
    with pytest.raises(RuntimeError, match="DIRECTORY_URLS"):
        render_landing('<a href="{{chatgpt_directory_url}}">Add to ChatGPT</a>')
