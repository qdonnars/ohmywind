#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars
# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "xarray>=2024.1",
#   "netCDF4>=1.6",
#   "numpy>=1.26",
#   "polars>=1.0",
#   "pyarrow>=16",
#   "scipy>=1.11",
#   "openwind-data",
# ]
#
# [tool.uv.sources]
# openwind-data = { path = "../packages/data-adapters", editable = true }
# ///
"""Build a harmonic current atlas from MET Norway's NorKyst800 hourly currents.

Source: the keyless THREDDS aggregation ``fou-hi/norkystv3_800m_m00_be``
(ROMS NorKyst v3, 800 m, z-levels, hourly best estimate, 2024-01-01 onwards)
at ``https://thredds.met.no/thredds/dodsC/``. The grid is polar
stereographic (``proj4`` in the ``projection_stere`` variable) with 2D
``lat`` / ``lon`` arrays; the currents come already rotated to
``u_eastward`` / ``v_northward`` (m/s, int16 packed, scale 0.001) on 15
depth levels, the first one at 0 m.

Two steps in one script:

1. ``--download``: subset the aggregation over ``--bbox`` (index rectangle
   found from the 2D lat/lon), surface level only, one NetCDF file per day
   in ``--source-dir`` (sequential requests, retries with backoff, existing
   files skipped so a run can resume).
2. build (default): the daily files stream through :class:`GridAnalysis` on
   the native cells exactly as ``build_cmems_atlas.py`` does (Rayleigh
   selection of the constituents on the total span, K2 / P1 inferred from a
   reference atlas at the domain centre when one answers there), then the
   constants are resampled by nearest neighbour onto a regular lat/lon grid
   of about 800 m (``--dlat-deg`` x ``--dlon-deg``), cells whose
   reconstructed tidal current never reaches ``--min-speed-kt`` are dropped,
   and the tiles land in the standard layout (``docs/harmonic_atlas_format.md``,
   ``grid.origin = "regrid"``).

Licence (read 2026-09-21): the aggregation's global attribute ``license`` is
``https://spdx.org/licenses/CC-BY-4.0 (CC-BY-4.0)``; MET Norway's licensing
page (https://www.met.no/en/free-meteorological-data/Licensing-and-crediting)
says NLOD + CC BY 4.0, credit "MET Norway". The THREDDS catalog entry still
carries an older "CC BY 3.0" rights note.

Usage::

    uv run scripts/build_norkyst_atlas.py --download --start 2026-08-19 --days 32 \\
        --bbox 66.9 11.5 68.3 15.5 --source-dir build/norkyst --zone lofoten
    uv run scripts/build_norkyst_atlas.py --source-dir build/norkyst --zone lofoten \\
        --atlas-id NORKYST_LOFOTEN --output-dir build/norkyst/atlas/NORKYST_LOFOTEN
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np
import polars as pl
import xarray as xr
from openwind_data.currents.harmonic_analysis import (
    GridAnalysis,
    Inference,
    inferences_from_reference,
    max_reconstructed_speed,
    select_constituents,
)
from scipy.spatial import cKDTree

WANTED: tuple[str, ...] = (
    "M2", "S2", "N2", "K1", "O1", "M4", "MS4", "K2", "P1", "Q1", "MN4", "M6",
    "2N2", "NU2", "MU2", "L2", "2MS6", "MK4",
)  # fmt: skip
MS_TO_KN = 1.0 / 0.514444
_SEA_PROBE_HOURS = 48
KM_PER_DEG = 111.32

THREDDS_BASE = "https://thredds.met.no/thredds/dodsC/"
DATASET_ID = "fou-hi/norkystv3_800m_m00_be"
CATALOG_URL = "https://thredds.met.no/thredds/catalog/fou-hi/norkystv3.xml"
LICENCE_URL = "https://www.met.no/en/free-meteorological-data/Licensing-and-crediting"
LICENCE_READ_AT = "2026-09-21"


def _times(ds: xr.Dataset) -> list[datetime]:
    return [
        datetime.fromtimestamp(int(t) / 1e9, tz=UTC)
        for t in ds["time"].values.astype("datetime64[ns]").astype("int64")
    ]


def reference_constants(
    reference_dir: Path | None, lat: float, lon: float
) -> tuple[dict, dict, str]:
    if reference_dir is None:
        return {}, {}, "none"
    from openwind_data.currents.marc_atlas import MarcAtlasRegistry

    cell = MarcAtlasRegistry.from_directory(reference_dir).cell_at(lat, lon)
    if cell is None:
        return {}, {}, "none"
    return (
        cell.u_constants,
        cell.v_constants,
        f"{cell.atlas_name} cell ({cell.lat:.4f}, {cell.lon:.4f})",
    )


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------


def index_window(
    lat: np.ndarray, lon: np.ndarray, bbox: list[float], margin: int = 1
) -> tuple[slice, slice]:
    """Index rectangle of the native grid that contains every cell of ``bbox``."""
    lat_min, lon_min, lat_max, lon_max = bbox
    inside = (lat >= lat_min) & (lat <= lat_max) & (lon >= lon_min) & (lon <= lon_max)
    if not inside.any():
        sys.exit(f"bbox {bbox} contains no grid point")
    jj, ii = np.where(inside)
    return (
        slice(
            max(0, int(jj.min()) - margin),
            min(lat.shape[0], int(jj.max()) + margin + 1),
        ),
        slice(
            max(0, int(ii.min()) - margin),
            min(lat.shape[1], int(ii.max()) + margin + 1),
        ),
    )


def _load_with_retries(da: xr.Dataset, what: str, attempts: int = 5) -> xr.Dataset:
    delay = 5.0
    for k in range(attempts):
        try:
            return da.load()
        except (
            OSError,
            RuntimeError,
            ValueError,
        ) as exc:  # DAP errors surface as these
            if k == attempts - 1:
                raise
            print(f"  {what}: {exc!r}, retry in {delay:.0f} s", file=sys.stderr)
            time.sleep(delay)
            delay *= 3.0
    raise AssertionError("unreachable")


def download(
    source_dir: Path,
    zone: str,
    bbox: list[float],
    start: datetime,
    days: int,
    dataset_id: str,
    pause_s: float,
) -> list[Path]:
    """One file per day, surface level, over the index rectangle of ``bbox``."""
    url = THREDDS_BASE + dataset_id
    print(f"[download] opening {url}", file=sys.stderr)
    ds = xr.open_dataset(url)
    lat = ds["lat"].values.astype(float)
    lon = ds["lon"].values.astype(float)
    jw, iw = index_window(lat, lon, bbox)
    times = ds["time"].values.astype("datetime64[ns]")
    print(
        f"[download] window Y[{jw.start}:{jw.stop}] X[{iw.start}:{iw.stop}] "
        f"({(jw.stop - jw.start) * (iw.stop - iw.start)} points), "
        f"axis {times[0]} .. {times[-1]} ({times.size} instants)",
        file=sys.stderr,
    )
    source_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for d in range(days):
        day = start + timedelta(days=d)
        out = source_dir / f"norkyst_{zone}_{day:%Y%m%d}.nc"
        if out.exists():
            written.append(out)
            continue
        t0 = np.datetime64(day.replace(tzinfo=None), "ns")
        t1 = t0 + np.timedelta64(1, "D")
        i0, i1 = int(np.searchsorted(times, t0)), int(np.searchsorted(times, t1))
        if i1 <= i0:
            print(
                f"[download] {day:%Y-%m-%d}: no instant in the axis, skipped",
                file=sys.stderr,
            )
            continue
        t_day = time.perf_counter()
        sub = ds[["u_eastward", "v_northward"]].isel(
            time=slice(i0, i1), depth=0, Y=jw, X=iw
        )
        sub = _load_with_retries(sub, f"{day:%Y-%m-%d}")
        sub = sub.reset_coords(drop=False)
        sub["lat"] = (("Y", "X"), lat[jw, iw])
        sub["lon"] = (("Y", "X"), lon[jw, iw])
        sub.attrs = {
            "source_dataset": dataset_id,
            "source_url": url,
            "index_window": json.dumps(
                {"Y": [jw.start, jw.stop], "X": [iw.start, iw.stop]}
            ),
            "depth_m": float(ds["depth"].values[0]),
            "license": str(ds.attrs.get("license", "")),
            "downloaded_at": datetime.now(UTC).isoformat(timespec="seconds"),
        }
        enc = {
            v: {"dtype": "float32", "zlib": True, "complevel": 4}
            for v in ("u_eastward", "v_northward")
        }
        tmp = out.with_suffix(".tmp.nc")
        sub.to_netcdf(tmp, encoding=enc)
        tmp.rename(out)
        written.append(out)
        print(
            f"[download] {out.name}: {i1 - i0} instants, "
            f"{out.stat().st_size / 1e6:.1f} MB in {time.perf_counter() - t_day:.0f} s",
            file=sys.stderr,
        )
        time.sleep(pause_s)
    ds.close()
    return written


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------


def sea_cells(path: Path, nj: int, ni: int) -> np.ndarray:
    """Flat indices of the cells that carry a value in the first two days."""
    with xr.open_dataset(path) as ds:
        u = ds["u_eastward"].isel(time=slice(0, _SEA_PROBE_HOURS)).values
    if u.shape[1:] != (nj, ni):
        raise ValueError(f"{path.name}: grid {u.shape[1:]} differs from {(nj, ni)}")
    return np.where(np.isfinite(u).any(axis=0).ravel())[0]


def regular_grid(
    bbox: list[float], dlat: float, dlon: float
) -> tuple[np.ndarray, np.ndarray]:
    """Cell centres of a regular grid aligned on multiples of the step."""
    lat_min, lon_min, lat_max, lon_max = bbox
    lats = np.arange(np.floor(lat_min / dlat) * dlat + dlat / 2, lat_max, dlat)
    lons = np.arange(np.floor(lon_min / dlon) * dlon + dlon / 2, lon_max, dlon)
    return lats, lons


def nearest_native(
    src_lat: np.ndarray,
    src_lon: np.ndarray,
    dst_lat: np.ndarray,
    dst_lon: np.ndarray,
    max_dist_m: float,
) -> tuple[np.ndarray, np.ndarray]:
    """Index of the nearest source point for every destination point.

    Distances on a local equirectangular plane (km), which at 800 m is exact
    to well under a metre. Returns ``(index, distance_m)``; destinations
    farther than ``max_dist_m`` from any source get index -1.
    """
    lat0 = float(np.mean(src_lat))
    scale = KM_PER_DEG * np.cos(np.deg2rad(lat0))
    tree = cKDTree(np.column_stack([src_lon * scale, src_lat * KM_PER_DEG]))
    dist, idx = tree.query(
        np.column_stack([dst_lon * scale, dst_lat * KM_PER_DEG]),
        distance_upper_bound=max_dist_m / 1000.0,
    )
    idx = np.where(np.isfinite(dist), idx, -1)
    return idx, np.where(np.isfinite(dist), dist * 1000.0, np.inf)


def build(
    files: list[Path],
    output_dir: Path,
    atlas_id: str,
    zone: str,
    label: str | None,
    rank: int,
    resolution_m: int,
    dataset_id: str,
    reference_dir: Path | None,
    rayleigh: float,
    inference: bool,
    min_speed_kt: float,
    tile_deg: float,
    bbox: list[float],
    dlat: float,
    dlon: float,
    max_nn_m: float,
    validity_bbox: list[float] | None,
    time_chunk: int,
    confidence: str = "medium",
) -> dict:
    t0 = time.perf_counter()
    if not files:
        sys.exit("no input file")
    files = sorted(files)
    spans = []
    for f in files:
        with xr.open_dataset(f) as ds:
            ts = _times(ds)
            spans.append((ts[0], ts[-1], len(ts)))
    start = min(s[0] for s in spans)
    end = max(s[1] for s in spans)
    record_hours = (end - start).total_seconds() / 3600.0
    n_instants = sum(s[2] for s in spans)
    resolved = select_constituents(record_hours, WANTED, rayleigh=rayleigh)
    print(
        f"[{atlas_id}] {len(files)} files, {n_instants} instants, "
        f"{record_hours / 24:.1f} days -> {resolved}",
        file=sys.stderr,
    )

    with xr.open_dataset(files[0]) as ds:
        lat2 = ds["lat"].values.astype(float)
        lon2 = ds["lon"].values.astype(float)
        source_attrs = dict(ds.attrs)
    nj, ni = lat2.shape
    sea = sea_cells(files[0], nj, ni)
    n_cells = sea.size
    print(f"[{atlas_id}] {n_cells} sea cells of {nj * ni} (native)", file=sys.stderr)
    ref_u, ref_v, ref_label = reference_constants(
        reference_dir, float(lat2.mean()), float(lon2.mean())
    )
    inf_u: tuple[Inference, ...] = ()
    inf_v: tuple[Inference, ...] = ()
    if inference and ref_u and ref_v:
        inf_u = inferences_from_reference(ref_u, resolved, WANTED)
        inf_v = inferences_from_reference(ref_v, resolved, WANTED)
        print(
            f"[{atlas_id}] inferred from {ref_label}: {[i.name for i in inf_u]}",
            file=sys.stderr,
        )

    ga_u = GridAnalysis(n_cells, resolved, inf_u)
    ga_v = GridAnalysis(n_cells, resolved, inf_v)
    inputs = []
    for f in files:
        t_file = time.perf_counter()
        with xr.open_dataset(f) as ds:
            ts = _times(ds)
            for i in range(0, len(ts), time_chunk):
                sl = slice(i, i + time_chunk)
                for var, ga in (("u_eastward", ga_u), ("v_northward", ga_v)):
                    block = ds[var].isel(time=sl).values
                    if block.shape[1:] != (nj, ni):
                        raise ValueError(
                            f"{f.name}: grid {block.shape[1:]} differs from {(nj, ni)}"
                        )
                    ga.add(
                        ts[sl], block.reshape(block.shape[0], -1)[:, sea].astype(float)
                    )
        inputs.append({"file": f.name, "sha256": _sha256(f), "instants": len(ts)})
        print(
            f"[{atlas_id}] {f.name}: {len(ts)} instants in {time.perf_counter() - t_file:.1f} s",
            file=sys.stderr,
        )
    res_u = ga_u.solve(min_samples=max(48, 2 * ga_u.p))
    res_v = ga_v.solve(min_samples=max(48, 2 * ga_v.p))
    valid = np.isfinite(res_u.amp[0]) & np.isfinite(res_v.amp[0])
    print(
        f"[{atlas_id}] {int(valid.sum())} / {n_cells} sea cells fitted", file=sys.stderr
    )
    fitted = np.where(valid)[0]
    speed_native = max_reconstructed_speed(
        res_u.amp[:, fitted],
        res_u.phase_deg[:, fitted],
        res_v.amp[:, fitted],
        res_v.phase_deg[:, fitted],
        res_u.names,
    )

    # Nearest-neighbour resampling of the fitted native cells onto the
    # regular grid, then the speed filter on what the regular cells carry.
    lat_native = lat2.ravel()[sea][fitted]
    lon_native = lon2.ravel()[sea][fitted]
    lats, lons = regular_grid(bbox, dlat, dlon)
    LON, LAT = np.meshgrid(lons, lats)
    dst_lat, dst_lon = LAT.ravel(), LON.ravel()
    nn, nn_dist = nearest_native(lat_native, lon_native, dst_lat, dst_lon, max_nn_m)
    hit = nn >= 0
    print(
        f"[{atlas_id}] regular grid {lats.size} x {lons.size} = {dst_lat.size} cells, "
        f"{int(hit.sum())} within {max_nn_m:.0f} m of a fitted native cell "
        f"(median distance {np.median(nn_dist[hit]):.0f} m)",
        file=sys.stderr,
    )
    dst = np.where(hit)[0]
    src = nn[dst]  # index into ``fitted``
    speed = speed_native[src]
    keep = speed * MS_TO_KN >= min_speed_kt
    dst, src, speed = dst[keep], src[keep], speed[keep]
    print(
        f"[{atlas_id}] {dst.size} cells above {min_speed_kt} kt "
        f"({100 * dst.size / max(1, int(hit.sum())):.1f} % of regridded cells)",
        file=sys.stderr,
    )
    idx = fitted[src]  # index into the native sea cells
    cols: dict[str, np.ndarray] = {
        "lat": dst_lat[dst].astype(np.float64),
        "lon": dst_lon[dst].astype(np.float64),
        "z0_u_ms": res_u.z0[idx].astype(np.float32),
        "z0_v_ms": res_v.z0[idx].astype(np.float32),
        "rmse_u_ms": res_u.rmse[idx].astype(np.float32),
        "rmse_v_ms": res_v.rmse[idx].astype(np.float32),
        "n_samples": res_u.n_valid[idx].astype(np.int32),
        "max_speed_kn": (speed * MS_TO_KN).astype(np.float32),
        "regrid_dist_m": nn_dist[dst].astype(np.float32),
    }
    for k, name in enumerate(res_u.names):
        cols[f"{name}_u_amp"] = res_u.amp[k, idx].astype(np.float32)
        cols[f"{name}_u_g"] = res_u.phase_deg[k, idx].astype(np.float32)
    for k, name in enumerate(res_v.names):
        cols[f"{name}_v_amp"] = res_v.amp[k, idx].astype(np.float32)
        cols[f"{name}_v_g"] = res_v.phase_deg[k, idx].astype(np.float32)
    df = pl.DataFrame(cols)
    output_dir.mkdir(parents=True, exist_ok=True)
    for old in output_dir.glob("tile_lat=*"):
        for p in sorted(old.rglob("*"), reverse=True):
            p.unlink() if p.is_file() else p.rmdir()
        old.rmdir()
    keyed = df.with_columns(
        (pl.col("lat") / tile_deg).floor().alias("_tlat"),
        (pl.col("lon") / tile_deg).floor().alias("_tlon"),
    )
    n_tiles = 0
    for (tlat, tlon), tile in keyed.group_by(["_tlat", "_tlon"]):
        d = (
            output_dir
            / f"tile_lat={float(tlat) * tile_deg:.1f}"
            / f"tile_lon={float(tlon) * tile_deg:.1f}"
        )
        d.mkdir(parents=True, exist_ok=True)
        tile.drop(["_tlat", "_tlon"]).write_parquet(
            d / "data.parquet", compression="zstd"
        )
        n_tiles += 1
    elapsed = time.perf_counter() - t0
    out_bbox = [
        float(cols["lat"].min()),
        float(cols["lon"].min()),
        float(cols["lat"].max()),
        float(cols["lon"].max()),
    ]
    licence_evidence = (
        f"global attribute license of the THREDDS aggregation {dataset_id}: "
        f"{source_attrs.get('license', '(not read)')}; MET Norway licensing page: "
        "NLOD + CC BY 4.0, credit MET Norway; catalog rights note: CC BY 3.0"
    )
    meta = {
        "format": "ohmywind-harmonic-atlas",
        "schema_version": 3,
        "atlas": atlas_id,
        "zone": zone,
        "label": label or f"NorKyst800 (MET Norway), {zone}",
        "rank": rank,
        "resolution_m": resolution_m,
        "effective_resolution_m": 800,
        "grid": {
            "type": "regular_ll",
            "dlat_deg": float(dlat),
            "dlon_deg": float(dlon),
            "origin": "regrid",
            "tile_deg": tile_deg,
            "regrid": {
                "method": "nearest_neighbour",
                "max_distance_m": max_nn_m,
                "native": {
                    "type": "polar_stereographic",
                    "spacing_m": 800,
                    "index_window": json.loads(source_attrs.get("index_window", "{}")),
                    "shape": [int(nj), int(ni)],
                },
            },
        },
        "source": {
            "short": "norkyst",
            "name": "MET Norway NorKyst v3 800 m (ROMS), hourly best-estimate aggregation",
            "provider": "Norwegian Meteorological Institute (MET Norway)",
            "url": THREDDS_BASE + dataset_id,
            "product": dataset_id,
            "version": "v3",
            "licence": {
                "name": "CC BY 4.0 (and NLOD)",
                "url": LICENCE_URL,
                "read_at": LICENCE_READ_AT,
                "evidence": licence_evidence,
            },
            "attribution": (
                "Data from the Norwegian Meteorological Institute (MET Norway), "
                "NorKyst v3 800 m, CC BY 4.0. Harmonic constants derived by OhMyWind "
                "(changes: harmonic analysis of the hourly surface series, "
                "nearest-neighbour resampling onto a regular grid)."
            ),
            "citation": CATALOG_URL,
            "redistribution_of_derivative": "allowed with attribution",
        },
        "variables": ["u", "v"],
        "vertical": "surface",
        "vertical_detail": f"z-level {source_attrs.get('depth_m', 0.0)} m of the ZDEPTHS hourly output",
        "datum": None,
        "units": {"u": "m s-1", "v": "m s-1", "phase": "degrees"},
        "phase_convention": "greenwich_utc",
        "time_reference": "UTC",
        "direction_convention": "going_to",
        "constituents_h": [],
        "constituents_u": list(res_u.names),
        "constituents_v": list(res_v.names),
        "analysis": {
            "method": "least_squares_nodal_corrected",
            "record_start": start.isoformat(),
            "record_end": end.isoformat(),
            "record_hours": round(record_hours, 2),
            "instants": n_instants,
            "step_minutes": 60,
            "rayleigh": rayleigh,
            "resolved": list(res_u.resolved),
            "inferred_u": [
                {
                    "name": i.name,
                    "reference": i.reference,
                    "ratio": round(i.ratio, 4),
                    "lag_deg": round(i.lag_deg, 2),
                }
                for i in inf_u
            ],
            "inferred_v": [
                {
                    "name": i.name,
                    "reference": i.reference,
                    "ratio": round(i.ratio, 4),
                    "lag_deg": round(i.lag_deg, 2),
                }
                for i in inf_v
            ],
            "inference_reference": ref_label,
            "mean_is_weather": record_hours < 24 * 30,
            "min_speed_kt": min_speed_kt,
            "sea_cells": int(n_cells),
            "fitted_cells": int(valid.sum()),
            "regridded_cells": int(hit.sum()),
        },
        "confidence": confidence,
        "validity_bbox": validity_bbox,
        "cells": int(dst.size),
        "tiles": n_tiles,
        "bbox": out_bbox,
        "request_bbox": bbox,
        "build_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "build_seconds": round(elapsed, 1),
        "builder": {
            "script": "scripts/build_norkyst_atlas.py",
            "git_commit": _git_commit(),
        },
        "inputs": inputs,
    }
    (output_dir / "metadata.json").write_text(
        json.dumps(meta, indent=2, ensure_ascii=False)
    )
    b = validity_bbox or out_bbox
    (output_dir / "coverage.geojson").write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {
                            "atlas": atlas_id,
                            "rank": rank,
                            "resolution_m": resolution_m,
                            "kind": "validity_bbox" if validity_bbox else "bbox",
                        },
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [
                                [
                                    [b[1], b[0]],
                                    [b[3], b[0]],
                                    [b[3], b[2]],
                                    [b[1], b[2]],
                                    [b[1], b[0]],
                                ]
                            ],
                        },
                    }
                ],
            }
        )
    )
    print(
        f"[{atlas_id}] wrote {n_tiles} tiles to {output_dir} in {elapsed:.0f} s",
        file=sys.stderr,
    )
    return meta


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _git_commit() -> str | None:
    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--source-dir", type=Path, default=Path("build/norkyst"))
    parser.add_argument("--glob", default=None, help="default norkyst_<zone>_*.nc")
    parser.add_argument("--atlas-id", default="NORKYST_LOFOTEN")
    parser.add_argument("--zone", default="lofoten")
    parser.add_argument("--label", default=None, help="human label stored in metadata")
    parser.add_argument("--rank", type=int, default=1)
    parser.add_argument("--resolution-m", type=int, default=800)
    parser.add_argument(
        "--confidence",
        choices=("high", "medium", "low"),
        default="medium",
        help=(
            "confidence stored in metadata; medium by default because the 800 m"
            " grid does not resolve the narrow sounds (Saltstraumen: 0.3 kt in"
            " the atlas against 20 kt published)"
        ),
    )
    parser.add_argument("--dataset-id", default=DATASET_ID)
    parser.add_argument("--output-dir", type=Path, default=None)
    parser.add_argument(
        "--reference-atlas-dir",
        type=Path,
        default=Path("build/fes/atlas"),
        help="parent directory of atlases; the one answering at the domain centre feeds the inference",
    )
    parser.add_argument("--rayleigh", type=float, default=1.0)
    parser.add_argument("--no-inference", action="store_true")
    parser.add_argument(
        "--min-speed-kt",
        type=float,
        default=0.2,
        help="drop cells whose tidal current never reaches this speed (0 keeps all)",
    )
    parser.add_argument("--tile-deg", type=float, default=0.5)
    parser.add_argument(
        "--bbox",
        type=float,
        nargs=4,
        metavar=("LAT_MIN", "LON_MIN", "LAT_MAX", "LON_MAX"),
        default=[66.9, 11.5, 68.3, 15.5],
        help="download subset and extent of the regular output grid",
    )
    parser.add_argument("--dlat-deg", type=float, default=0.0072)
    parser.add_argument("--dlon-deg", type=float, default=0.02)
    parser.add_argument(
        "--max-nn-m",
        type=float,
        default=700.0,
        help="a regular cell farther than this from any native sea cell is land",
    )
    parser.add_argument(
        "--validity-bbox",
        type=float,
        nargs=4,
        metavar=("LAT_MIN", "LON_MIN", "LAT_MAX", "LON_MAX"),
        default=None,
        help="restrict where the runtime may serve this atlas",
    )
    parser.add_argument(
        "--time-chunk", type=int, default=96, help="hours read per slice"
    )
    parser.add_argument(
        "--download", action="store_true", help="fetch from THREDDS first"
    )
    parser.add_argument(
        "--start", default="2026-08-19", help="first day (UTC) to download"
    )
    parser.add_argument("--days", type=int, default=32)
    parser.add_argument(
        "--pause-s", type=float, default=1.0, help="pause between requests"
    )
    parser.add_argument("--no-build", action="store_true", help="download only")
    args = parser.parse_args(argv)

    if args.download:
        start = datetime.fromisoformat(args.start).replace(tzinfo=UTC)
        download(
            args.source_dir,
            args.zone,
            args.bbox,
            start,
            args.days,
            args.dataset_id,
            args.pause_s,
        )
    if args.no_build:
        return 0
    files = sorted(args.source_dir.glob(args.glob or f"norkyst_{args.zone}_*.nc"))
    out = args.output_dir or args.source_dir / "atlas" / args.atlas_id
    build(
        files,
        out,
        args.atlas_id,
        args.zone,
        args.label,
        args.rank,
        args.resolution_m,
        args.dataset_id,
        args.reference_atlas_dir if args.reference_atlas_dir.exists() else None,
        args.rayleigh,
        not args.no_inference,
        args.min_speed_kt,
        args.tile_deg,
        args.bbox,
        args.dlat_deg,
        args.dlon_deg,
        args.max_nn_m,
        args.validity_bbox,
        args.time_chunk,
        args.confidence,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
