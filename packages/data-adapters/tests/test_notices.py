# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The coded warnings: one template per code, rendered once, in French."""

import re

import pytest

from openwind_data.routing.notices import FR_TEMPLATES, notice

PLACEHOLDER = re.compile(r"\{(\w+)\}")


class TestNotice:
    def test_renders_the_french_sentence_and_keeps_the_values(self) -> None:
        n = notice("passage.light_wind", min_speed_kn="2.6")
        assert n.code == "passage.light_wind"
        assert n.params == {"min_speed_kn": "2.6"}
        assert n.message == "vent faible : vitesse mini 2.6 kn, passage très lent"

    def test_a_code_without_a_template_is_a_bug_not_a_condition(self) -> None:
        with pytest.raises(KeyError):
            notice("passage.something_new", x=1)

    def test_every_template_renders_from_its_own_placeholders(self) -> None:
        # A template whose placeholders and call site disagree would raise
        # only on the sailing that triggers it; render each once here.
        for code, template in FR_TEMPLATES.items():
            names = PLACEHOLDER.findall(template)
            assert names, code
            n = notice(code, **{name: "x" for name in names})
            assert "{" not in n.message, code

    def test_the_wind_and_sea_bands_carry_their_level_in_the_code(self) -> None:
        # The label is a word to translate, so the web keys on the level.
        assert {c for c in FR_TEMPLATES if c.startswith("complexity.wind.")} == {
            "complexity.wind.3",
            "complexity.wind.4",
            "complexity.wind.5",
        }
        assert {c for c in FR_TEMPLATES if c.startswith("complexity.sea.")} == {
            "complexity.sea.3",
            "complexity.sea.4",
            "complexity.sea.5",
        }
