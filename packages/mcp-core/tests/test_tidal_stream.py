# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""``get_tidal_stream``: the atlas prediction at a point, with no weather request.

The questions it answers are about a pass ("when do I carry the stream
through the Fromveur?"), and the atlases answer them without Open-Meteo.
These tests hold that promise: zero upstream calls, the same cascade as a
plan, and an honest "not covered" outside every atlas.
"""

from __future__ import annotations

import json
import math
from datetime import UTC, datetime
from pathlib import Path

import polars as pl
import pytest
from mcp.types import CallToolResult
from openwind_data.currents.marc_atlas import MarcAtlasRegistry
from openwind_data.currents.router import CompositeMarineAdapter

from openwind_mcp_core import build_server


class StubAdapter:
    """An upstream that must never be called: it only counts."""

    def __init__(self) -> None:
        self.fetch_calls = 0

    async def fetch(self, lat, lon, start, end, models=None):
        self.fetch_calls += 1
        raise AssertionError("get_tidal_stream asked the weather upstream")


START = datetime(2026, 5, 1, 0, 0, tzinfo=UTC).isoformat()
END = datetime(2026, 5, 2, 0, 0, tzinfo=UTC).isoformat()
IN_ATLAS = {"lat": 48.355, "lon": -4.795}  # the one FINIS-like cell below
IN_THE_MED = {"lat": 43.0, "lon": 5.0}


def _write_atlas(
    root: Path, name: str, resolution_m: int, square: list, cell: tuple[float, float]
) -> Path:
    """One atlas of a single cell with an M2 tide and stream, as in the router tests."""
    d = root / name
    d.mkdir()
    (d / "metadata.json").write_text(
        json.dumps(
            {
                "atlas": name,
                "rank": 2,
                "resolution_m": resolution_m,
                "constituents_h": ["M2"],
                "constituents_u": ["M2"],
                "constituents_v": ["M2"],
                "schema_version": 2,
            }
        )
    )
    (d / "coverage.geojson").write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {},
                        "geometry": {"type": "Polygon", "coordinates": [square]},
                    }
                ],
            }
        )
    )
    lat, lon = cell
    # Half-degree tiles, named by their south-west corner.
    tile = d / f"tile_lat={math.floor(lat * 2) / 2:.1f}" / f"tile_lon={math.floor(lon * 2) / 2:.1f}"
    tile.mkdir(parents=True)
    pl.DataFrame(
        {
            "lat": [lat],
            "lon": [lon],
            "z0_hydro_m": [-3.85],
            "M2_h_amp": [2.05],
            "M2_h_g": [108.0],
            "M2_u_amp": [0.5],
            "M2_u_g": [80.0],
            "M2_v_amp": [0.3],
            "M2_v_g": [120.0],
        }
    ).write_parquet(tile / "data.parquet")
    return root


@pytest.fixture
def atlas_dir(tmp_path: Path) -> Path:
    """A single FINIS-like cell."""
    square = [[-5.5, 47.5], [-4.5, 47.5], [-4.5, 49.0], [-5.5, 49.0], [-5.5, 47.5]]
    return _write_atlas(tmp_path, "FINIS", 250, square, (48.35, -4.80))


def _rows(table: dict) -> list[dict]:
    """A table of the answer read back as one dict per row."""
    return [dict(zip(table["columns"], row, strict=True)) for row in table["rows"]]


async def _stream(server, **args) -> dict:
    result = await server.call_tool("get_tidal_stream", {"start": START, "end": END, **args})
    if isinstance(result, CallToolResult):
        return result.structuredContent
    return result[1] if isinstance(result, tuple) else result


def _server_with_atlas(atlas_dir: Path) -> tuple[object, StubAdapter]:
    upstream = StubAdapter()
    adapter = CompositeMarineAdapter(
        upstream=upstream, marc=MarcAtlasRegistry.from_directory(atlas_dir)
    )
    return build_server(adapter=adapter), upstream


async def test_inside_an_atlas_without_a_weather_request(atlas_dir: Path) -> None:
    server, upstream = _server_with_atlas(atlas_dir)
    out = await _stream(server, **IN_ATLAS)
    assert out["covered"] is True
    assert out["source"] == "marc_finis_250m"
    assert upstream.fetch_calls == 0
    first = _rows(out["points"])[0]
    assert {"time", "speed_kn", "direction_to_deg", "height_m"} <= first.keys()
    # An M2 tide: two high waters, two low waters and a few slacks in 24 h.
    assert len(out["high_waters"]) == 2
    assert len(out["low_waters"]) == 2
    assert out["slack"]


async def test_a_heading_splits_the_day_into_carrying_and_stemming(atlas_dir: Path) -> None:
    server, _ = _server_with_atlas(atlas_dir)
    out = await _stream(server, **IN_ATLAS, heading_deg=60)
    assert out["heading_deg"] == 60
    assert all(p["along_kn"] is not None for p in _rows(out["points"]))
    assert out["favourable"]
    assert out["adverse"]
    assert all(w["peak_kn"] > 0 for w in out["favourable"])
    assert all(w["peak_kn"] < 0 for w in out["adverse"])


async def test_outside_every_atlas_says_so(atlas_dir: Path) -> None:
    server, upstream = _server_with_atlas(atlas_dir)
    out = await _stream(server, **IN_THE_MED)
    assert out["covered"] is False
    assert "get_marine_forecast" in out["reason"]
    assert upstream.fetch_calls == 0


async def test_a_server_without_atlases_says_so() -> None:
    out = await _stream(build_server(adapter=StubAdapter()), **IN_ATLAS)
    assert out["covered"] is False
    assert "no tidal atlas" in out["reason"]


async def test_window_is_capped(atlas_dir: Path) -> None:
    server, _ = _server_with_atlas(atlas_dir)
    with pytest.raises(Exception, match="400"):
        await server.call_tool(
            "get_tidal_stream",
            {
                **IN_ATLAS,
                "start": START,
                "end": datetime(2026, 5, 20, tzinfo=UTC).isoformat(),
                "step_minutes": 5,
            },
        )


def test_a_window_of_a_single_step_is_dropped() -> None:
    # The tail of a stream that turned before the window began is no window.
    from datetime import timedelta

    from openwind_mcp_core.server import _runs

    times = [datetime(2026, 5, 1, tzinfo=UTC) + timedelta(minutes=30 * i) for i in range(6)]
    runs = _runs(times, [1.0, -0.5, -0.5, 0.8, 0.9, -0.2], lambda v: v >= 0.3)
    assert [(r["start"][11:16], r["end"][11:16]) for r in runs] == [("01:30", "02:00")]


async def test_slack_is_only_where_the_stream_nearly_stops(atlas_dir: Path) -> None:
    server, _ = _server_with_atlas(atlas_dir)
    out = await _stream(server, **IN_ATLAS)
    strongest = max(p["speed_kn"] for p in _rows(out["points"]))
    assert out["slack"]
    assert all(s["speed_kn"] <= max(0.5, 0.25 * strongest) for s in out["slack"])


async def test_a_coarse_atlas_beside_a_listed_pass_warns(tmp_path: Path) -> None:
    # Messina under a 4.2 km grid: the cell averages a 5 kt race down to
    # 1 kt. A plan withholds that value; the stream tool keeps the timing
    # and must say the real stream is stronger.
    square = [[15.0, 37.5], [16.0, 37.5], [16.0, 38.5], [15.0, 38.5], [15.0, 37.5]]
    server, _ = _server_with_atlas(_write_atlas(tmp_path, "MED", 4200, square, (38.25, 15.63)))
    out = await _stream(server, lat=38.255, lon=15.635)
    assert out["covered"] is True
    assert out["confidence"] == "medium"
    assert "Messina" in out["warning"]
    assert "stronger" in out["warning"]


async def test_a_fine_atlas_away_from_any_pass_does_not_warn(atlas_dir: Path) -> None:
    server, _ = _server_with_atlas(atlas_dir)
    out = await _stream(server, **IN_ATLAS)
    assert "warning" not in out
