# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Tests for the MARC ↔ Open-Meteo composite adapter."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import polars as pl
import pytest

from openwind_data.adapters.base import (
    ForecastBundle,
    MarineDataAdapter,
    SeaPoint,
    SeaSeries,
    WindPoint,
    WindSeries,
)
from openwind_data.currents.marc_atlas import MarcAtlasRegistry
from openwind_data.currents.router import CompositeMarineAdapter
from openwind_data.currents.shom_c2d_registry import ShomC2dRegistry


class _MockUpstream:
    """In-memory MarineDataAdapter for tests. Returns a fixed bundle."""

    def __init__(self, bundle: ForecastBundle) -> None:
        self.bundle = bundle
        self.calls: list[tuple] = []

    async def fetch(
        self,
        lat: float,
        lon: float,
        start: datetime,
        end: datetime,
        models: list[str] | None = None,
    ) -> ForecastBundle:
        self.calls.append((lat, lon, start, end, models))
        return self.bundle


def _make_bundle(lat: float, lon: float, hours: int = 4) -> ForecastBundle:
    base = datetime(2024, 6, 15, 12, tzinfo=UTC)
    times = [base + timedelta(hours=h) for h in range(hours)]
    sea_points = tuple(
        SeaPoint(
            time=t,
            wave_height_m=1.0,
            wave_period_s=6.0,
            wave_direction_deg=270.0,
            wind_wave_height_m=0.5,
            swell_wave_height_m=0.8,
            current_speed_kn=0.2,  # SMOC value, will be overridden by MARC
            current_direction_to_deg=180.0,
            tide_height_m=0.0,
            current_source="openmeteo_smoc",
        )
        for t in times
    )
    wind_points = tuple(
        WindPoint(time=t, speed_kn=15.0, direction_deg=200.0, gust_kn=20.0) for t in times
    )
    return ForecastBundle(
        lat=lat,
        lon=lon,
        start=times[0],
        end=times[-1],
        wind_by_model={"AROME": WindSeries(model="AROME", points=wind_points)},
        sea=SeaSeries(points=sea_points),
    )


@pytest.fixture
def fixture_atlas(tmp_path: Path) -> Path:
    """Same fixture shape as test_marc_atlas — single FINIS-like cell."""
    d = tmp_path / "FINIS"
    d.mkdir()
    (d / "metadata.json").write_text(
        json.dumps(
            {
                "atlas": "FINIS",
                "rank": 2,
                "resolution_m": 250,
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
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [
                                [
                                    [-5.5, 47.5],
                                    [-4.5, 47.5],
                                    [-4.5, 49.0],
                                    [-5.5, 49.0],
                                    [-5.5, 47.5],
                                ]
                            ],
                        },
                    }
                ],
            }
        )
    )
    td = d / "tile_lat=48.0" / "tile_lon=-5.0"
    td.mkdir(parents=True)
    pl.DataFrame(
        {
            "lat": [48.35],
            "lon": [-4.80],
            "z0_hydro_m": [-3.85],
            "M2_h_amp": [2.05],
            "M2_h_g": [108.0],
            "M2_u_amp": [0.5],
            "M2_u_g": [80.0],
            "M2_v_amp": [0.3],
            "M2_v_g": [120.0],
        }
    ).write_parquet(td / "data.parquet")
    return tmp_path


@pytest.mark.asyncio
async def test_outside_marc_passes_through(fixture_atlas: Path) -> None:
    """Mediterranean point: bundle returns unchanged (Open-Meteo only)."""
    reg = MarcAtlasRegistry.from_directory(fixture_atlas)
    bundle = _make_bundle(43.0, 5.0)
    upstream = _MockUpstream(bundle)
    composite: MarineDataAdapter = CompositeMarineAdapter(upstream=upstream, marc=reg)
    out = await composite.fetch(43.0, 5.0, bundle.start, bundle.end)
    # All sea points keep openmeteo_smoc source
    for p in out.sea.points:
        assert p.current_source == "openmeteo_smoc"
        assert p.current_speed_kn == 0.2  # SMOC value preserved


@pytest.mark.asyncio
async def test_inside_marc_overrides_currents(fixture_atlas: Path) -> None:
    """FINIS coverage: currents and tide come from MARC, source label set."""
    reg = MarcAtlasRegistry.from_directory(fixture_atlas)
    bundle = _make_bundle(48.355, -4.795)
    upstream = _MockUpstream(bundle)
    composite = CompositeMarineAdapter(upstream=upstream, marc=reg)
    out = await composite.fetch(48.355, -4.795, bundle.start, bundle.end)
    for p in out.sea.points:
        assert p.current_source == "marc_finis_250m"
        # MARC value will differ from the fixed 0.2 kn SMOC default
        assert p.current_speed_kn != 0.2
        # Wave fields must remain unchanged (Open-Meteo only)
        assert p.wave_height_m == 1.0
        assert p.wave_period_s == 6.0


