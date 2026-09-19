#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars
# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "eccodes>=2.37",
#   "numpy>=1.26",
#   "polars>=1.0",
#   "pyarrow>=16",
#   "openwind-data",
# ]
#
# [tool.uv.sources]
# openwind-data = { path = "../packages/data-adapters", editable = true }
# ///
"""Build a harmonic current atlas from an archive of BSH forecasts.

Reads the GRIB2 files archived by ``scripts/archive_bsh_currents.py`` for one
area, stitches them into one series per grid cell (for every 15-minute
instant, the forecast with the shortest lead time wins), fits tidal
constants with :class:`openwind_data.currents.harmonic_analysis.GridAnalysis`
and writes the source-agnostic atlas layout described in
``docs/harmonic_atlas_format.md``: 0.5 degree Parquet tiles, ``metadata.json``
and ``coverage.geojson``.

The record length decides what can be fitted (Rayleigh criterion). Below a
fortnight, ``S2`` cannot be told from ``M2``; below a month, neither can
``N2``. Those are then **inferred**: tied to their resolved partner by the
amplitude ratio and phase lag read from a reference atlas (MARC ATLNE, 2 km,
which covers the German Bight) at the nearest sea cell to the area's centre.
``metadata.json`` records which constituents were fitted and which were
inferred, so a reader can tell a three-day bootstrap from a one-year build.

Source facts (FTP README, read 2026-09-19): u/v in m/s, GRIB2 discipline 10,
category 1, parameter numbers 2 (east) and 3 (north), uppermost model layer
(0 to 5 m average), regular lat/lon grid, values every 15 minutes, licence
CC BY 4.0, attribution "Data provided by Bundesamt fuer Seeschifffahrt und
Hydrographie (BSH), CC BY 4.0".

Usage::

    uv run scripts/build_bsh_atlas.py --area CuxBru \\
        --archive-dir build/bsh/archive --output-dir build/bsh/atlas/BSH_CUXBRU \\
        --reference-atlas-dir build/marc

``--exclude-run 2026091900`` leaves one run out for validation.
"""

from __future__ import annotations

import argparse
import bz2
import hashlib
import json
import re
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

import eccodes as ec
import numpy as np
import polars as pl
from openwind_data.currents.harmonic_analysis import (
    GridAnalysis,
    Inference,
    inferences_from_reference,
    select_constituents,
)

_NAME_RE = re.compile(
    r"^Current_(?P<area>[A-Za-z]+)_(?P<run>\d{10})_(?P<day>\d{2})\.grb2(\.bz2)?$"
)
_MISSING_THRESHOLD = 9000.0  # BSH packs missing as 9999; currents never reach 9000 m/s
_PARAM_U, _PARAM_V = 2, 3
_TILE_DEG = 0.5

# What a shelf-sea current atlas should carry, in the order the Rayleigh
# selection tries them. Everything not resolved but present here is a
# candidate for inference from the reference atlas.
WANTED: tuple[str, ...] = (
    "M2", "S2", "N2", "K1", "O1", "M4", "MS4", "K2", "P1", "Q1", "MN4", "M6",
    "2N2", "NU2", "MU2", "L2", "2MS6", "MK4",
)  # fmt: skip

AREA_INFO: dict[str, dict[str, object]] = {
    "AusAlt": {"label": "Aussenelbe bis Altenbruch", "resolution_m": 90, "rank": 3},
    "CuxBru": {"label": "Cuxhaven bis Brunsbuettel", "resolution_m": 90, "rank": 3},
    "BruPag": {"label": "Brunsbuettel bis Pagensand", "resolution_m": 90, "rank": 3},
    "PagHam": {"label": "Pagensand bis Hamburg", "resolution_m": 90, "rank": 3},
    "idb": {"label": "Innere Deutsche Bucht", "resolution_m": 926, "rank": 1},
    "db": {"label": "Deutsche Bucht", "resolution_m": 926, "rank": 1},
    "nfi": {"label": "Nordfriesische Inseln", "resolution_m": 926, "rank": 1},
    "ofi": {"label": "Ostfriesische Inseln", "resolution_m": 926, "rank": 1},
    "no": {"label": "Nordsee", "resolution_m": 5556, "rank": 0},
}


