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
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import polars as pl
import xarray as xr
from openwind_data.currents.harmonic import _canonical
from openwind_data.currents.harmonic_analysis import max_reconstructed_speed

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


def _axes(ds: xr.Dataset) -> tuple[str, np.ndarray, np.ndarray]:
    lat_dim = "lat" if "lat" in ds.dims else "latitude"
    lon_dim = "lon" if "lon" in ds.dims else "longitude"
    return lat_dim, ds[lat_dim].values.astype(float), ds[lon_dim].values.astype(float)


def grid_axes(path: Path) -> tuple[np.ndarray, np.ndarray]:
    with xr.open_dataset(path) as ds:
        _, lat, lon = _axes(ds)
    return lat, lon


def read_band(path: Path, j0: int, j1: int) -> tuple[np.ndarray, np.ndarray]:
    """``(amp_ms, phase_deg)`` of latitude rows ``j0:j1`` from one FES current file."""
    with xr.open_dataset(path) as ds:
        amp_name = next(v for v in ds.data_vars if v.lower().endswith("a"))
        ph_name = next(v for v in ds.data_vars if v.lower().endswith("g"))
        lat_dim, _, _ = _axes(ds)
        amp = ds[amp_name].isel({lat_dim: slice(j0, j1)}).values.astype(np.float32)
        phase = ds[ph_name].isel({lat_dim: slice(j0, j1)}).values.astype(np.float32)
        units = str(ds[amp_name].attrs.get("units", "cm/s")).lower()
    if "cm" in units:
        amp /= 100.0
    return amp, phase


def _write_tiles(df: pl.DataFrame, output_dir: Path, tile_deg: float) -> int:
    keyed = df.with_columns(
        (pl.col("lat") / tile_deg).floor().alias("_tlat"),
        (pl.col("lon") / tile_deg).floor().alias("_tlon"),
    )
    n = 0
    for (tlat, tlon), tile in keyed.group_by(["_tlat", "_tlon"]):
        d = (
            output_dir
            / f"tile_lat={float(tlat) * tile_deg:.1f}"
            / f"tile_lon={float(tlon) * tile_deg:.1f}"
        )
        d.mkdir(parents=True, exist_ok=True)
        target = d / "data.parquet"
        if target.exists():  # a band edge inside a tile: append, never overwrite
            tile = pl.concat([pl.read_parquet(target), tile.drop(["_tlat", "_tlon"])])
        else:
            tile = tile.drop(["_tlat", "_tlon"])
        tile.write_parquet(target, compression="zstd")
        n += 1
    return n