@pytest.mark.asyncio
async def test_passes_models_through(fixture_atlas: Path) -> None:
    reg = MarcAtlasRegistry.from_directory(fixture_atlas)
    bundle = _make_bundle(48.355, -4.795)
    upstream = _MockUpstream(bundle)
    composite = CompositeMarineAdapter(upstream=upstream, marc=reg)
    await composite.fetch(48.355, -4.795, bundle.start, bundle.end, models=["AROME"])
    assert upstream.calls[0][4] == ["AROME"]


@pytest.mark.asyncio
async def test_wind_unchanged(fixture_atlas: Path) -> None:
    reg = MarcAtlasRegistry.from_directory(fixture_atlas)
    bundle = _make_bundle(48.355, -4.795)
    upstream = _MockUpstream(bundle)
    composite = CompositeMarineAdapter(upstream=upstream, marc=reg)
    out = await composite.fetch(48.355, -4.795, bundle.start, bundle.end)
    assert out.wind_by_model == bundle.wind_by_model


def _make_shom_registry(out_dir: Path, lat: float, lon: float) -> ShomC2dRegistry:
    """Persist a one-point synthetic SHOM artefact and load it back.

    The single point sits exactly at (lat, lon) so the brute-force nearest
    lookup always picks it. The U/V series carry distinctive non-zero values
    so the cascade-priority test can detect that the override actually
    fired (vs falling through to MARC or SMOC).
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    constant_u_ve = [3.0] * 13  # 3 kt eastward at every hour offset
    zero_v = [0.0] * 13
    pl.DataFrame(
        [
            {
                "atlas_id": 560,
                "zone": "TEST",
                "ref_port_key": "BREST",
                "ref_tide": "PM",
                "lat": lat,
                "lon": lon,
                "u_ve_kn": constant_u_ve,
                "v_ve_kn": zero_v,
                "u_me_kn": constant_u_ve,  # same in mortes-eaux: predictor coefficient-independent
                "v_me_kn": zero_v,
            }
        ]
    ).with_columns(
        pl.col("atlas_id").cast(pl.Int16),
        pl.col("lat").cast(pl.Float32),
        pl.col("lon").cast(pl.Float32),
        pl.col("u_ve_kn").cast(pl.List(pl.Float32)),
        pl.col("v_ve_kn").cast(pl.List(pl.Float32)),
        pl.col("u_me_kn").cast(pl.List(pl.Float32)),
        pl.col("v_me_kn").cast(pl.List(pl.Float32)),
    ).write_parquet(out_dir / "shom_c2d_points.parquet")
    (out_dir / "shom_c2d_ref_ports.json").write_text(
        json.dumps(
            {
                "BREST": {
                    "display_name": "Brest",
                    "lat": 48.3833,
                    "lon": -4.4956,
                    "ref_tide": "PM",
                    "constants": {"M2": [2.0, 150.0]},
                }
            }
        )
    )
    return ShomC2dRegistry.from_directory(out_dir)


@pytest.mark.asyncio
async def test_shom_overrides_marc_when_both_cover(fixture_atlas: Path, tmp_path: Path) -> None:
    """Cascade priority: SHOM wins over MARC when both cover the same point."""
    marc = MarcAtlasRegistry.from_directory(fixture_atlas)
    shom = _make_shom_registry(tmp_path / "shom", lat=48.355, lon=-4.795)
    bundle = _make_bundle(48.355, -4.795)
    upstream = _MockUpstream(bundle)
    composite = CompositeMarineAdapter(upstream=upstream, marc=marc, shom=shom)
    out = await composite.fetch(48.355, -4.795, bundle.start, bundle.end)
    for p in out.sea.points:
        # Source label must start with shom_c2d_, never with marc_ or openmeteo_smoc.
        assert p.current_source is not None and p.current_source.startswith("shom_c2d_")
        # Wave fields untouched.
        assert p.wave_height_m == 1.0


@pytest.mark.asyncio
async def test_marc_kicks_in_outside_shom_coverage(fixture_atlas: Path, tmp_path: Path) -> None:
    """When the query point is outside SHOM but inside MARC, MARC fires."""
    marc = MarcAtlasRegistry.from_directory(fixture_atlas)
    # Place SHOM coverage 100 km away so it doesn't fire at our query point.
    shom = _make_shom_registry(tmp_path / "shom", lat=49.5, lon=-3.0)
    bundle = _make_bundle(48.355, -4.795)
    upstream = _MockUpstream(bundle)
    composite = CompositeMarineAdapter(upstream=upstream, marc=marc, shom=shom)
    out = await composite.fetch(48.355, -4.795, bundle.start, bundle.end)
    for p in out.sea.points:
        assert p.current_source == "marc_finis_250m"