@dataclass(frozen=True)
class ArchivedFile:
    path: Path
    area: str
    run: datetime  # analysis time of the DWD forecast (UTC)
    day: int  # forecast day relative to the run's day

    @property
    def first_valid(self) -> datetime:
        """00:15 UTC of the day this file covers.

        BSH numbers the files per run, not per calendar day: the 00 UTC run
        ships ``_00`` for its own day, the 12 UTC run ships ``_01`` for its own
        day (its first twelve hours are then a hindcast). Checked on the
        message validity times on 2026-09-19; :func:`read_file` re-checks
        every file against this rule and refuses a mismatch.
        """
        day0 = self.run.replace(hour=0, minute=0)
        offset = self.day - (1 if self.run.hour >= 12 else 0)
        return day0 + timedelta(days=offset, minutes=15)

    def valid_times(self) -> list[datetime]:
        return [self.first_valid + timedelta(minutes=15 * k) for k in range(96)]


def scan_archive(
    archive_dir: Path, area: str, exclude_runs: set[str]
) -> list[ArchivedFile]:
    found: list[ArchivedFile] = []
    for path in sorted(archive_dir.rglob("Current_*.grb2*")):
        m = _NAME_RE.match(path.name)
        if m is None or m["area"] != area or m["run"] in exclude_runs:
            continue
        run = datetime.strptime(m["run"], "%Y%m%d%H").replace(tzinfo=UTC)
        found.append(ArchivedFile(path, area, run, int(m["day"])))
    return found


def choose_best_lead(
    files: list[ArchivedFile], exclude_dates: set[str] = frozenset()
) -> dict[datetime, ArchivedFile]:
    """For every instant, the file whose forecast lead is shortest.

    ``exclude_dates`` (``YYYY-MM-DD``, UTC) drops whole days from the fit so
    they can serve as a hold-out; the 24:00 instant belongs to the day it
    closes.
    """
    best: dict[datetime, tuple[float, ArchivedFile]] = {}
    for f in files:
        for t in f.valid_times():
            if (t - timedelta(minutes=1)).strftime("%Y-%m-%d") in exclude_dates:
                continue
            lead_h = (t - f.run).total_seconds() / 3600.0
            if t not in best or lead_h < best[t][0]:
                best[t] = (lead_h, f)
    return {t: f for t, (_, f) in sorted(best.items())}


@dataclass(frozen=True)
class Grid:
    lats: np.ndarray  # (nj,)
    lons: np.ndarray  # (ni,)

    @property
    def shape(self) -> tuple[int, int]:
        return (self.lats.size, self.lons.size)


def _grid_from_message(gid: int) -> Grid:
    ni, nj = ec.codes_get(gid, "Ni"), ec.codes_get(gid, "Nj")
    lat0 = ec.codes_get(gid, "latitudeOfFirstGridPointInDegrees")
    lon0 = ec.codes_get(gid, "longitudeOfFirstGridPointInDegrees")
    dlat = ec.codes_get(gid, "jDirectionIncrementInDegrees")
    dlon = ec.codes_get(gid, "iDirectionIncrementInDegrees")
    if not ec.codes_get(gid, "jScansPositively"):
        dlat = -dlat
    if ec.codes_get(gid, "iScansNegatively"):
        dlon = -dlon
    return Grid(lat0 + dlat * np.arange(nj), lon0 + dlon * np.arange(ni))


