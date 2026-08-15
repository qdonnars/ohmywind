# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Composite marine adapter — SHOM > MARC > Open-Meteo cascade.

Wraps an upstream ``MarineDataAdapter`` (typically ``OpenMeteoAdapter``)
plus a ``MarcAtlasRegistry`` and a ``ShomC2dRegistry``. Returns a
``ForecastBundle`` whose ``sea`` series has currents (and tide heights, for
MARC only — SHOM C2D does not carry heights) overridden by the finest
available source at each waypoint:

1. **SHOM Atlas C2D** (top priority): the French navigation reference.
   Hand-curated scattered points on flow features in coastal cartouches.
   Used wherever a SHOM point sits within ~5 km of the query.
2. **MARC PREVIMER** (mid priority): regular harmonic grid (250 m to
   2 km). Fills the continuous coastal/shelf coverage that SHOM doesn't
   sample.
3. **Open-Meteo SMOC** (fallback): 8 km global Mercator. Used only when
   neither SHOM nor MARC cover the waypoint.

Wave fields are always passed through from Open-Meteo (no SHOM/MARC wave
atlases). Tide heights come from MARC only when the waypoint falls
inside a MARC emprise — SHOM C2D doesn't ship height series.

Provenance is exposed on each ``SeaPoint`` via ``current_source``:
``"shom_c2d_<atlas_id>_<zone>"`` inside SHOM, ``"marc_<atlas>_<res>m"``
inside MARC-only zones, ``"openmeteo_smoc"`` outside both.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from openwind_data.adapters.base import (
    ForecastBundle,
    MarineDataAdapter,
    SeaPoint,
    SeaSeries,
)
from openwind_data.currents.marc_atlas import MarcAtlasRegistry
from openwind_data.currents.shom_c2d_registry import ShomC2dRegistry


def _marc_source_label(atlas_name: str, resolution_m: int) -> str:
    return f"marc_{atlas_name.lower()}_{resolution_m}m"


@dataclass
class CompositeMarineAdapter:
    """``MarineDataAdapter`` that overrides Open-Meteo currents/tide via the
    SHOM > MARC > SMOC cascade.

    Methods on the upstream adapter (e.g. ``aclose``) are not delegated;
    callers manage the lifecycle of the upstream they pass in.

    ``shom`` is optional; when omitted (or empty), the cascade reduces to
    MARC > SMOC and the adapter behaves identically to the previous
    two-tier version. This lets callers skip SHOM in benches or in
    deployments where the C2D artefacts aren't shipped.
    """

    upstream: MarineDataAdapter
    marc: MarcAtlasRegistry
    shom: ShomC2dRegistry | None = None

    async def fetch(
        self,
        lat: float,
        lon: float,
        start: datetime,
        end: datetime,
        models: list[str] | None = None,
    ) -> ForecastBundle:
        bundle = await self.upstream.fetch(lat, lon, start, end, models=models)
        # Try SHOM first (highest priority). When it covers, override the
        # currents only — wave and tide fields stay on Open-Meteo / MARC.
        if self.shom is not None and self.shom.covers(lat, lon):
            return self._apply_shom(bundle, lat, lon)
        atlas = self.marc.covers(lat, lon)
        if atlas is None:
            return bundle  # outside SHOM and MARC, keep Open-Meteo

        # Inside MARC: predict the full series in one shot (vectorised).
        times = [p.time for p in bundle.sea.points]
        if not times:
            return bundle
        h_series = self.marc.predict_height_series(lat, lon, times)
        c_series = self.marc.predict_current_series(lat, lon, times)
        if h_series is None and c_series is None:
            # No MARC data at this exact cell despite atlas coverage — fall back.
            return bundle

        source_label = _marc_source_label(atlas.name, atlas.resolution_m)
        h_arr = h_series[0] if h_series is not None else None
        if c_series is not None:
            speeds_kn, dirs_to_deg, _ = c_series
        else:
            speeds_kn, dirs_to_deg = None, None

        new_points: list[SeaPoint] = []
        for i, p in enumerate(bundle.sea.points):
            new_tide = float(h_arr[i]) if h_arr is not None else p.tide_height_m
            new_speed = float(speeds_kn[i]) if speeds_kn is not None else p.current_speed_kn
            new_dir = (
                float(dirs_to_deg[i]) if dirs_to_deg is not None else p.current_direction_to_deg
            )
            new_points.append(
                SeaPoint(
                    time=p.time,
                    wave_height_m=p.wave_height_m,
                    wave_period_s=p.wave_period_s,
                    wave_direction_deg=p.wave_direction_deg,
                    wind_wave_height_m=p.wind_wave_height_m,
                    swell_wave_height_m=p.swell_wave_height_m,
                    current_speed_kn=new_speed,
                    current_direction_to_deg=new_dir,
                    tide_height_m=new_tide,
                    current_source=source_label,
                )
            )
        return ForecastBundle(
            lat=bundle.lat,
            lon=bundle.lon,
            start=bundle.start,
            end=bundle.end,
            wind_by_model=bundle.wind_by_model,
            sea=SeaSeries(points=tuple(new_points)),
            requested_at=bundle.requested_at,
        )

    def _apply_shom(self, bundle: ForecastBundle, lat: float, lon: float) -> ForecastBundle:
        """Override the bundle's currents with SHOM Atlas C2D predictions.

        Wave fields stay on Open-Meteo. Tide height also stays on
        Open-Meteo (or falls through to MARC if a separate MARC override
        also applies — currently mutually exclusive in the cascade since
        SHOM takes priority). The source label embeds atlas id + zone
        name, e.g. ``"shom_c2d_558_morbihan"``.
        """
        if self.shom is None:  # narrows the Optional for type checkers
            return bundle
        times = [p.time for p in bundle.sea.points]
        if not times:
            return bundle
        result = self.shom.predict_current_series(lat, lon, times)
        if result is None:
            return bundle
        speeds_kn, dirs_to_deg, source_label = result
        new_points: list[SeaPoint] = []
        for i, p in enumerate(bundle.sea.points):
            new_points.append(
                SeaPoint(
                    time=p.time,
                    wave_height_m=p.wave_height_m,
                    wave_period_s=p.wave_period_s,
                    wave_direction_deg=p.wave_direction_deg,
                    wind_wave_height_m=p.wind_wave_height_m,
                    swell_wave_height_m=p.swell_wave_height_m,
                    current_speed_kn=float(speeds_kn[i]),
                    current_direction_to_deg=float(dirs_to_deg[i]),
                    tide_height_m=p.tide_height_m,
                    current_source=source_label,
                )
            )
        return ForecastBundle(
            lat=bundle.lat,
            lon=bundle.lon,
            start=bundle.start,
            end=bundle.end,
            wind_by_model=bundle.wind_by_model,
            sea=SeaSeries(points=tuple(new_points)),
            requested_at=bundle.requested_at,
        )
