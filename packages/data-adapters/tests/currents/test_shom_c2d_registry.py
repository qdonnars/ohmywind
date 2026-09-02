# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Tests for the runtime SHOM Atlas C2D registry.

Builds a small synthetic registry on disk (one zone, a few points, one
reference port with realistic M2 constants), then exercises the loader,
the spatial coverage check, and the predictor end-to-end. A separate
opt-in test runs the full pipeline against the live archive when it's
present under ``build/shom_c2d/``.
"""

from __future__ import annotations

import json
import math
from datetime import UTC, datetime, timedelta
from pathlib import Path

import polars as pl
import pytest

from openwind_data.currents.shom_c2d_registry import ShomC2dRegistry

_REPO_ROOT = Path(__file__).resolve().parents[3].parent
_LIVE_DIR = _REPO_ROOT / "build" / "shom_c2d"


def _write_synthetic_registry(out: Path) -> None:
    """Build a tiny artefact pair: 4 points around (47.5, -2.9) anchored on Brest.

    The U/V series are constructed so that the predictor's output is
    deterministic and easy to assert: zero V at all hours, U_VE ramps
    from 0 at -6h to peak +1 kt at 0h to -1 kt at +6h (a simple sine),
    and U_ME is half the amplitude. With Brest's M2 constants the tide
    event is near 12:00 UTC for the chosen test date.
    """
    out.mkdir(parents=True, exist_ok=True)

    hours = list(range(-6, 7))
    u_ve = [math.sin(math.pi * h / 6.0) for h in hours]  # peak +1 at h=3
    v_ve = [0.0 for _ in hours]
    u_me = [0.5 * v for v in u_ve]
    v_me = [0.0 for _ in hours]

    rows = [
        {
            "atlas_id": 558,
            "zone": "TEST_ZONE",
            "ref_port_key": "BREST",
            "ref_tide": "PM",
            "lat": 47.50,
            "lon": -2.90,
            "u_ve_kn": u_ve,
            "v_ve_kn": v_ve,
            "u_me_kn": u_me,
            "v_me_kn": v_me,
        },
        {
            "atlas_id": 558,
            "zone": "TEST_ZONE",
            "ref_port_key": "BREST",
            "ref_tide": "PM",
            "lat": 47.51,
            "lon": -2.89,
            "u_ve_kn": u_ve,
            "v_ve_kn": v_ve,
            "u_me_kn": u_me,
            "v_me_kn": v_me,
        },
        {
            "atlas_id": 558,
            "zone": "TEST_ZONE",
            "ref_port_key": "BREST",
            "ref_tide": "PM",
            "lat": 47.49,
            "lon": -2.91,
            "u_ve_kn": u_ve,
            "v_ve_kn": v_ve,
            "u_me_kn": u_me,
            "v_me_kn": v_me,
        },
    ]
    df = pl.DataFrame(rows).with_columns(
        pl.col("atlas_id").cast(pl.Int16),
        pl.col("lat").cast(pl.Float32),
        pl.col("lon").cast(pl.Float32),
        pl.col("u_ve_kn").cast(pl.List(pl.Float32)),
        pl.col("v_ve_kn").cast(pl.List(pl.Float32)),
        pl.col("u_me_kn").cast(pl.List(pl.Float32)),
        pl.col("v_me_kn").cast(pl.List(pl.Float32)),
    )
    df.write_parquet(out / "shom_c2d_points.parquet")

    # Brest's M2 amplitude is ~2.0 m, phase ~150° (rough but enough for
    # the tide-event search to find a clean PM somewhere). The other
    # constituents are small so we ship just M2 — the predictor copes.
    ports = {
        "BREST": {
            "display_name": "Brest",
            "lat": 48.3833,
            "lon": -4.4956,
            "ref_tide": "PM",
            "constants": {
                "M2": [2.0, 150.0],
                "S2": [0.7, 200.0],
            },
        }
    }
    (out / "shom_c2d_ref_ports.json").write_text(json.dumps(ports, ensure_ascii=False))


def test_coverage_zones_is_empty_without_artefacts(tmp_path: Path) -> None:
    assert ShomC2dRegistry.from_directory(tmp_path).coverage_zones() == ()


def test_coverage_zones_reports_each_zone_once(tmp_path: Path) -> None:
    _write_synthetic_registry(tmp_path)
    zones = ShomC2dRegistry.from_directory(tmp_path).coverage_zones()
    assert [name for name, _ in zones] == ["TEST_ZONE"]
    lat_min, lon_min, lat_max, lon_max = zones[0][1]
    # The synthetic cloud spans 47.49..47.51 / -2.91..-2.89, padded outward.
    assert lat_min < 47.49 and lat_max > 47.51
    assert lon_min < -2.91 and lon_max > -2.89


def test_every_covered_point_falls_inside_a_zone_box(tmp_path: Path) -> None:
    """The invariant the coverage endpoint sells: outside the boxes, no data.

    A client that skips the round trip for points outside every box must not
    lose a single covered point. Sampled on a grid straddling the cloud, so
    it catches a box that is padded too little as well as one padded on the
    wrong axis.
    """
    _write_synthetic_registry(tmp_path)
    reg = ShomC2dRegistry.from_directory(tmp_path)
    boxes = [box for _, box in reg.coverage_zones()]

    def inside_any(lat: float, lon: float) -> bool:
        return any(
            lat_min <= lat <= lat_max and lon_min <= lon <= lon_max
            for lat_min, lon_min, lat_max, lon_max in boxes
        )

    for i in range(-20, 21):
        for j in range(-20, 21):
            lat = 47.50 + i * 0.01
            lon = -2.90 + j * 0.01
            if reg.covers(lat, lon):
                assert inside_any(lat, lon), (lat, lon)


def test_from_directory_returns_empty_when_artefacts_missing(tmp_path: Path) -> None:
    reg = ShomC2dRegistry.from_directory(tmp_path)  # nothing on disk
    assert reg.lats.size == 0
    assert reg.covers(47.5, -2.9) is False


def test_synthetic_registry_loads_and_covers(tmp_path: Path) -> None:
    _write_synthetic_registry(tmp_path)
    reg = ShomC2dRegistry.from_directory(tmp_path)
    assert reg.lats.size == 3
    assert "BREST" in reg.ref_ports

    # In the bbox + within the 5 km tolerance.
    assert reg.covers(47.50, -2.90) is True
    # Outside the bbox by far.
    assert reg.covers(43.0, 5.5) is False
    # Inside the bbox but no point within 5 km (we only seeded points
    # around (47.5, -2.9), so a query at (47.5, -2.5) is ~30 km away).
    assert reg.covers(47.50, -2.50) is False


def test_predict_returns_none_outside_coverage(tmp_path: Path) -> None:
    _write_synthetic_registry(tmp_path)
    reg = ShomC2dRegistry.from_directory(tmp_path)
    out = reg.predict_current_series(43.0, 5.5, [datetime(2026, 5, 15, 12, 0, tzinfo=UTC)])
    assert out is None


def test_predict_in_synthetic_zone_returns_finite_speeds(tmp_path: Path) -> None:
    _write_synthetic_registry(tmp_path)
    reg = ShomC2dRegistry.from_directory(tmp_path)

    t0 = datetime(2026, 5, 15, 0, 0, tzinfo=UTC)
    times = [t0 + timedelta(hours=h) for h in range(0, 24, 3)]
    out = reg.predict_current_series(47.50, -2.90, times)
    assert out is not None
    speeds, dirs, source = out
    assert source == "shom_c2d_558_test_zone"
    # All speeds finite, all directions in [0, 360).
    assert speeds.shape == (len(times),)
    assert dirs.shape == (len(times),)
    assert all(s >= 0.0 for s in speeds)
    assert all(0.0 <= d < 360.0 for d in dirs)
    # The synthetic series has |U| <= 1 kt and V == 0, so peak speed must
    # be at most 1 kt regardless of the tide-coefficient interpolation.
    assert max(speeds) <= 1.05  # tiny slack for float arithmetic


@pytest.mark.skipif(
    not (_LIVE_DIR / "shom_c2d_points.parquet").exists(),
    reason="live SHOM C2D artefacts not built (run scripts/build_shom_c2d.py)",
)
def test_live_registry_covers_morbihan_and_misses_open_atlantic() -> None:
    reg = ShomC2dRegistry.from_directory(_LIVE_DIR)
    assert reg.lats.size > 10_000  # documented ~13 290 points
    assert "PORT_NAVALO" in reg.ref_ports
    # Tascon area inside the goulet zoom — must be covered.
    assert reg.covers(47.5733, -2.8903) is True
    # Open Atlantic far west — must NOT be covered (SHOM C2D doesn't sample there).
    assert reg.covers(47.0, -6.0) is False
    # Mediterranean — never covered (SHOM publishes no C2D atlas south of Brittany).
    assert reg.covers(43.0, 5.5) is False


@pytest.mark.skipif(
    not (_LIVE_DIR / "shom_c2d_points.parquet").exists(),
    reason="live SHOM C2D artefacts not built (run scripts/build_shom_c2d.py)",
)
def test_live_predict_at_tascon_returns_realistic_peak() -> None:
    """The Tascon area peak in SHOM is documented around 7 kt at vives-eaux.

    With our coefficient interpolation between mortes-eaux 45 and
    vives-eaux 95, the predicted peak across a 24 h window in May should
    fall in a plausible range (1 to 8 kt) regardless of the actual tidal
    coefficient. This is a sanity check that the pipeline produces
    speeds in the right order of magnitude end to end.
    """
    reg = ShomC2dRegistry.from_directory(_LIVE_DIR)
    t0 = datetime(2026, 5, 15, 0, 0, tzinfo=UTC)
    times = [t0 + timedelta(minutes=15 * i) for i in range(96)]  # 24 h, 15 min step
    out = reg.predict_current_series(47.5733, -2.8903, times)
    assert out is not None
    speeds, _, source = out
    assert source.startswith("shom_c2d_558_")
    peak = float(speeds.max())
    assert 1.0 <= peak <= 8.0, f"unexpected peak {peak:.2f} kt at Tascon"
