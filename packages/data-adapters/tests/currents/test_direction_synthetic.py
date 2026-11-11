# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Grid rotation, the one step where a builder can turn a current round, on a synthetic grid.

Curvilinear ocean models (ROMS for the NOAA OFS, the Copernicus Arctic grid)
give their velocities along the grid axes, not east and north. Two builders
turn them back:

- ``scripts/build_ofs_atlas.py::_rotate``, by the ROMS ``angle`` of each cell;
- ``scripts/build_cmems_arctic_atlas.py::grid_x_angle``, the angle of the
  polar stereographic ``x`` axis from the 2D latitude and longitude, followed
  by the same rotation written inline.

A sign slip in either (``-angle`` for ``angle``, ``sin`` and ``cos``
swapped) sends the stream off by twice the grid angle, a full reversal on a
grid turned by 90 degrees, and the atlas looks perfectly healthy. No real
atlas is needed to catch it: a rectilinear stream of known bearing is
projected onto grids turned by known angles, put back through the builders'
own functions, analysed into harmonic constants as the builders do, written
as a one-cell atlas and read back through the cascade.

The builders' modules import xarray, scipy and httpx at the top, which this
package does not depend on, so the two functions are lifted from their source
with ``ast`` and run on numpy alone. What is tested is the code as committed.
"""

from __future__ import annotations

import ast
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import FunctionType

import numpy as np
import polars as pl
import pytest

from openwind_data.currents.harmonic import predict
from openwind_data.currents.harmonic_analysis import analyze
from openwind_data.currents.marc_atlas import MarcAtlasRegistry
from openwind_data.currents.router import compose_marine_adapter
from tests.currents.tidal_truth import StubUpstream, angular_distance, bare_bundle

_SCRIPTS = Path(__file__).resolve().parents[4] / "scripts"


def _lift(script: str, name: str) -> FunctionType:
    """The function ``name`` of ``scripts/<script>``, compiled alone with numpy as ``np``."""
    source = (_SCRIPTS / script).read_text()
    tree = ast.parse(source)
    node = next(
        n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == name
    )  # StopIteration here means the builder renamed it: update this test
    module = ast.Module(body=[node], type_ignores=[])
    namespace: dict[str, object] = {"np": np}
    exec(compile(module, f"{script}::{name}", "exec"), namespace)
    fn = namespace[name]
    assert isinstance(fn, FunctionType)
    return fn


_rotate = _lift("build_ofs_atlas.py", "_rotate")
_grid_x_angle = _lift("build_cmems_arctic_atlas.py", "grid_x_angle")

# Grid axis angles, counter-clockwise from east: the small tilts of a real
# ROMS grid, and the quarter and half turns where an inverted sign shows most.
_ANGLES_DEG = (-170.0, -90.0, -37.0, 0.0, 12.0, 45.0, 90.0, 135.0, 180.0)


def _to_grid(
    east: np.ndarray, north: np.ndarray, angle: np.ndarray | float
) -> tuple[np.ndarray, np.ndarray]:
    """Project an east / north vector on axes turned by ``angle`` (x from east, ccw)."""
    c, s = np.cos(angle), np.sin(angle)
    return east * c + north * s, -east * s + north * c


@pytest.mark.parametrize("angle_deg", _ANGLES_DEG)
def test_ofs_rotate_puts_grid_components_back_east_and_north(angle_deg: float) -> None:
    rng = np.random.default_rng(7)
    east = rng.normal(size=50).astype(np.float32)
    north = rng.normal(size=50).astype(np.float32)
    angle = np.full(50, np.deg2rad(angle_deg))
    gx, gy = _to_grid(east, north, angle)
    ue, vn = _rotate(gx, gy, angle)
    np.testing.assert_allclose(ue, east, atol=1e-5)
    np.testing.assert_allclose(vn, north, atol=1e-5)


@pytest.mark.parametrize("angle_deg", _ANGLES_DEG)
def test_arctic_grid_angle_reads_the_turn_of_a_rotated_grid(angle_deg: float) -> None:
    """A grid whose ``x`` axis is turned by a known angle reads back that angle.

    Built on a local tangent plane at Látraröst latitude, 3 km cells: the
    latitude and longitude of each node are where the turned axes put it.
    """
    alpha = np.deg2rad(angle_deg)
    lat0, lon0, step_m = 65.5, -24.5, 3000.0
    j, i = np.mgrid[0:6, 0:7].astype(float)
    x_m, y_m = i * step_m, j * step_m
    east_m = x_m * np.cos(alpha) - y_m * np.sin(alpha)
    north_m = x_m * np.sin(alpha) + y_m * np.cos(alpha)
    lat = lat0 + north_m / 111_000.0
    lon = lon0 + east_m / (111_000.0 * np.cos(np.deg2rad(lat0)))
    theta = _grid_x_angle(lat, lon)
    err = np.rad2deg(np.angle(np.exp(1j * (theta - alpha))))
    assert np.abs(err).max() < 1.0, err


def _one_cell_atlas(root: Path, lat: float, lon: float, u: dict, v: dict) -> None:
    """A schema 3 atlas of one cell, rank 2, in the standard tiled layout."""
    atlas = root / "SYNTH_ROT"
    tile = (
        atlas
        / f"tile_lat={np.floor(lat / 0.5) * 0.5:.1f}"
        / f"tile_lon={np.floor(lon / 0.5) * 0.5:.1f}"
    )
    tile.mkdir(parents=True)
    row: dict[str, list[float]] = {"lat": [lat], "lon": [lon]}
    for name, (amp, g) in u.items():
        row[f"{name}_u_amp"], row[f"{name}_u_g"] = [amp], [g]
    for name, (amp, g) in v.items():
        row[f"{name}_v_amp"], row[f"{name}_v_g"] = [amp], [g]
    pl.DataFrame(row).write_parquet(tile / "data.parquet")
    (atlas / "metadata.json").write_text(
        json.dumps(
            {
                "format": "ohmywind-harmonic-atlas",
                "schema_version": 3,
                "atlas": "SYNTH_ROT",
                "zone": "synth",
                "rank": 2,
                "resolution_m": 500,
                "source": {"short": "synth"},
                "constituents_h": [],
                "constituents_u": sorted(u),
                "constituents_v": sorted(v),
                "grid": {"type": "regular_ll", "origin": "native"},
            }
        )
    )
    d = 0.05
    ring = [
        [lon - d, lat - d],
        [lon + d, lat - d],
        [lon + d, lat + d],
        [lon - d, lat + d],
        [lon - d, lat - d],
    ]
    (atlas / "coverage.geojson").write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {},
                        "geometry": {"type": "Polygon", "coordinates": [ring]},
                    }
                ],
            }
        )
    )


# The truth: a rectilinear M2 + S2 stream setting to 060 at its flood peak
# and to 240 at its ebb peak, 2 m/s in M2, as in a Fundy-like pass.
_FLOOD_TO = 60.0
_TRUTH_SPEED = {"M2": (2.0, 40.0), "S2": (0.6, 75.0)}
_T0 = datetime(2026, 3, 1, tzinfo=UTC)
_TIMES = [_T0 + timedelta(hours=h) for h in range(32 * 24)]  # 32 days, as the OFS spikes


def _truth_east_north() -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    along = predict(_TIMES, _TRUTH_SPEED)  # signed speed along the axis, + toward 060
    rad = np.deg2rad(_FLOOD_TO)
    return along * np.sin(rad), along * np.cos(rad), along


def _served_after_build(
    tmp_path: Path, angle_deg: float, *, rotate: bool = True
) -> tuple[np.ndarray, np.ndarray]:
    """Build a one-cell atlas from grid-axis velocities and read the cascade back."""
    east, north, _ = _truth_east_north()
    angle = np.full(east.shape, np.deg2rad(angle_deg))
    gx, gy = _to_grid(east, north, angle)
    ue, vn = _rotate(gx, gy, angle) if rotate else (gx, gy)
    names = ["M2", "S2"]
    u = analyze(_TIMES, ue, names).constants
    v = analyze(_TIMES, vn, names).constants
    lat, lon = 45.34, -64.40
    _one_cell_atlas(tmp_path, lat, lon, u, v)
    marc = MarcAtlasRegistry.from_directory(tmp_path)
    adapter = compose_marine_adapter(StubUpstream(), marc, None)
    points = adapter.apply_atlases(bare_bundle(lat, lon, _TIMES), lat, lon).sea.points  # type: ignore[attr-defined]
    dirs = np.array([p.current_direction_to_deg for p in points], dtype=float)
    speeds = np.array([p.current_speed_kn for p in points], dtype=float)
    return dirs, speeds


@pytest.mark.parametrize("angle_deg", _ANGLES_DEG)
def test_rotated_grid_round_trip_through_builder_and_cascade(
    tmp_path: Path, angle_deg: float
) -> None:
    _, _, along = _truth_east_north()
    dirs, speeds = _served_after_build(tmp_path, angle_deg)
    flood = along > 1.5  # m/s, the strong half of each flood
    ebb = along < -1.5
    assert flood.sum() > 50 and ebb.sum() > 50
    flood_err = max(angular_distance(d, _FLOOD_TO) for d in dirs[flood])
    ebb_err = max(angular_distance(d, _FLOOD_TO + 180.0) for d in dirs[ebb])
    assert flood_err < 2.0, f"flood off by {flood_err:.1f} deg on a grid turned {angle_deg}"
    assert ebb_err < 2.0, f"ebb off by {ebb_err:.1f} deg on a grid turned {angle_deg}"
    # Knots, not m/s, and the strength kept: 1.5 m/s is 2.9 kt.
    assert speeds[flood].min() > 2.8


def test_a_missing_rotation_is_caught(tmp_path: Path) -> None:
    """The check above is not vacuous: skip the rotation on a quarter-turned grid and it fails."""
    _, _, along = _truth_east_north()
    dirs, _ = _served_after_build(tmp_path, 90.0, rotate=False)
    flood = along > 1.5
    assert min(angular_distance(d, _FLOOD_TO) for d in dirs[flood]) > 60.0
