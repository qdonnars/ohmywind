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
1.5 km, tides included). The same reader serves the IBI and global products.

Method: the files stream through :class:`GridAnalysis` in time order, the
constituents resolved are chosen by the Rayleigh criterion on the total
span, the rest are inferred from a reference atlas at the domain centre
(see ``build_bsh_atlas.py`` for the rationale), and the tiles land in the
standard layout (``docs/harmonic_atlas_format.md``).

Licence (read 2026-09-19): Copernicus Marine Service licence, commercial use
and derivative works allowed with the attribution "Generated using E.U.
Copernicus Marine Service Information; <DOI>".

Usage::

    uv run scripts/build_cmems_atlas.py --source-dir build/cmems --glob "nws_bight_*.nc" \\
        --atlas-id CMEMS_NWS_BIGHT --zone nws_bight --output-dir build/cmems/atlas/CMEMS_NWS_BIGHT
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
    select_constituents,
)

WANTED: tuple[str, ...] = (
    "M2", "S2", "N2", "K1", "O1", "M4", "MS4", "K2", "P1", "Q1", "MN4", "M6",
    "2N2", "NU2", "MU2", "L2", "2MS6", "MK4",
)  # fmt: skip
_TILE_DEG = 0.5


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


def build(
    files: list[Path],
    output_dir: Path,
    atlas_id: str,
    zone: str,
    rank: int,
    resolution_m: int,
    dataset_id: str,
    doi: str,
    reference_dir: Path | None,
    rayleigh: float,
    inference: bool,
) -> dict:
    t0 = time.perf_counter()
    if not files:
        sys.exit("no input file")
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
        f"[{atlas_id}] {len(files)} files, {n_instants} instants, {record_hours / 24:.1f} days -> {resolved}",
        file=sys.stderr,
    )

    with xr.open_dataset(files[0]) as ds:
        lat = ds["latitude"].values.astype(float)
        lon = ds["longitude"].values.astype(float)
    nj, ni = lat.size, lon.size
    n_cells = nj * ni
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
    for f in sorted(files):
        with xr.open_dataset(f) as ds:
            ts = _times(ds)
            u = ds["uo"].values.astype(float)
            v = ds["vo"].values.astype(float)
        if u.ndim == 4:  # a depth axis of length one
            u, v = u[:, 0], v[:, 0]
        if u.shape[1:] != (nj, ni):
            raise ValueError(f"{f.name}: grid {u.shape[1:]} differs from {(nj, ni)}")
        step = 2000
        for i in range(0, len(ts), step):
            ga_u.add(ts[i : i + step], u[i : i + step].reshape(-1, n_cells))
            ga_v.add(ts[i : i + step], v[i : i + step].reshape(-1, n_cells))
        inputs.append({"file": f.name, "sha256": _sha256(f), "instants": len(ts)})
        print(f"[{atlas_id}] {f.name}: {len(ts)} instants", file=sys.stderr)
    res_u = ga_u.solve(min_samples=max(48, 2 * ga_u.p))
    res_v = ga_v.solve(min_samples=max(48, 2 * ga_v.p))
    valid = np.isfinite(res_u.amp[0]) & np.isfinite(res_v.amp[0])
    print(f"[{atlas_id}] {int(valid.sum())} / {n_cells} cells fitted", file=sys.stderr)

    LON, LAT = np.meshgrid(lon, lat)
    cols: dict[str, np.ndarray] = {
        "lat": LAT.ravel()[valid].astype(np.float64),
        "lon": LON.ravel()[valid].astype(np.float64),
        "z0_u_ms": res_u.z0[valid].astype(np.float32),
        "z0_v_ms": res_v.z0[valid].astype(np.float32),
        "rmse_u_ms": res_u.rmse[valid].astype(np.float32),
        "rmse_v_ms": res_v.rmse[valid].astype(np.float32),
        "n_samples": res_u.n_valid[valid].astype(np.int32),
    }
    for k, name in enumerate(res_u.names):
        cols[f"{name}_u_amp"] = res_u.amp[k, valid].astype(np.float32)
        cols[f"{name}_u_g"] = res_u.phase_deg[k, valid].astype(np.float32)
    for k, name in enumerate(res_v.names):
        cols[f"{name}_v_amp"] = res_v.amp[k, valid].astype(np.float32)
        cols[f"{name}_v_g"] = res_v.phase_deg[k, valid].astype(np.float32)
    df = pl.DataFrame(cols)
    output_dir.mkdir(parents=True, exist_ok=True)
    for old in output_dir.glob("tile_lat=*"):
        for p in sorted(old.rglob("*"), reverse=True):
            p.unlink() if p.is_file() else p.rmdir()
        old.rmdir()
    keyed = df.with_columns(
        (pl.col("lat") / _TILE_DEG).floor().alias("_tlat"),
        (pl.col("lon") / _TILE_DEG).floor().alias("_tlon"),
    )
    n_tiles = 0
    for (tlat, tlon), tile in keyed.group_by(["_tlat", "_tlon"]):
        d = (
            output_dir
            / f"tile_lat={float(tlat) * _TILE_DEG:.1f}"
            / f"tile_lon={float(tlon) * _TILE_DEG:.1f}"
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
        "label": f"Copernicus Marine {dataset_id}",
        "rank": rank,
        "resolution_m": resolution_m,
        "effective_resolution_m": resolution_m,
        "grid": {
            "type": "regular_ll",
            "dlat_deg": float(lat[1] - lat[0]),
            "dlon_deg": float(lon[1] - lon[0]),
            "origin": "native",
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
            "attribution": f"Generated using E.U. Copernicus Marine Service Information; {doi}. Harmonic constants derived by OhMyWind (changes: harmonic analysis of the hourly series).",
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
        },
        "confidence": "high" if resolution_m <= 1000 else "medium",
        "validity_bbox": None,
        "cells": int(valid.sum()),
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
    b = bbox
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
                            "kind": "bbox",
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
    args = parser.parse_args(argv)
    files = sorted(args.source_dir.glob(args.glob))
    out = args.output_dir or args.source_dir / "atlas" / args.atlas_id
    build(
        files,
        out,
        args.atlas_id,
        args.zone,
        args.rank,
        args.resolution_m,
        args.dataset_id,
        args.doi,
        args.reference_atlas_dir if args.reference_atlas_dir.exists() else None,
        args.rayleigh,
        not args.no_inference,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
