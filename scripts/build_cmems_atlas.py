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
#   "openwind-data",
# ]
#
# [tool.uv.sources]
# openwind-data = { path = "../packages/data-adapters", editable = true }
# ///
"""Build a harmonic current atlas from an archive of Copernicus Marine hourly currents.

Input: NetCDF files written by the ``copernicusmarine subset`` toolbox for a
2D hourly surface-current dataset (``uo``, ``vo`` in m/s on a regular
lat/lon grid), one file per month or per any span, all on the same grid.
Tested on ``cmems_mod_nws_phy-cur_anfc_1.5km-2D_PT1H-i`` (North-West Shelf,
1.5 km, tides included); the same reader serves the IBI and MED products.

Method: the files stream through :class:`GridAnalysis` in time order and in
slices of a few days, so a 3 GB month of a 1.5 million cell domain never
sits in memory at once; land cells (NaN in the first two days of the first
file) are dropped before the analysis. The constituents resolved are chosen
by the Rayleigh criterion on the total span, the rest are inferred from a
reference atlas at the domain centre (see ``build_bsh_atlas.py`` for the
rationale), cells whose reconstructed tidal current never reaches
``--min-speed-kt`` are dropped (the runtime then falls back to the next
source there), and the tiles land in the standard layout
(``docs/harmonic_atlas_format.md``).

Licence (read 2026-09-19): Copernicus Marine Service licence, commercial use
and derivative works allowed with the attribution "Generated using E.U.
Copernicus Marine Service Information; <DOI>".

Usage::

    uv run scripts/build_cmems_atlas.py --source-dir build/cmems --glob "nws_2*.nc" \\
        --atlas-id CMEMS_NWS --zone nws --rank 0 --tile-deg 1.0 \\
        --output-dir build/cmems/atlas/CMEMS_NWS
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import time
from datetime import UTC, datetime
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

WANTED: tuple[str, ...] = (
    "M2", "S2", "N2", "K1", "O1", "M4", "MS4", "K2", "P1", "Q1", "MN4", "M6",
    "2N2", "NU2", "MU2", "L2", "2MS6", "MK4",
)  # fmt: skip
MS_TO_KN = 1.0 / 0.514444
_SEA_PROBE_HOURS = 48


def _times(ds: xr.Dataset) -> list[datetime]:
    return [
        datetime.fromtimestamp(int(t) / 1e9, tz=UTC)
        for t in ds["time"].values.astype("datetime64[ns]").astype("int64")
    ]


def _surface(values: np.ndarray) -> np.ndarray:
    """Drop a depth axis of length one: ``(t, 1, j, i)`` becomes ``(t, j, i)``."""
    return values[:, 0] if values.ndim == 4 else values


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


def sea_cells(path: Path, nj: int, ni: int) -> np.ndarray:
    """Flat indices of the cells that carry a value in the first two days."""
    with xr.open_dataset(path) as ds:
        u = _surface(ds["uo"].isel(time=slice(0, _SEA_PROBE_HOURS)).values)
    if u.shape[1:] != (nj, ni):
        raise ValueError(f"{path.name}: grid {u.shape[1:]} differs from {(nj, ni)}")
    return np.where(np.isfinite(u).any(axis=0).ravel())[0]


def build(
    files: list[Path],
    output_dir: Path,
    atlas_id: str,
    zone: str,
    label: str | None,
    rank: int,
    resolution_m: int,
    dataset_id: str,
    doi: str,
    reference_dir: Path | None,
    rayleigh: float,
    inference: bool,
    min_speed_kt: float,
    tile_deg: float,
    validity_bbox: list[float] | None,
    time_chunk: int,
) -> dict:
    t0 = time.perf_counter()
    if not files:
        sys.exit("no input file")
    files = sorted(files)
    # First pass on the time axes only: the span decides the constituents.
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
        lat = ds["latitude"].values.astype(float)
        lon = ds["longitude"].values.astype(float)
    nj, ni = lat.size, lon.size
    sea = sea_cells(files[0], nj, ni)
    n_cells = sea.size
    print(f"[{atlas_id}] {n_cells} sea cells of {nj * ni}", file=sys.stderr)
    ref_u, ref_v, ref_label = reference_constants(
        reference_dir, float(lat.mean()), float(lon.mean())
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
                for var, ga in (("uo", ga_u), ("vo", ga_v)):
                    block = _surface(ds[var].isel(time=sl).values)
                    if block.shape[1:] != (nj, ni):
                        raise ValueError(
                            f"{f.name}: grid {block.shape[1:]} differs from {(nj, ni)}"
                        )
                    ga.add(
                        ts[sl], block.reshape(block.shape[0], -1)[:, sea].astype(float)
                    )
        inputs.append({"file": f.name, "sha256": _sha256(f), "instants": len(ts)})
        print(
            f"[{atlas_id}] {f.name}: {len(ts)} instants in {time.perf_counter() - t_file:.0f} s",
            file=sys.stderr,
        )
    res_u = ga_u.solve(min_samples=max(48, 2 * ga_u.p))
    res_v = ga_v.solve(min_samples=max(48, 2 * ga_v.p))
    valid = np.isfinite(res_u.amp[0]) & np.isfinite(res_v.amp[0])
    print(
        f"[{atlas_id}] {int(valid.sum())} / {n_cells} sea cells fitted", file=sys.stderr
    )
    idx = np.where(valid)[0]
    speed = max_reconstructed_speed(
        res_u.amp[:, idx],
        res_u.phase_deg[:, idx],
        res_v.amp[:, idx],
        res_v.phase_deg[:, idx],
        res_u.names,
    )
    keep = speed * MS_TO_KN >= min_speed_kt
    idx = idx[keep]
    speed = speed[keep]
    print(
        f"[{atlas_id}] {idx.size} cells above {min_speed_kt} kt "
        f"({100 * idx.size / max(1, int(valid.sum())):.1f} % of fitted cells)",
        file=sys.stderr,
    )

    LON, LAT = np.meshgrid(lon, lat)
    lat_f, lon_f = LAT.ravel()[sea], LON.ravel()[sea]
    cols: dict[str, np.ndarray] = {
        "lat": lat_f[idx].astype(np.float64),
        "lon": lon_f[idx].astype(np.float64),
        "z0_u_ms": res_u.z0[idx].astype(np.float32),
        "z0_v_ms": res_v.z0[idx].astype(np.float32),
        "rmse_u_ms": res_u.rmse[idx].astype(np.float32),
        "rmse_v_ms": res_v.rmse[idx].astype(np.float32),
        "n_samples": res_u.n_valid[idx].astype(np.int32),
        "max_speed_kn": (speed * MS_TO_KN).astype(np.float32),
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
    bbox = [
        float(cols["lat"].min()),
        float(cols["lon"].min()),
        float(cols["lat"].max()),
        float(cols["lon"].max()),
    ]
    meta = {
        "format": "ohmywind-harmonic-atlas",
        "schema_version": 3,
        "atlas": atlas_id,
        "zone": zone,
        "label": label or f"Copernicus Marine {dataset_id}",
        "rank": rank,
        "resolution_m": resolution_m,
        "effective_resolution_m": resolution_m,
        "grid": {
            "type": "regular_ll",
            "dlat_deg": float(lat[1] - lat[0]),
            "dlon_deg": float(lon[1] - lon[0]),
            "origin": "native",
            "tile_deg": tile_deg,
        },
        "source": {
            "short": "cmems",
            "name": f"Copernicus Marine Service, {dataset_id}",
            "provider": "E.U. Copernicus Marine Service (Mercator Ocean International)",
            "url": f"https://data.marine.copernicus.eu/product/{dataset_id.split('_anfc')[0]}",
            "product": dataset_id,
            "version": None,
            "licence": {
                "name": "Copernicus Marine Service licence (commercial use and derivative works allowed)",
                "url": "https://marine.copernicus.eu/user-corner/service-commitments-and-licence",
                "read_at": "2026-09-19",
                "evidence": "Licence section 2.2(b): create and distribute Value Added Products or Derivative Work for any purpose",
            },
            "attribution": (
                f"Generated using E.U. Copernicus Marine Service Information; {doi}. "
                "Harmonic constants derived by OhMyWind "
                "(changes: harmonic analysis of the hourly series)."
            ),
            "citation": doi,
            "redistribution_of_derivative": "allowed with attribution",
        },
        "variables": ["u", "v"],
        "vertical": "surface",
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
        },
        "confidence": "high" if resolution_m <= 1000 else "medium",
        "validity_bbox": validity_bbox,
        "cells": int(idx.size),
        "tiles": n_tiles,
        "bbox": bbox,
        "build_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "build_seconds": round(elapsed, 1),
        "builder": {
            "script": "scripts/build_cmems_atlas.py",
            "git_commit": _git_commit(),
        },
        "inputs": inputs,
    }
    (output_dir / "metadata.json").write_text(
        json.dumps(meta, indent=2, ensure_ascii=False)
    )
    b = validity_bbox or bbox
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
    parser.add_argument("--source-dir", type=Path, default=Path("build/cmems"))
    parser.add_argument("--glob", default="nws_bight_*.nc")
    parser.add_argument("--atlas-id", default="CMEMS_NWS_BIGHT")
    parser.add_argument("--zone", default="nws_bight")
    parser.add_argument("--label", default=None, help="human label stored in metadata")
    parser.add_argument("--rank", type=int, default=1)
    parser.add_argument("--resolution-m", type=int, default=1500)
    parser.add_argument(
        "--dataset-id", default="cmems_mod_nws_phy-cur_anfc_1.5km-2D_PT1H-i"
    )
    parser.add_argument("--doi", default="https://doi.org/10.48670/moi-00054")
    parser.add_argument("--output-dir", type=Path, default=None)
    parser.add_argument("--reference-atlas-dir", type=Path, default=Path("build/marc"))
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
    args = parser.parse_args(argv)
    files = sorted(args.source_dir.glob(args.glob))
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
        args.doi,
        args.reference_atlas_dir if args.reference_atlas_dir.exists() else None,
        args.rayleigh,
        not args.no_inference,
        args.min_speed_kt,
        args.tile_deg,
        args.validity_bbox,
        args.time_chunk,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