def read_file(
    path: Path, wanted: set[datetime]
) -> tuple[Grid, dict[datetime, dict[int, np.ndarray]]]:
    """Decode the messages of one file whose valid time is in ``wanted``."""
    if path.suffix == ".bz2":
        with bz2.open(path) as fh:
            raw = fh.read()
    else:
        raw = path.read_bytes()
    out: dict[datetime, dict[int, np.ndarray]] = {}
    grid: Grid | None = None
    with tempfile.NamedTemporaryFile(suffix=".grb2") as tmp:
        tmp.write(raw)
        tmp.flush()
        with open(tmp.name, "rb") as fh:
            while True:
                gid = ec.codes_grib_new_from_file(fh)
                if gid is None:
                    break
                try:
                    date, hhmm = (
                        ec.codes_get(gid, "validityDate"),
                        ec.codes_get(gid, "validityTime"),
                    )
                    t = datetime.strptime(f"{date}{hhmm:04d}", "%Y%m%d%H%M").replace(
                        tzinfo=UTC
                    )
                    param = ec.codes_get(gid, "parameterNumber")
                    if t not in wanted or param not in (_PARAM_U, _PARAM_V):
                        continue
                    if grid is None:
                        grid = _grid_from_message(gid)
                    vals = np.asarray(ec.codes_get_values(gid), dtype=np.float32)
                    vals[vals >= _MISSING_THRESHOLD] = np.nan
                    out.setdefault(t, {})[param] = vals.reshape(grid.shape)
                finally:
                    ec.codes_release(gid)
    missing = sorted(wanted - set(out))
    if grid is None or missing:
        raise ValueError(
            f"{path.name}: {len(missing)} wanted instants absent "
            f"(first {missing[0].isoformat() if missing else 'n/a'}); file naming rule broken?"
        )
    return grid, out


def reference_constants(
    reference_dir: Path | None, lat: float, lon: float
) -> tuple[dict, dict, str]:
    """``(u_constants, v_constants, label)`` from the reference atlas nearest to (lat, lon)."""
    if reference_dir is None:
        return {}, {}, "none"
    from openwind_data.currents.marc_atlas import MarcAtlasRegistry

    registry = MarcAtlasRegistry.from_directory(reference_dir)
    cell = registry.cell_at(lat, lon)
    if cell is None:
        return {}, {}, "none"
    return (
        cell.u_constants,
        cell.v_constants,
        f"{cell.atlas_name} cell ({cell.lat:.4f}, {cell.lon:.4f})",
    )


