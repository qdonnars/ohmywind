# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Tests for the SHOM Atlas C2D ASCII parser.

The real C2D distribution is large (~6 MB extracted) and held outside the
test tree under ``build/c2d/``. We use a small synthetic fixture for
roundtrip parsing checks, and an opt-in test (skipped if the real archive
is absent) that smoke-checks the live parse against the user-provided
``MORBIHAN_558`` file.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from openwind_data.currents.shom_c2d import (
    HOUR_OFFSETS,
    _parse_lat_lon_token,
    _split_packed_ints,
    parse_c2d_file,
)

_REPO_ROOT = Path(__file__).resolve().parents[3].parent


def test_parse_lat_lon_token_north_west() -> None:
    # 47°37.420'N → 47.62366...°
    assert _parse_lat_lon_token("4737.420") == pytest.approx(47.62366667, rel=1e-7)
    # -2°46.830'W → -2.7805°
    assert _parse_lat_lon_token("-246.830") == pytest.approx(-2.7805, rel=1e-6)


def test_parse_lat_lon_token_negative_minutes() -> None:
    # Sign applies to the whole token including degrees + minutes.
    assert _parse_lat_lon_token("-4609.500") == pytest.approx(-46.158333, rel=1e-6)


def test_split_packed_ints_handles_negatives_without_whitespace() -> None:
    # SHOM files pack negatives onto the previous field (e.g. "-22-10  0  4")
    # without leading whitespace, so a naive split() drops digits.
    line = "-22-10  0  4  7  7  6  0 -8-11-13-16-22"
    out = _split_packed_ints(line)
    assert out == [-22, -10, 0, 4, 7, 7, 6, 0, -8, -11, -13, -16, -22]


def test_split_packed_ints_pure_whitespace_separated() -> None:
    line = "  3  5  5  5  2 -2 -5 -5 -4 -2 -2 -2  2"
    out = _split_packed_ints(line)
    assert out == [3, 5, 5, 5, 2, -2, -5, -5, -4, -2, -2, -2, 2]


def test_parse_c2d_file_roundtrip(tmp_path: Path) -> None:
    """Build a tiny synthetic C2D file and parse it back."""
    content = (
        # Header: reference port = Calais, default PM (no .BM suffix).
        "Calais\n"
        # Point 1: 50°48.300'N, 1°33.083'E
        " 5048.300  133.083\n"
        # VE U values + V values, separated by '*' (13 each).
        "  3  5  5  5  2 -2 -5 -5 -4 -2 -2 -2  2 * -22-21-17 -8  8 20 23 22 16  7 -3-14-22\n"
        # ME U values + V values.
        "  2  3  3  2  1 -1 -2 -2 -2 -1 -1 -1  1 * -13-13-10 -4  5 10 12 11  8  3 -2 -7-12\n"
    )
    path = tmp_path / "TEST_557"
    path.write_text(content, encoding="latin-1")

    zone = parse_c2d_file(path, atlas_id=557)
    assert zone.atlas_id == 557
    assert zone.name == "TEST"
    assert zone.ref_port == "Calais"
    assert zone.ref_tide == "PM"
    assert len(zone.points) == 1

    p = zone.points[0]
    assert p.lat == pytest.approx(50.805, rel=1e-5)
    assert p.lon == pytest.approx(1.5513833, rel=1e-5)

    # 13 hour offsets stored as tenths of a knot.
    assert len(p.u_ve_kn) == len(HOUR_OFFSETS) == 13
    # Spot-check: file has u_ve[0] = 3 (raw) → 0.3 kt; v_ve[0] = -22 → -2.2 kt.
    assert p.u_ve_kn[0] == pytest.approx(0.3)
    assert p.v_ve_kn[0] == pytest.approx(-2.2)
    # ME mid-tide-cycle peak (index 5..6, around mid-flot at coef 45)
    assert p.v_me_kn[6] == pytest.approx(1.2)


def test_parse_c2d_file_handles_bm_reference(tmp_path: Path) -> None:
    content = (
        "La Rochelle.BM\n"
        " 4609.500 -114.600\n"
        " -1  1  0  0  1  2  0  0  1  0  0  0 -1 * -1 -5 -7 -9-13-12 -6  5 14 12  9  5  0\n"
        "  0  0  0  0  0  1  1  0  0  0  0  0  0 *  2  0 -2 -4 -4 -6 -7 -4  1  7  7  5  3\n"
    )
    path = tmp_path / "ROCHELLE_559"
    path.write_text(content, encoding="latin-1")
    zone = parse_c2d_file(path, atlas_id=559)
    assert zone.ref_port == "La Rochelle"
    assert zone.ref_tide == "BM"


def test_speed_kn_at_interpolates_between_coefs(tmp_path: Path) -> None:
    """At coef 45 we get ME, at coef 95 we get VE, and 70 is the midpoint."""
    content = (
        "Brest\n"
        " 4820.000 -440.000\n"
        # VE: U=10 (1 kt) at idx 0, V=0; ME: U=2 (0.2 kt) at idx 0, V=0.
        " 10 10 10 10 10 10 10 10 10 10 10 10 10 *  0  0  0  0  0  0  0  0  0  0  0  0  0\n"
        "  2  2  2  2  2  2  2  2  2  2  2  2  2 *  0  0  0  0  0  0  0  0  0  0  0  0  0\n"
    )
    path = tmp_path / "X_560"
    path.write_text(content, encoding="latin-1")
    p = parse_c2d_file(path, atlas_id=560).points[0]
    # At coef 45 → speed = ME = 0.2 kt
    assert p.speed_kn_at(0, 45) == pytest.approx(0.2, rel=1e-6)
    # At coef 95 → speed = VE = 1.0 kt
    assert p.speed_kn_at(0, 95) == pytest.approx(1.0, rel=1e-6)
    # At coef 70 → midpoint = 0.6 kt
    assert p.speed_kn_at(0, 70) == pytest.approx(0.6, rel=1e-6)


_LIVE_C2D = _REPO_ROOT / "build" / "c2d" / "C2D" / "CD_COURANTS2D" / "DONNEES"


@pytest.mark.skipif(
    not (_LIVE_C2D / "558" / "MORBIHAN_558").exists(),
    reason="live SHOM C2D archive not present (extract C2D.7z to build/c2d/)",
)
def test_live_morbihan_zone_parses_cleanly() -> None:
    """Smoke test against the user-provided live archive.

    Sanity-check the Morbihan zone: ~591 points (per SHOM lisezmoi), bbox
    covers the goulet, and coef-95 peaks match the ~3-5 kt range expected
    in the inner gulf (the actual goulet peak at Port-Navalo lies near the
    edge of this zone and the file's interpolated grid under-resolves it
    by design — this is the very reason narrow_pass is needed).
    """
    zone = parse_c2d_file(_LIVE_C2D / "558" / "MORBIHAN_558", atlas_id=558)
    assert zone.atlas_id == 558
    assert zone.name == "MORBIHAN"
    assert zone.ref_port.lower().startswith("port-navalo")
    assert zone.ref_tide == "PM"
    # Lisezmoi documents 591 points; allow a small slack for blank-line edges.
    assert 585 <= len(zone.points) <= 595
    lat_min, lon_min, lat_max, lon_max = zone.bbox
    # Documented bbox: 47°30.92'N - 47°38.5'N / 2°59'W - 2°42.2'W
    assert 47.50 < lat_min < 47.52
    assert 47.63 < lat_max < 47.65
    assert -2.99 < lon_min < -2.97
    assert -2.71 < lon_max < -2.69
