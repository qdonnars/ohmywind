# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

from __future__ import annotations

import json
from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def forecast_marseille_arome() -> dict:
    return json.loads((FIXTURES / "forecast_marseille_arome.json").read_text())


@pytest.fixture
def marine_porquerolles() -> dict:
    return json.loads((FIXTURES / "marine_porquerolles.json").read_text())