def build(
    source_dir: Path,
    output_dir: Path,
    constituents: list[str],
    min_speed_kt: float,
    tile_deg: float,
    band_deg: float,
) -> dict:
    """Read the FES grid in latitude bands, filter, write the tiles of each band.

    The whole grid is 16.6 million cells: 16 constituents of amplitude and
    phase for two components would be 4 GB in memory and twice that during
    the reads, which is what killed the first attempt on a 15 GB machine.
    A band of ``band_deg`` (a multiple of ``tile_deg``, so no tile straddles
    two bands) costs a few hundred MB and the files are read piecewise.
    """
    t0 = time.perf_counter()
    names = [c for c in constituents if _canonical(c) is not None]
    if band_deg % tile_deg:
        raise ValueError(
            f"band_deg {band_deg} must be a multiple of tile_deg {tile_deg}"
        )
    files = {
        (comp, name): fes_file(source_dir, comp, name)
        for name in names
        for comp in ("eastward", "northward")
    }
    inputs = [
        {"file": str(path.relative_to(source_dir)), "sha256": _sha256(path)}
        for path in files.values()
    ]
    lat, lon = grid_axes(files[("eastward", names[0])])
    lon2 = np.where(lon > 180.0, lon - 360.0, lon)
    ni = lon.size
    m2 = names.index("M2")

    output_dir.mkdir(parents=True, exist_ok=True)
    for old in output_dir.glob("tile_lat=*"):
        for q in sorted(old.rglob("*"), reverse=True):
            q.unlink() if q.is_file() else q.rmdir()
        old.rmdir()

    n_tiles = n_cells = n_sea = 0
    bbox = [90.0, 180.0, -90.0, -180.0]
    edges = np.arange(-90.0, 90.0 + band_deg, band_deg)
    for b0, b1 in zip(edges[:-1], edges[1:], strict=True):
        rows = np.where((lat >= b0) & (lat < b1))[0]
        if rows.size == 0:
            continue
        j0, j1 = int(rows.min()), int(rows.max()) + 1
        width = (j1 - j0) * ni
        ua, ug, va, vg = (
            np.empty((len(names), width), dtype=np.float32) for _ in range(4)
        )
        for k, name in enumerate(names):
            a, g = read_band(files[("eastward", name)], j0, j1)
            ua[k], ug[k] = a.ravel(), g.ravel()
            a, g = read_band(files[("northward", name)], j0, j1)
            va[k], vg[k] = a.ravel(), g.ravel()
        valid = np.isfinite(ua).all(axis=0) & np.isfinite(va).all(axis=0) & (ua[m2] > 0)
        n_sea += int(valid.sum())
        if not valid.any():
            print(f"  band {b0:+.0f}..{b1:+.0f}: no sea cell", file=sys.stderr)
            continue
        speed = max_reconstructed_speed(ua, ug, va, vg, names)
        keep = valid & np.isfinite(speed) & (speed * MS_TO_KN >= min_speed_kt)
        idx = np.where(keep)[0]
        if idx.size == 0:
            print(
                f"  band {b0:+.0f}..{b1:+.0f}: nothing above {min_speed_kt} kt",
                file=sys.stderr,
            )
            continue
        lon_grid, lat_grid = np.meshgrid(lon2, lat[j0:j1])
        lat_f, lon_f = lat_grid.ravel()[idx], lon_grid.ravel()[idx]
        cols: dict[str, np.ndarray] = {
            "lat": lat_f.astype(np.float64),
            "lon": lon_f.astype(np.float64),
            "max_speed_kn": (speed[idx] * MS_TO_KN).astype(np.float32),
        }
        for k, name in enumerate(names):
            cols[f"{name}_u_amp"] = ua[k, idx]
            cols[f"{name}_u_g"] = ug[k, idx]
            cols[f"{name}_v_amp"] = va[k, idx]
            cols[f"{name}_v_g"] = vg[k, idx]
        n_tiles += _write_tiles(pl.DataFrame(cols), output_dir, tile_deg)
        n_cells += int(idx.size)
        bbox = [
            min(bbox[0], float(lat_f.min())),
            min(bbox[1], float(lon_f.min())),
            max(bbox[2], float(lat_f.max())),
            max(bbox[3], float(lon_f.max())),
        ]
        print(
            f"  band {b0:+.0f}..{b1:+.0f}: {int(valid.sum())} sea cells, "
            f"{idx.size} kept ({time.perf_counter() - t0:.0f} s)",
            file=sys.stderr,
        )
        del ua, ug, va, vg, speed, cols
    print(
        f"{n_cells} cells above {min_speed_kt} kt of {n_sea} sea cells "
        f"({100 * n_cells / max(1, n_sea):.1f} %)",
        file=sys.stderr,
    )
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
        "cells": n_cells,
        "tiles": n_tiles,
        "bbox": bbox,
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
        f"wrote {n_tiles} tiles, {n_cells} cells to {output_dir} in {elapsed:.0f} s",
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
    parser.add_argument(
        "--band-deg", type=float, default=30.0, help="latitude band read at once"
    )
    args = parser.parse_args(argv)
    build(
        args.source_dir,
        args.output_dir,
        [c.strip() for c in args.constituents.split(",") if c.strip()],
        args.min_speed_kt,
        args.tile_deg,
        args.band_deg,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
