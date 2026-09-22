# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Tests for the tidal-gap lookup and the notice the engine raises from it."""

from __future__ import annotations

import numpy as np

from openwind_data.currents import tidal_gaps
from openwind_data.currents.tidal_gaps import _in_polygon, tidal_gap_at


def test_dataset_loads_with_passes_and_at_least_one_mask() -> None:
    gaps = tidal_gaps._load()
    assert len(gaps.passes) >= 20
    assert len(gaps.rings) >= 1
    assert all(p.name for p in gaps.passes)


def test_ray_casting_honours_holes() -> None:
    outer = np.array([[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], dtype=float)
    hole = np.array([[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]], dtype=float)
    assert _in_polygon(0.5, 0.5, outer, (hole,))
    assert not _in_polygon(2.0, 2.0, outer, (hole,))
    assert not _in_polygon(5.0, 5.0, outer, (hole,))


def test_known_passes_are_hits_and_open_water_is_not() -> None:
    # Cuxhaven roads: the Elbe entry, a gap while no German atlas is served.
    hit = tidal_gap_at(53.87, 8.70)
    assert hit is not None and hit.kind == "pass"
    assert "Elbe" in hit.zone or "Cuxhaven" in hit.zone
    assert hit.distance_km < 15
    # Pentland Firth: a famous race, only a 2 km atlas at best.
    hit = tidal_gap_at(58.70, -3.15)
    assert hit is not None and "Pentland" in hit.zone
    # Mid Bay of Biscay: nothing.
    assert tidal_gap_at(46.0, -5.0) is None
    # Mediterranean open water: nothing.
    assert tidal_gap_at(42.5, 5.5) is None


def test_pass_radius_is_a_parameter() -> None:
    assert (
        tidal_gap_at(53.87, 8.70, pass_radius_km=0.1) is None
        or tidal_gap_at(53.87, 8.70, pass_radius_km=0.1).kind == "mask"
    )


def _with_passes(monkeypatch, passes: tuple[tidal_gaps._Pass, ...]) -> None:
    gaps = tidal_gaps._Gaps(
        rings=(),
        passes=passes,
        pass_lat=np.array([p.lat for p in passes], dtype=float),
        pass_lon=np.array([p.lon for p in passes], dtype=float),
    )
    monkeypatch.setattr(tidal_gaps, "_load", lambda: gaps)


def test_unresolved_pass_names_only_the_blind_source(monkeypatch) -> None:
    # Saltstraumen as the builder would list it once NorKyst is served: the
    # 800 m grid has no cell in the 150 m channel, a 160 m nest would.
    _with_passes(
        monkeypatch,
        (
            tidal_gaps._Pass(
                "Saltstraumen", 67.2281, 14.6164, 8.0, frozenset({"norkyst_lofoten_800m"})
            ),
        ),
    )
    hit = tidal_gaps.unresolved_pass_at(67.2303, 14.6164, "norkyst_lofoten_800m")
    assert hit is not None and hit.zone == "Saltstraumen" and hit.max_spring_kt == 8.0
    assert hit.distance_km < 0.5
    assert tidal_gaps.unresolved_pass_at(67.2303, 14.6164, "norkyst_lofoten_160m") is None
    assert tidal_gaps.unresolved_pass_at(67.2303, 14.6164, None) is None
    # 3 km is the blind spot; the approach 5 km out reads the atlas as it is.
    assert tidal_gaps.unresolved_pass_at(67.27, 14.6164, "norkyst_lofoten_800m") is None
    assert (
        tidal_gaps.unresolved_pass_at(67.27, 14.6164, "norkyst_lofoten_800m", radius_km=6)
        is not None
    )


def test_unresolved_pass_walks_past_a_resolved_nearer_pass(monkeypatch) -> None:
    # Two passes within the radius: the nearer one is fine for the source,
    # the farther one is not; the farther one still answers.
    _with_passes(
        monkeypatch,
        (
            tidal_gaps._Pass("Near, resolved", 50.0, 0.0, 3.0, frozenset()),
            tidal_gaps._Pass("Far, blind", 50.02, 0.0, 6.0, frozenset({"bsh_x_926m"})),
        ),
    )
    hit = tidal_gaps.unresolved_pass_at(50.001, 0.0, "bsh_x_926m")
    assert hit is not None and hit.zone == "Far, blind"


def test_snapshot_lists_the_blind_atlases_by_label() -> None:
    # Measured by the map builder against the built atlases: NorKyst 800 m
    # has no cell in Saltstraumen's 150 m channel; MARC MANGA 700 m reads
    # 0.15 kt at the Lundy race on the edge of its domain. The Fromveur and
    # the Chenal du Four, which FINIS 250 m sees at 7.8 and 3.7 kt, stay
    # out of the snapshot altogether (a fine source covers them).
    by_name = {p.name: p for p in tidal_gaps._load().passes}
    assert "norkyst_lofoten_800m" in by_name["Saltstraumen"].unresolved_by
    assert "marc_manga_700m" in by_name["Lundy race"].unresolved_by
    assert "Passage du Fromveur" not in by_name
    assert "Chenal du Four" not in by_name
    for p in by_name.values():
        for label in p.unresolved_by:
            assert label.endswith("m") and label.rsplit("_", 1)[-1][:-1].isdigit(), (p.name, label)


def test_unresolved_pass_along_a_leg_measures_the_closest_point(monkeypatch) -> None:
    _with_passes(
        monkeypatch,
        (
            tidal_gaps._Pass(
                "Saltstraumen", 67.2281, 14.6164, 8.0, frozenset({"norkyst_lofoten_800m"})
            ),
        ),
    )
    # A leg passing 1 km north of the channel, midpoint 12 km east of it.
    hit = tidal_gaps.unresolved_pass_along(67.237, 14.40, 67.237, 15.10, "norkyst_lofoten_800m")
    assert hit is not None and hit.distance_km < 1.5
    assert tidal_gaps.unresolved_pass_at(67.237, 14.75, "norkyst_lofoten_800m") is None
    # The same leg shifted 5 km north never comes close.
    assert (
        tidal_gaps.unresolved_pass_along(67.275, 14.40, 67.275, 15.10, "norkyst_lofoten_800m")
        is None
    )
    # A leg ending short of the pass is measured from its end, not its extension.
    assert (
        tidal_gaps.unresolved_pass_along(67.2281, 14.0, 67.2281, 14.50, "norkyst_lofoten_800m")
        is None
    )
    assert (
        tidal_gaps.unresolved_pass_along(67.2281, 14.0, 67.2281, 14.58, "norkyst_lofoten_800m")
        is not None
    )