def build(
    area: str,
    archive_dir: Path,
    output_dir: Path,
    reference_dir: Path | None,
    exclude_runs: set[str],
    rayleigh: float,
    inference: bool,
    exclude_dates: set[str] = frozenset(),
) -> dict:
    t0 = time.perf_counter()
    files = scan_archive(archive_dir, area, exclude_runs)
    if not files:
        sys.exit(f"no archived file for area {area!r} under {archive_dir}")
    plan = choose_best_lead(files, exclude_dates)
    if not plan:
        sys.exit(f"no instant left to fit for area {area!r}")
    times = list(plan)
    record_hours = (times[-1] - times[0]).total_seconds() / 3600.0
    print(
        f"[{area}] {len(files)} files, {len(times)} instants, record {record_hours:.1f} h"
    )

    resolved = select_constituents(record_hours, WANTED, rayleigh=rayleigh)
    print(f"[{area}] resolvable at rayleigh={rayleigh}: {resolved}")

    # First file decides the grid; every file of an area shares it.
    by_file: dict[Path, list[datetime]] = {}
    for t, f in plan.items():
        by_file.setdefault(f.path, []).append(t)
    first_path = next(iter(by_file))
    grid, _ = read_file(first_path, {by_file[first_path][0]})
    nj, ni = grid.shape
    n_cells = nj * ni
    centre_lat, centre_lon = float(grid.lats.mean()), float(grid.lons.mean())

    ref_u, ref_v, ref_label = reference_constants(reference_dir, centre_lat, centre_lon)
    inf_u: tuple[Inference, ...] = ()
    inf_v: tuple[Inference, ...] = ()
    if inference and ref_u and ref_v:
        inf_u = inferences_from_reference(ref_u, resolved, WANTED)
        inf_v = inferences_from_reference(ref_v, resolved, WANTED)
        print(
            f"[{area}] inferred from {ref_label}: u={[i.name for i in inf_u]} v={[i.name for i in inf_v]}"
        )

    ga_u = GridAnalysis(n_cells, resolved, inf_u)
    ga_v = GridAnalysis(n_cells, resolved, inf_v)
    inputs: list[dict] = []
    n_read = 0
    for path, wanted_times in by_file.items():
        g, msgs = read_file(path, set(wanted_times))
        if g.shape != grid.shape:
            raise ValueError(f"{path.name}: grid {g.shape} differs from {grid.shape}")
        ts = sorted(msgs)
        u = np.stack([msgs[t][_PARAM_U].ravel() for t in ts])
        v = np.stack([msgs[t][_PARAM_V].ravel() for t in ts])
        ga_u.add(ts, u)
        ga_v.add(ts, v)
        n_read += len(ts)
        inputs.append(
            {"file": path.name, "sha256": _sha256(path), "instants_used": len(ts)}
        )
        print(f"[{area}] {path.name}: {len(ts)} instants")
    res_u = ga_u.solve(min_samples=max(24, 2 * ga_u.p))
    res_v = ga_v.solve(min_samples=max(24, 2 * ga_v.p))

    valid = np.isfinite(res_u.amp[0]) & np.isfinite(res_v.amp[0])
    print(
        f"[{area}] {int(valid.sum())} / {n_cells} cells fitted, {n_read} instants read"
    )

    lat2d, lon2d = np.meshgrid(grid.lats, grid.lons, indexing="ij")
    cols: dict[str, np.ndarray] = {
        "lat": lat2d.ravel()[valid].astype(np.float64),
        "lon": lon2d.ravel()[valid].astype(np.float64),
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
    n_tiles = 0
    tile_boxes: list[tuple[float, float]] = []
    keyed = df.with_columns(
        (pl.col("lat") / _TILE_DEG).floor().alias("_tlat"),
        (pl.col("lon") / _TILE_DEG).floor().alias("_tlon"),
    )
    for (tlat, tlon), tile in keyed.group_by(["_tlat", "_tlon"]):
        lat_o, lon_o = float(tlat) * _TILE_DEG, float(tlon) * _TILE_DEG
        tile_dir = output_dir / f"tile_lat={lat_o:.1f}" / f"tile_lon={lon_o:.1f}"
        tile_dir.mkdir(parents=True, exist_ok=True)
        tile.drop(["_tlat", "_tlon"]).write_parquet(
            tile_dir / "data.parquet", compression="zstd"
        )
        tile_boxes.append((lat_o, lon_o))
        n_tiles += 1

    info = AREA_INFO.get(area, {"label": area, "resolution_m": 0, "rank": 1})
    atlas_id = f"BSH_{area.upper()}"
    lat_min, lat_max = float(cols["lat"].min()), float(cols["lat"].max())
    lon_min, lon_max = float(cols["lon"].min()), float(cols["lon"].max())
    elapsed = time.perf_counter() - t0
    meta = {
        "format": "ohmywind-harmonic-atlas",
        "schema_version": 3,
        "atlas": atlas_id,
        "label": info["label"],
        "rank": info["rank"],
        "resolution_m": info["resolution_m"],
        "effective_resolution_m": info["resolution_m"],
        "grid": {
            "type": "regular_ll",
            "dlat_deg": float(grid.lats[1] - grid.lats[0])
            if grid.lats.size > 1
            else None,
            "dlon_deg": float(grid.lons[1] - grid.lons[0])
            if grid.lons.size > 1
            else None,
            "origin": "native",
        },
        "source": {
            "short": "bsh",
            "name": "BSH Stroemungsvorhersagen (operational surface-current forecast)",
            "provider": "Bundesamt fuer Seeschifffahrt und Hydrographie",
            "url": "ftp://ftp.bsh.de/Stroemungsvorhersagen/",
            "product": f"Current_{area}",
            "licence": {
                "name": "CC BY 4.0",
                "url": "https://creativecommons.org/licenses/by/4.0/",
                "read_at": "2026-09-19",
                "evidence": "ftp://ftp.bsh.de/Stroemungsvorhersagen/LICENSE.txt",
            },
            "attribution": "Data provided by Bundesamt fuer Seeschifffahrt und Hydrographie (BSH), CC BY 4.0. Harmonic constants derived by OhMyWind (changes: harmonic analysis of the forecast series).",
            "citation": None,
            "redistribution_of_derivative": "allowed with attribution",
        },
        "variables": ["u", "v"],
        "vertical": "surface_0_5m_mean",
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
            "record_start": times[0].isoformat(),
            "record_end": times[-1].isoformat(),
            "record_hours": round(record_hours, 2),
            "instants": len(times),
            "step_minutes": 15,
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
            "excluded_runs": sorted(exclude_runs),
            "excluded_dates": sorted(exclude_dates),
            "mean_is_weather": record_hours < 24 * 30,
        },
        "cells": int(valid.sum()),
        "tiles": n_tiles,
        "bbox": [lat_min, lon_min, lat_max, lon_max],
        "build_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "build_seconds": round(elapsed, 1),
        "builder": {
            "script": "scripts/build_bsh_atlas.py",
            "git_commit": _git_commit(),
        },
        "inputs": inputs,
    }
    (output_dir / "metadata.json").write_text(json.dumps(meta, indent=2))
    (output_dir / "coverage.geojson").write_text(
        json.dumps(
            _coverage(atlas_id, info, lat_min, lon_min, lat_max, lon_max, tile_boxes)
        )
    )
    print(f"[{area}] wrote {n_tiles} tiles to {output_dir} in {elapsed:.1f} s")
    return meta


