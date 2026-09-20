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
"""Build the global FES2014 tidal-current atlas in the standard format.

Input: the ``fes2014a_currents`` distribution from AVISO+ (two archives,
``eastward_velocity.tar.xz`` and ``northward_velocity.tar.xz``, one NetCDF
per constituent, 1/16 degree, amplitudes in cm/s and Greenwich phases in
degrees), extracted under ``--source-dir`` as ``eastward_velocity/<wave>.nc``
and ``northward_velocity/<wave>.nc``. Licence: AVISO Licence Issue 20 (10
August 2026), read 2026-09-19: FES2014 currents are a previous release, so
the standard terms apply, commercial use and derivative works included;
only bulk redistribution of the unmodified original needs authorisation.

Output: ``docs/harmonic_atlas_format.md`` layout with 2 degree tiles
(``grid.tile_deg``), rank 0, ``fes_global_7000m`` as label. Two choices keep
the artefact small enough to ship:

- constituents: the 16 that matter for a passage (``--constituents``), not
  the 34 distributed;
- ``--min-speed-kt``: cells whose maximum reconstructed tidal current over
  a spring/neap cycle stays under the threshold are dropped. The runtime
  then falls back to SMOC there, which for a negligible tidal current is
  the same answer. The threshold is written to the metadata.

Usage::

    uv run scripts/build_fes_atlas.py --source-dir build/fes --output-dir build/fes/atlas/FES_GLOBAL
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
from openwind_data.currents.harmonic import _canonical
from openwind_data.currents.harmonic_analysis import design_matrix

MS_TO_KN = 1.0 / 0.514444
DEFAULT_CONSTITUENTS = (
    "M2", "S2", "N2", "K2", "K1", "O1", "P1", "Q1",
    "M4", "MS4", "MN4", "M6", "2N2", "NU2", "MU2", "L2",
)  # fmt: skip
# FES file names for the ones whose spelling differs from the NOC table.
FES_FILE_NAMES = {"NU2": "Nu2", "MU2": "Mu2", "LAM2": "La2", "2N2": "2N2"}


def fes_file(source_dir: Path, component: str, name: str) -> Path:
    folder = source_dir / f"{component}_velocity"
    candidates = [FES_FILE_NAMES.get(name, name), name, name.lower(), name.capitalize()]
    for c in candidates:
        for ext in ("nc", "NC"):
            p = folder / f"{c}.{ext}"
            if p.exists():
                return p
    raise FileNotFoundError(f"{name}: no file among {candidates} in {folder}")


def read_constituent(
    path: Path,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """``(lat, lon, amp_ms, phase_deg)`` from one FES current file."""
    ds = xr.open_dataset(path)
    amp_name = next(v for v in ds.data_vars if v.lower().endswith("a"))
    ph_name = next(v for v in ds.data_vars if v.lower().endswith("g"))
    amp = ds[amp_name].values.astype(np.float32)
    phase = ds[ph_name].values.astype(np.float32)
    units = str(ds[amp_name].attrs.get("units", "cm/s")).lower()
    if "cm" in units:
        amp = amp / 100.0
    lat = ds["lat"].values if "lat" in ds else ds["latitude"].values
    lon = ds["lon"].values if "lon" in ds else ds["longitude"].values
    ds.close()
    return lat.astype(float), lon.astype(float), amp, phase


def max_speed(
    u_amp: np.ndarray,
    u_g: np.ndarray,
    v_amp: np.ndarray,
    v_g: np.ndarray,
    x: np.ndarray,
    chunk: int = 200_000,
) -> np.ndarray:
    """Maximum reconstructed speed (m/s) per cell over the times ``x`` was built for."""
    n = u_amp.shape[1]
    out = np.zeros(n, dtype=np.float32)
    rad = np.pi / 180.0
    for start in range(0, n, chunk):
        sl = slice(start, min(start + chunk, n))
        best = np.zeros(sl.stop - sl.start, dtype=np.float32)
        cu = np.empty((x.shape[1], sl.stop - sl.start))
        cv = np.empty_like(cu)
        cu[0::2] = u_amp[:, sl] * np.cos(u_g[:, sl] * rad)
        cu[1::2] = u_amp[:, sl] * np.sin(u_g[:, sl] * rad)
        cv[0::2] = v_amp[:, sl] * np.cos(v_g[:, sl] * rad)
        cv[1::2] = v_amp[:, sl] * np.sin(v_g[:, sl] * rad)
        for t0 in range(0, x.shape[0], 120):
            xt = x[t0 : t0 + 120]
            speed = np.hypot(xt @ cu, xt @ cv)
            best = np.maximum(best, speed.max(axis=0))
        out[sl] = best
    return out


def build(
    source_dir: Path,
    output_dir: Path,
    constituents: list[str],
    min_speed_kt: float,
    tile_deg: float,
) -> dict:
    t0 = time.perf_counter()
    names = [c for c in constituents if _canonical(c) is not None]
    lat = lon = None
    u_amp, u_g, v_amp, v_g = [], [], [], []
    inputs = []
    for name in names:
        for comp, amps, phases in (("eastward", u_amp, u_g), ("northward", v_amp, v_g)):
            path = fes_file(source_dir, comp, name)
            la, lo, a, g = read_constituent(path)
            if lat is None:
                lat, lon = la, lo
            amps.append(a.ravel())
            phases.append(g.ravel())
            inputs.append(
                {"file": str(path.relative_to(source_dir)), "sha256": _sha256(path)}
            )
        print(f"  {name}: read", file=sys.stderr)
    assert lat is not None and lon is not None
    ua, ug = np.stack(u_amp), np.stack(u_g)
    va, vg = np.stack(v_amp), np.stack(v_g)
    valid = (
        np.isfinite(ua).all(axis=0)
        & np.isfinite(va).all(axis=0)
        & (ua[names.index("M2")] > 0)
    )
    print(f"{valid.sum()} sea cells of {valid.size}", file=sys.stderr)
    lon2 = np.where(lon > 180.0, lon - 360.0, lon)
    LON, LAT = np.meshgrid(lon2, lat)
    lat_f, lon_f = LAT.ravel(), LON.ravel()

    idx = np.where(valid)[0]
    times = [
        datetime(2026, 3, 1, tzinfo=UTC) + timedelta(hours=h) for h in range(24 * 15)
    ]
    x = design_matrix(times, names)[0][:, 1:]
    speed = max_speed(ua[:, idx], ug[:, idx], va[:, idx], vg[:, idx], x)
    keep = speed * MS_TO_KN >= min_speed_kt
    idx = idx[keep]
    print(
        f"{idx.size} cells above {min_speed_kt} kt ({100 * idx.size / valid.sum():.1f} % of sea cells)",
        file=sys.stderr,
    )

    cols: dict[str, np.ndarray] = {
        "lat": lat_f[idx].astype(np.float64),
        "lon": lon_f[idx].astype(np.float64),
        "max_speed_kn": (speed[keep] * MS_TO_KN).astype(np.float32),
    }
    for k, name in enumerate(names):
        cols[f"{name}_u_amp"] = ua[k, idx]
        cols[f"{name}_u_g"] = ug[k, idx]
        cols[f"{name}_v_amp"] = va[k, idx]
        cols[f"{name}_v_g"] = vg[k, idx]
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
        lat_o, lon_o = float(tlat) * tile_deg, float(tlon) * tile_deg
        d = output_dir / f"tile_lat={lat_o:.1f}" / f"tile_lon={lon_o:.1f}"
        d.mkdir(parents=True, exist_ok=True)
        tile.drop(["_tlat", "_tlon"]).write_parquet(
            d / "data.parquet", compression="zstd"
        )
        n_tiles += 1
    elapsed = time.perf_counter() - t0
    meta = {
        "format": "ohmywind-harmonic-atlas",
        "schema_version": 3,
        "atlas": "FES_GLOBAL",
        "zone": "global",
        "label": "FES2014 courants, monde, 1/16 degré",
        "rank": 0,
        "resolution_m": 7000,
        "effective_resolution_m": 7000,
        "grid": {
            "type": "regular_ll",
            "dlat_deg": 1 / 16,
            "dlon_deg": 1 / 16,
            "origin": "native",
            "tile_deg": tile_deg,
        },
        "source": {
            "short": "fes",
            "name": "FES2014a tidal currents (Finite Element Solution 2014)",
            "provider": "CNES / LEGOS / Noveltis / CLS, distributed by AVISO+",
            "url": "https://www.aviso.altimetry.fr/en/data/products/auxiliary-products/global-tide-fes.html",
            "product": "fes2014a_currents",
            "version": "FES2014a v1.2",
            "licence": {
                "name": "AVISO Licence Agreement Issue 20 (standard terms: previous FES release)",
                "url": "https://www.aviso.altimetry.fr/fileadmin/documents/data/License_Aviso.pdf",
                "read_at": "2026-09-19",
                "evidence": "Annex A note: only the latest FES release carries the non-commercial restriction",
            },
            "attribution": "FES2014 was produced by Noveltis, Legos and CLS and distributed by Aviso+, with support from Cnes (https://www.aviso.altimetry.fr/). Harmonic constants regridded and filtered by OhMyWind.",
            "citation": "Lyard F., Allain D., Cancet M., Carrère L., Picot N. (2021). FES2014 global ocean tide atlas: design and performance. Ocean Science, 17, 615-649. https://doi.org/10.5194/os-17-615-2021",
            "redistribution_of_derivative": "allowed with attribution (licence section 3.2 restricts only the unmodified original)",
        },
        "variables": ["u", "v"],
        "vertical": "depth_averaged",
        "datum": None,
        "units": {"u": "m s-1", "v": "m s-1", "phase": "degrees"},
        "phase_convention": "greenwich_utc",
        "time_reference": "UTC",
        "direction_convention": "going_to",
        "constituents_h": [],
        "constituents_u": names,
        "constituents_v": names,
        "confidence": "medium",
        "validity_bbox": None,
        "filter": {
            "min_speed_kt": min_speed_kt,
            "method": "max speed over 15 days hourly, all listed constituents",
        },
        "cells": int(idx.size),
        "tiles": n_tiles,
        "bbox": [
            float(lat_f[idx].min()),
            float(lon_f[idx].min()),
            float(lat_f[idx].max()),
            float(lon_f[idx].max()),
        ],
        "build_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "build_seconds": round(elapsed, 1),
        "builder": {
            "script": "scripts/build_fes_atlas.py",
            "git_commit": _git_commit(),
        },
        "inputs": inputs,
    }
    (output_dir / "metadata.json").write_text(
        json.dumps(meta, indent=2, ensure_ascii=False)
    )
    b = meta["bbox"]
    (output_dir / "coverage.geojson").write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {
                            "atlas": "FES_GLOBAL",
                            "rank": 0,
                            "resolution_m": 7000,
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
        f"wrote {n_tiles} tiles, {idx.size} cells to {output_dir} in {elapsed:.0f} s",
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
    parser.add_argument("--source-dir", type=Path, default=Path("build/fes"))
    parser.add_argument(
        "--output-dir", type=Path, default=Path("build/fes/atlas/FES_GLOBAL")
    )
    parser.add_argument("--constituents", default=",".join(DEFAULT_CONSTITUENTS))
    parser.add_argument("--min-speed-kt", type=float, default=0.2)
    parser.add_argument("--tile-deg", type=float, default=2.0)
    args = parser.parse_args(argv)
    build(
        args.source_dir,
        args.output_dir,
        [c.strip() for c in args.constituents.split(",") if c.strip()],
        args.min_speed_kt,
        args.tile_deg,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
