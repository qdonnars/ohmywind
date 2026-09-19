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


def test_high_confidence_on_atlases_at_one_km_or_finer() -> None:
    # An atlas label ends with its resolution. At 1 km or finer the grid
    # resolves a race or an estuary mouth, whatever the source.
    assert confidence_for_point(48.32, -4.62, "marc_finis_250m") == "high"
    assert confidence_for_point(49.5, -1.0, "marc_manga_700m") == "high"
    assert confidence_for_point(53.88, 8.7, "bsh_cuxbru_90m") == "high"
    assert confidence_for_point(54.1, 8.0, "bsh_idb_926m") == "high"


def test_medium_confidence_on_coarse_atlases() -> None:
    # A 2 km cell says "there is tide here" and no more: the Elbe report
    # (0.1 kt predicted against 2 to 3 kt observed) is what a "high" tag on
    # ATLNE used to hide.
    assert confidence_for_point(46.5, -3.0, "marc_atlne_2000m") == "medium"
    assert confidence_for_point(46.5, -3.0, "fes_global_7000m") == "medium"


def test_medium_confidence_on_smoc() -> None:
    # Open-Meteo SMOC at 8 km is fine for open water but blunt near coast.
    assert confidence_for_point(45.0, -3.0, "openmeteo_smoc") == "medium"


def test_no_confidence_when_no_source() -> None:
    assert confidence_for_point(47.0, -3.0, None) is None


def test_unknown_source_treated_conservatively() -> None:
    # An unknown source should not silently get "high".
    assert confidence_for_point(45.0, -3.0, "future_adapter_v1") == "medium"