def _coverage(atlas_id, info, lat_min, lon_min, lat_max, lon_max, tile_boxes) -> dict:
    """Feature 0 is the bbox (what the runtime reads); feature 1 the tiles with data."""
    box = [
        [lon_min, lat_min],
        [lon_max, lat_min],
        [lon_max, lat_max],
        [lon_min, lat_max],
        [lon_min, lat_min],
    ]
    tiles = [
        [
            [lo, la],
            [lo + _TILE_DEG, la],
            [lo + _TILE_DEG, la + _TILE_DEG],
            [lo, la + _TILE_DEG],
            [lo, la],
        ]
        for la, lo in sorted(tile_boxes)
    ]
    props = {
        "atlas": atlas_id,
        "rank": info["rank"],
        "resolution_m": info["resolution_m"],
    }
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {**props, "kind": "bbox"},
                "geometry": {"type": "Polygon", "coordinates": [box]},
            },
            {
                "type": "Feature",
                "properties": {**props, "kind": "tiles"},
                "geometry": {
                    "type": "MultiPolygon",
                    "coordinates": [[t] for t in tiles],
                },
            },
        ],
    }


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
    parser.add_argument(
        "--area", required=True, help="BSH area code, e.g. CuxBru or idb"
    )
    parser.add_argument("--archive-dir", type=Path, default=Path("build/bsh/archive"))
    parser.add_argument("--output-dir", type=Path, default=None)
    parser.add_argument("--reference-atlas-dir", type=Path, default=Path("build/marc"))
    parser.add_argument(
        "--exclude-run", action="append", default=[], help="YYYYMMDDHH run to leave out"
    )
    parser.add_argument(
        "--exclude-date",
        action="append",
        default=[],
        help="YYYY-MM-DD (UTC) day to hold out",
    )
    parser.add_argument("--rayleigh", type=float, default=1.0)
    parser.add_argument("--no-inference", action="store_true")
    args = parser.parse_args(argv)
    output_dir = args.output_dir or Path("build/bsh/atlas") / f"BSH_{args.area.upper()}"
    reference = args.reference_atlas_dir if args.reference_atlas_dir.exists() else None
    build(
        args.area,
        args.archive_dir,
        output_dir,
        reference,
        set(args.exclude_run),
        args.rayleigh,
        not args.no_inference,
        set(args.exclude_date),
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
