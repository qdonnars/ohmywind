# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Tests for source-based current confidence labelling."""

from __future__ import annotations

from openwind_data.currents.narrow_pass import confidence_for_point


def test_high_confidence_on_shom_c2d() -> None:
    # SHOM is the French navigation reference; once the C2D adapter is wired
    # the source label will start with ``shom_c2d_``. Anywhere it covers,
    # confidence is high.
    assert confidence_for_point(47.55, -2.92, "shom_c2d_558_morbihan") == "high"


def test_high_confidence_on_marc() -> None:
    # MARC PREVIMER atlases are a regular harmonic grid (250 m to 2 km
    # depending on zone). Anywhere they cover, confidence is high.
    assert confidence_for_point(48.32, -4.62, "marc_finis_250m") == "high"
    assert confidence_for_point(46.5, -3.0, "marc_atlne_2km") == "high"


def test_medium_confidence_on_smoc() -> None:
    # Open-Meteo SMOC at 8 km is fine for open water but blunt near coast.
    assert confidence_for_point(45.0, -3.0, "openmeteo_smoc") == "medium"


def test_no_confidence_when_no_source() -> None:
    assert confidence_for_point(47.0, -3.0, None) is None


def test_unknown_source_treated_conservatively() -> None:
    # An unknown source should not silently get "high".
    assert confidence_for_point(45.0, -3.0, "future_adapter_v1") == "medium"
