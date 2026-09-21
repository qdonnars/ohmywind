#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars
# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "xarray>=2024.1",
#   "netCDF4>=1.6",
#   "h5py>=3.10",
#   "httpx>=0.27",
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
"""Build a harmonic current atlas from a NOAA NOS Operational Forecast System.

Source: the keyless AWS Open Data bucket ``noaa-nos-ofs-pds`` (NOAA Open Data
Dissemination, historical retention since 2022), read by plain HTTPS. One
system at a time; the first one wired is **SSCOFS** (Salish Sea and
Northwest Straits, FVCOM 4.4.7 unstructured grid, 433 410 triangles, 10
sigma layers, hourly). Every nowcast hour is one whole-domain 3D NetCDF-4
file of 210 MB, uncompressed, under
``<system>/netcdf/YYYY/MM/DD/<system>.tHHz.YYYYMMDD.fields.nNNN.nc`` with four
cycles a day (03, 09, 15, 21 UTC) and ``n001`` to ``n006`` covering the six
hours before the cycle (``n000`` repeats the previous cycle's last hour;
``f000`` to ``f072`` are forecast hours and are never read here).

Because the files are uncompressed and chunked ``[1, 4, nele]`` blocks, the
surface layer of ``u`` and ``v`` sits in three known byte ranges per
variable. The download step reads one whole file as a template (byte
offsets, element centroids, connectivity), then fetches, for every hour, only
those ranges plus ``time`` and ``wet_cells`` with HTTP ``Range`` requests
(about 5 MB instead of 210 MB), keeps the elements inside ``--bbox`` and
writes one NetCDF per day in ``--source-dir``. Each file is checked by its
size and by the timestamp read at the template's offset; a file whose layout
differs is downloaded whole and read locally.

**ROMS systems** (``--system gomofs``, ``cbofs``, ``ciofs``, ``dbofs``, ``tbofs``)
take a second download path. Their native grid is a curvilinear Arakawa C
grid: ``u`` on u-points (``[eta_rho, xi_u]``), ``v`` on v-points
(``[eta_v, xi_rho]``), both along the grid axes, which are rotated from east
by ``angle`` (32.0 degrees on GoMOFS). GoMOFS publishes hourly surface-only
``2ds`` files (``u_sur`` / ``v_sur``, one uncompressed chunk per field) with
cycles 00 / 06 / 12 / 18; the other ROMS systems only publish 3D ``fields``
files whose surface is the last ``s_rho`` index, chunked in uncompressed
``[1, k, rows, cols]`` blocks. In both cases the surface rows of the box are
contiguous inside each chunk and are fetched by ``Range``; the template file
carries ``lon_rho`` / ``lat_rho``, ``angle``, ``mask_rho``, ``h``, ``pm`` and
``pn``. ``u`` and ``v`` are averaged onto rho points over their open faces
(masked faces ignored), rotated to east / north with ``angle``, masked cells
are land and ``wetdry_mask_rho == 0`` hours (when the file has it) are holes.
The daily files then have exactly the FVCOM layout (``u``, ``v``, ``wet`` on
``[time, cell]`` with ``lonc``, ``latc``, ``edge_m`` = the local pitch) and the
build step does not care which model produced them.

The build step is the same as ``build_norkyst_atlas.py``: streaming
:class:`GridAnalysis` on the native elements (Rayleigh selection on the total
span, K2 / P1 inferred from a reference atlas at the domain centre when one
answers there, or from the published constituents of a CO-OPS current
station with ``--reference-harcon``), nearest-neighbour resampling onto a
regular lat/lon grid
(``--dlat-deg`` x ``--dlon-deg``, 200 m by default because the median
triangle edge in Puget Sound is 163 m), cells whose reconstructed tidal
current never reaches ``--min-speed-kt`` dropped, tiles in the standard
layout (``docs/harmonic_atlas_format.md``, ``grid.origin = "regrid"``).

Licence (read 2026-09-21): https://registry.opendata.aws/noaa-ofs/ says
"NOAA data disseminated through NODD are open to the public and can be used
as desired. [...] NOAA requests attribution for the use or dissemination of
unaltered NOAA data. [...] If you modify NOAA data, you may not state or
imply that it is original, unaltered NOAA data."
https://tidesandcurrents.noaa.gov/disclaimers.html says "The information on
government servers are in the public domain, unless specifically annotated
otherwise, and may be used freely by the public." (US government work,
17 U.S.C. 105).

Usage::

    uv run scripts/build_ofs_atlas.py --download --no-build --system sscofs \\
        --start 2026-08-19 --days 32 --bbox 47.2 -123.2 48.5 -122.2 \\
        --source-dir build/ofs/sscofs --zone salish
    uv run scripts/build_ofs_atlas.py --system sscofs --source-dir build/ofs/sscofs \\
        --zone salish --atlas-id SSCOFS_SALISH --output-dir build/ofs/sscofs/atlas/SSCOFS_SALISH
    uv run scripts/build_ofs_atlas.py --download --no-build --system gomofs \\
        --start 2026-08-19 --days 32 --bbox 44.4 -67.3 45.7 -63.3 \\
        --source-dir build/ofs/gomofs --zone fundy
    uv run scripts/build_ofs_atlas.py --system gomofs --source-dir build/ofs/gomofs \\
        --zone fundy --atlas-id GOMOFS_FUNDY --bbox 44.4 -67.3 45.7 -63.3 \\
        --resolution-m 700 --dlat-deg 0.0063 --dlon-deg 0.0089
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

import httpx
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

BUCKET_URL = "https://noaa-nos-ofs-pds.s3.amazonaws.com/"
REGISTRY_URL = "https://registry.opendata.aws/noaa-ofs/"
DISCLAIMER_URL = "https://tidesandcurrents.noaa.gov/disclaimers.html"
LICENCE_READ_AT = "2026-09-21"
HARCON_URL = (
    "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/"
    "{station}/harcon.json?bin={bin}"
)
OFS_EPOCH = datetime(2018, 1, 1, tzinfo=UTC)  # ``time`` units of the FVCOM files
CYCLES = (3, 9, 15, 21)
NOWCAST_HOURS = (1, 2, 3, 4, 5, 6)
ROMS_FILL = 1e30  # ``_FillValue`` is 1e37 on masked u / v points
ROMS_STAGGERING = (
    "u on u-points and v on v-points averaged onto rho points over their open"
    " faces (masked faces ignored), then rotated to east / north by ``angle``"
)

# Per system: the human name, the model (FVCOM: velocities on element
# centroids ``lonc`` / ``latc``, dimension ``nele``, ``siglay`` layers; ROMS:
# curvilinear C grid, ``u`` / ``v`` staggered and rotated by ``angle``), the
# nowcast cycles of the day and the product whose files carry the surface
# velocity (``fields`` is 3D, ``2ds`` is surface only). Cycles and products
# read on the bucket listing of 2026-09-19 for sscofs, gomofs, cbofs and
# ciofs, on the inventory of 2026-09-20 (spike section 6) for the others.
SYSTEMS: dict[str, dict] = {
    "sscofs": {
        "name": "Salish Sea and Northwest Straits Operational Forecast System",
        "model": "FVCOM",
        "cycles": CYCLES,
        "product": "fields",
    },
    "ngofs2": {
        "name": "Northern Gulf of Mexico Operational Forecast System",
        "model": "FVCOM",
        "cycles": CYCLES,
        "product": "fields",
    },
    "sfbofs": {
        "name": "San Francisco Bay Operational Forecast System",
        "model": "FVCOM",
        "cycles": CYCLES,
        "product": "fields",
    },
    "leofs": {
        "name": "Lake Erie Operational Forecast System",
        "model": "FVCOM",
        "cycles": (0, 6, 12, 18),
        "product": "fields",
    },
    "lmhofs": {
        "name": "Lake Michigan and Huron Operational Forecast System",
        "model": "FVCOM",
        "cycles": (0, 6, 12, 18),
        "product": "fields",
    },
    "loofs": {
        "name": "Lake Ontario Operational Forecast System",
        "model": "FVCOM",
        "cycles": (0, 6, 12, 18),
        "product": "fields",
    },
    "lsofs": {
        "name": "Lake Superior Operational Forecast System",
        "model": "FVCOM",
        "cycles": (0, 6, 12, 18),
        "product": "fields",
    },
    "necofs": {
        "name": "Northeast Coastal Ocean Forecast System",
        "model": "FVCOM",
        "cycles": CYCLES,
        "product": "fields",
    },
    "gomofs": {
        "name": "Gulf of Maine Operational Forecast System",
        "model": "ROMS",
        "cycles": (0, 6, 12, 18),
        "product": "2ds",
    },
    "cbofs": {
        "name": "Chesapeake Bay Operational Forecast System",
        "model": "ROMS",
        "cycles": (0, 6, 12, 18),
        "product": "fields",
    },
    "ciofs": {
        "name": "Cook Inlet Operational Forecast System",
        "model": "ROMS",
        "cycles": (0, 6, 12, 18),
        "product": "fields",
    },
    "dbofs": {
        "name": "Delaware Bay Operational Forecast System",
        "model": "ROMS",
        "cycles": (0, 6, 12, 18),
        "product": "fields",
    },
    "tbofs": {
        "name": "Tampa Bay Operational Forecast System",
        "model": "ROMS",
        "cycles": (0, 6, 12, 18),
        "product": "fields",
    },
}


def _parse_epoch(units: str) -> datetime:
    """``seconds since 2016-01-01 00:00:00`` -> aware datetime."""
    stamp = units.split("since", 1)[1].strip().replace("T", " ")
    return datetime.fromisoformat(stamp).replace(tzinfo=UTC)


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


def harcon_constants(spec: str) -> tuple[dict, dict, str]:
    """``u`` / ``v`` constants (m/s, Greenwich degrees) of a CO-OPS current station.

    ``spec`` is ``STATION:BIN`` (``PUG1616:31``). The keyless metadata API
    publishes, per constituent and depth bin, the amplitude along the major
    axis (cm/s), its Greenwich phase and the axis azimuth (compass degrees):
    the amplitude is projected on east and north, the minor axis ignored.
    Only ratios and lags between constituents are used (K2 from S2, P1 from
    K1, ...), for which the projection cancels out.
    """
    station, _, bin_ = spec.partition(":")
    url = HARCON_URL.format(station=station, bin=bin_ or "1")
    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        r = client.get(url)
        r.raise_for_status()
        data = r.json()
    u: dict[str, tuple[float, float]] = {}
    v: dict[str, tuple[float, float]] = {}
    for c in data["HarmonicConstituents"]:
        amp = float(c["majorAmplitude"]) / 100.0
        g = float(c["majorPhaseGMT"])
        az = np.deg2rad(float(c["azi"]))
        for comp, out in ((float(np.sin(az)), u), (float(np.cos(az)), v)):
            if amp * abs(comp) <= 0.0:
                continue
            out[c["constituentName"]] = (
                amp * abs(comp),
                (g + (180.0 if comp < 0.0 else 0.0)) % 360.0,
            )
    return u, v, f"CO-OPS station {station} bin {bin_} ({url})"


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------


def object_key(system: str, cycle: datetime, hour: int) -> str:
    product = SYSTEMS.get(system, {}).get("product", "fields")
    return (
        f"{system}/netcdf/{cycle:%Y/%m/%d}/"
        f"{system}.t{cycle:%H}z.{cycle:%Y%m%d}.{product}.n{hour:03d}.nc"
    )


def nowcast_slots(
    day: datetime, cycles: tuple[int, ...] = CYCLES
) -> list[tuple[datetime, int, datetime]]:
    """``(cycle, nowcast hour, valid time)`` for the 24 hours of ``day``.

    Cycle ``tHHz`` carries ``n001`` .. ``n006`` valid at ``HH-5`` .. ``HH``
    UTC, so a UTC day is the four cycles of that date: 03, 09, 15 and 21
    (SSCOFS, 22:00 the day before to 21:00) or 00, 06, 12 and 18 (GoMOFS,
    19:00 the day before to 18:00).
    """
    slots = []
    for c in cycles:
        cycle = day.replace(hour=c, minute=0, second=0, microsecond=0)
        for n in NOWCAST_HOURS:
            slots.append((cycle, n, cycle - timedelta(hours=6 - n)))
    return slots


def _get(
    client: httpx.Client, url: str, rng: tuple[int, int] | None, attempts: int = 6
) -> httpx.Response:
    """GET with an optional byte range ``[start, stop)``; retries with backoff."""
    headers = {"Range": f"bytes={rng[0]}-{rng[1] - 1}"} if rng else {}
    delay = 3.0
    for k in range(attempts):
        try:
            r = client.get(url, headers=headers)
            if r.status_code in (200, 206):
                if rng and len(r.content) != rng[1] - rng[0]:
                    raise OSError(f"short read {len(r.content)} of {rng[1] - rng[0]}")
                return r
            if r.status_code == 404:
                raise FileNotFoundError(url)
            raise OSError(f"HTTP {r.status_code}")
        except FileNotFoundError:
            raise
        except (httpx.HTTPError, OSError) as exc:
            if k == attempts - 1:
                raise
            print(
                f"  {url.rsplit('/', 1)[-1]}: {exc!r}, retry in {delay:.0f} s",
                file=sys.stderr,
            )
            time.sleep(delay)
            delay *= 2.0
    raise AssertionError("unreachable")


def download_whole(client: httpx.Client, url: str, out: Path) -> None:
    tmp = out.with_suffix(".part")
    delay = 3.0
    for k in range(6):
        try:
            with client.stream("GET", url) as r:
                if r.status_code == 404:
                    raise FileNotFoundError(url)
                r.raise_for_status()
                with tmp.open("wb") as fh:
                    for chunk in r.iter_bytes(1 << 20):
                        fh.write(chunk)
            tmp.rename(out)
            return
        except FileNotFoundError:
            raise
        except (httpx.HTTPError, OSError) as exc:
            if k == 5:
                raise
            print(f"  {out.name}: {exc!r}, retry in {delay:.0f} s", file=sys.stderr)
            time.sleep(delay)
            delay *= 2.0


def _chunk_ranges(dset, layer: int) -> list[tuple[int, int, int]]:
    """``(byte_offset, byte_length, first_element)`` of ``layer`` in each chunk.

    FVCOM writes ``u[time, siglay, nele]`` in ``[1, k, n]`` chunks without
    compression, so inside a chunk the rows are laid out layer after layer
    and the surface row is the first ``n * 4`` bytes.
    """
    _, k, n = dset.chunks
    itemsize = dset.dtype.itemsize
    ranges = []
    for i in range(dset.id.get_num_chunks()):
        ci = dset.id.get_chunk_info(i)
        _, lay0, ele0 = ci.chunk_offset
        if not (lay0 <= layer < lay0 + k):
            continue
        n_here = min(n, dset.shape[2] - ele0)
        row = layer - lay0
        ranges.append((ci.byte_offset + row * n * itemsize, n_here * itemsize, ele0))
    return sorted(ranges, key=lambda r: r[2])


def _text(value) -> str:
    return value.decode() if isinstance(value, bytes) else str(value)


def read_template(path: Path, bbox: list[float], layer: int) -> dict:
    """Byte layout and box geometry from one whole native file (h5py)."""
    import h5py

    with h5py.File(path, "r") as f:
        lonc = f["lonc"][:].astype(float)
        latc = f["latc"][:].astype(float)
        lon = f["lon"][:].astype(float)
        lat = f["lat"][:].astype(float)
        lonc = np.where(lonc > 180.0, lonc - 360.0, lonc)
        lon = np.where(lon > 180.0, lon - 360.0, lon)
        nv = f["nv"][:] - 1  # (3, nele), 1-based in the file
        h = f["h"][:].astype(float)
        siglay = f["siglay"][layer, 0]
        nele = lonc.size
        lat_min, lon_min, lat_max, lon_max = bbox
        inside = (
            (latc >= lat_min)
            & (latc <= lat_max)
            & (lonc >= lon_min)
            & (lonc <= lon_max)
        )
        idx = np.where(inside)[0]
        if idx.size == 0:
            sys.exit(f"bbox {bbox} contains no element")
        lat0 = np.deg2rad(latc[idx].mean())
        tri = nv[:, idx]
        x = lon[tri] * KM_PER_DEG * 1000.0 * np.cos(lat0)
        y = lat[tri] * KM_PER_DEG * 1000.0
        area = 0.5 * np.abs(
            (x[1] - x[0]) * (y[2] - y[0]) - (x[2] - x[0]) * (y[1] - y[0])
        )
        edge = np.sqrt(4.0 * area / np.sqrt(3.0))  # equilateral-equivalent edge
        depth = h[tri].mean(axis=0)
        time_chunk = f["time"].id.get_chunk_info(0)
        wet_chunk = f["wet_cells"].id.get_chunk_info(0)
        layout = {
            "file_size": path.stat().st_size,
            "model": "FVCOM",
            "nele": int(nele),
            "layer": layer,
            "siglay_at_node0": float(siglay),
            "time": [time_chunk.byte_offset, 8],
            "time_dtype": f["time"].dtype.str,
            "time_epoch": _parse_epoch(_text(f["time"].attrs["units"])).isoformat(),
            "wet_cells": [wet_chunk.byte_offset, wet_chunk.size],
            "wet_dtype": f["wet_cells"].dtype.str,
            "uv_dtype": f["u"].dtype.str,
            "u": _chunk_ranges(f["u"], layer),
            "v": _chunk_ranges(f["v"], layer),
            "global_attrs": {
                k: _text(f.attrs[k])[:200]
                for k in ("title", "institution", "source")
                if k in f.attrs
            },
        }
    return {
        "layout": layout,
        "index": idx,
        "lonc": lonc[idx],
        "latc": latc[idx],
        "edge_m": edge,
        "depth_m": depth,
    }


def _assemble(
    parts: list[bytes], ranges: list[tuple[int, int, int]], nele: int, dtype: str
) -> np.ndarray:
    out = np.full(nele, np.nan, dtype=np.float32)
    for raw, (_, _length, ele0) in zip(parts, ranges, strict=True):
        arr = np.frombuffer(raw, dtype=dtype)
        out[ele0 : ele0 + arr.size] = arr
    return out


def fetch_hour(
    client: httpx.Client,
    url: str,
    layout: dict,
    expected: datetime,
    index: np.ndarray,
    raw_dir: Path,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, str]:
    """Surface ``u``, ``v`` and ``wet_cells`` on the box elements of one hour.

    Fast path: byte ranges at the template's offsets, accepted when the file
    has the template's size and the timestamp read at the ``time`` offset is
    the expected valid time. Otherwise the whole file is downloaded, read
    with netCDF4 and deleted.
    """
    epoch = (
        datetime.fromisoformat(layout["time_epoch"])
        if "time_epoch" in layout
        else OFS_EPOCH
    )
    t_off, t_len = layout["time"]
    r = _get(client, url, (t_off, t_off + t_len))
    total = int(r.headers.get("Content-Range", "/0").rsplit("/", 1)[-1])
    t_val = float(np.frombuffer(r.content, dtype=layout["time_dtype"])[0])
    t_read = epoch + timedelta(seconds=t_val)
    if total == layout["file_size"] and abs((t_read - expected).total_seconds()) < 1.0:
        nele = layout["nele"]
        u = _assemble(
            [_get(client, url, (o, o + n)).content for o, n, _ in layout["u"]],
            layout["u"], nele, layout["uv_dtype"],
        )  # fmt: skip
        v = _assemble(
            [_get(client, url, (o, o + n)).content for o, n, _ in layout["v"]],
            layout["v"], nele, layout["uv_dtype"],
        )  # fmt: skip
        w_off, w_len = layout["wet_cells"]
        wet = np.frombuffer(
            _get(client, url, (w_off, w_off + w_len)).content, dtype=layout["wet_dtype"]
        )
        return u[index], v[index], wet[index], "ranges"
    print(
        f"  {url.rsplit('/', 1)[-1]}: layout differs (size {total}, time {t_read:%Y-%m-%dT%H}),"
        " whole file",
        file=sys.stderr,
    )
    import netCDF4

    raw_dir.mkdir(parents=True, exist_ok=True)
    tmp = raw_dir / (url.rsplit("/", 1)[-1] + ".whole")
    download_whole(client, url, tmp)
    with netCDF4.Dataset(tmp) as nc:
        t_val = float(nc["time"][0])
        u = np.asarray(nc["u"][0, layout["layer"], :], dtype=np.float32)
        v = np.asarray(nc["v"][0, layout["layer"], :], dtype=np.float32)
        wet = np.asarray(nc["wet_cells"][0, :], dtype=np.int32)
    tmp.unlink()
    t_read = epoch + timedelta(seconds=t_val)
    if abs((t_read - expected).total_seconds()) >= 1.0:
        raise ValueError(f"{url}: time {t_read} differs from expected {expected}")
    return u[index], v[index], wet[index], "whole"


# ---------------------------------------------------------------------------
# Download, ROMS path (curvilinear C grid)
# ---------------------------------------------------------------------------


def _roms_surface_var(f, kind: str) -> tuple[str, int | None]:
    """Name of the surface velocity variable and its layer index (None = 2D).

    ``2ds`` files carry ``u_sur`` / ``v_sur`` ``[time, eta, xi]``; ``fields``
    files carry ``u`` / ``v`` ``[time, s_rho, eta, xi]`` whose surface is the
    last ``s_rho`` index.
    """
    if f"{kind}_sur" in f:
        return f"{kind}_sur", None
    return kind, int(f[kind].shape[1]) - 1


def _roms_row_ranges(dset, layer: int | None, row0: int, row1: int) -> list[dict]:
    """Byte ranges of rows ``row0 .. row1`` (inclusive) of one layer.

    The chunks are ``[1, (k,) ce, cx]`` without compression: inside a chunk
    the rows of one layer are contiguous, ``cx`` values wide even in the
    padded chunks at the grid's edge. One range per chunk that meets the row
    window, over the chunk's full width; the columns are cut after reading.
    """
    if layer is None:
        _, ce, cx = dset.chunks
        n_rows, n_cols = dset.shape[1], dset.shape[2]
    else:
        _, k, ce, cx = dset.chunks
        n_rows, n_cols = dset.shape[2], dset.shape[3]
    itemsize = dset.dtype.itemsize
    ranges = []
    for i in range(dset.id.get_num_chunks()):
        ci = dset.id.get_chunk_info(i)
        if layer is None:
            _, r0, c0 = ci.chunk_offset
            row_in_chunk = 0
        else:
            _, lay0, r0, c0 = ci.chunk_offset
            if not (lay0 <= layer < lay0 + k):
                continue
            row_in_chunk = layer - lay0
        a = max(r0, row0)
        b = min(r0 + ce - 1, row1, n_rows - 1)
        if a > b:
            continue
        ranges.append(
            {
                "offset": ci.byte_offset
                + (row_in_chunk * ce + (a - r0)) * cx * itemsize,
                "length": (b - a + 1) * cx * itemsize,
                "row0": int(a),
                "n_rows": int(b - a + 1),
                "col0": int(c0),
                "chunk_cols": int(cx),
                "n_cols": int(min(cx, n_cols - c0)),
            }
        )
    return sorted(ranges, key=lambda r: (r["row0"], r["col0"]))


def _assemble_roms(
    parts: list[bytes], ranges: list[dict], shape: tuple[int, int], dtype: str
) -> np.ndarray:
    """Full ``[eta, xi]`` array (NaN where not read) from the row ranges."""
    out = np.full(shape, np.nan, dtype=np.float32)
    for raw, r in zip(parts, ranges, strict=True):
        block = np.frombuffer(raw, dtype=dtype).reshape(r["n_rows"], r["chunk_cols"])
        out[
            r["row0"] : r["row0"] + r["n_rows"], r["col0"] : r["col0"] + r["n_cols"]
        ] = block[:, : r["n_cols"]]
    out[np.abs(out) > ROMS_FILL] = np.nan
    return out


def _to_rho(u: np.ndarray, v: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """C-grid ``u[eta_rho, xi_u]`` and ``v[eta_v, xi_rho]`` onto rho points.

    Mean of the two faces of each cell over the faces that carry a value
    (NaN on a masked face is ignored); the outermost row or column keeps its
    single face.
    """

    def pair_mean(a: np.ndarray, b: np.ndarray) -> np.ndarray:
        fa, fb = np.isfinite(a), np.isfinite(b)
        s = np.where(fa, a, 0.0) + np.where(fb, b, 0.0)
        n = fa.astype(np.int8) + fb.astype(np.int8)
        with np.errstate(invalid="ignore", divide="ignore"):
            return np.where(n > 0, s / np.maximum(n, 1), np.nan).astype(np.float32)

    n_eta, n_xi = u.shape[0], v.shape[1]
    ur = np.full((n_eta, n_xi), np.nan, dtype=np.float32)
    ur[:, 1:-1] = pair_mean(u[:, :-1], u[:, 1:])
    ur[:, 0], ur[:, -1] = u[:, 0], u[:, -1]
    vr = np.full((n_eta, n_xi), np.nan, dtype=np.float32)
    vr[1:-1, :] = pair_mean(v[:-1, :], v[1:, :])
    vr[0, :], vr[-1, :] = v[0, :], v[-1, :]
    return ur, vr


def _rotate(
    u: np.ndarray, v: np.ndarray, angle: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """Grid-axis components to east / north (``angle`` = XI axis from east)."""
    c, s = np.cos(angle), np.sin(angle)
    return (u * c - v * s).astype(np.float32), (u * s + v * c).astype(np.float32)


def read_template_roms(path: Path, bbox: list[float], layer: int) -> dict:
    """Byte layout and box geometry from one whole ROMS file (h5py).

    ``layer`` counts from the surface (0 = surface) like the FVCOM path; on
    ``fields`` files that is ``s_rho`` index ``n - 1 - layer``, on ``2ds``
    files only 0 exists.
    """
    import h5py

    with h5py.File(path, "r") as f:
        lon = f["lon_rho"][:].astype(float)
        lat = f["lat_rho"][:].astype(float)
        lon = np.where(lon > 180.0, lon - 360.0, lon)
        angle = f["angle"][:].astype(float)
        mask = f["mask_rho"][:].astype(float)
        h = f["h"][:].astype(float)
        dx = 1.0 / f["pm"][:].astype(float)
        dy = 1.0 / f["pn"][:].astype(float)
        lat_min, lon_min, lat_max, lon_max = bbox
        inside = (
            (lat >= lat_min) & (lat <= lat_max) & (lon >= lon_min) & (lon <= lon_max)
        )
        if not inside.any():
            sys.exit(f"bbox {bbox} contains no rho point")
        rows = np.where(inside.any(axis=1))[0]
        cols = np.where(inside.any(axis=0))[0]
        row0, row1 = int(rows.min()), int(rows.max())
        col0, col1 = int(cols.min()), int(cols.max())
        sea = inside & (mask > 0.5)
        idx = np.where(sea.ravel())[0]
        if idx.size == 0:
            sys.exit(f"bbox {bbox} contains no sea rho point")
        u_name, u_layer = _roms_surface_var(f, "u")
        v_name, v_layer = _roms_surface_var(f, "v")
        if u_layer is not None:
            u_layer -= layer
            v_layer -= layer
        elif layer != 0:
            sys.exit(f"{path.name}: surface-only file, --layer must be 0")
        n_s = int(f["s_rho"].shape[0])
        s_rho = float(f["s_rho"][n_s - 1 - layer])
        cs_r = float(f["Cs_r"][n_s - 1 - layer]) if "Cs_r" in f else float("nan")
        time_chunk = f["ocean_time"].id.get_chunk_info(0)
        # ``v`` sits on the faces between rows, so row ``row0`` of rho needs
        # ``v`` rows ``row0 - 1`` and ``row0``.
        layout = {
            "file_size": path.stat().st_size,
            "model": "ROMS",
            "shape_rho": [int(lat.shape[0]), int(lat.shape[1])],
            "box_rows": [row0, row1],
            "box_cols": [col0, col1],
            "layer": layer,
            "s_rho": s_rho,
            "cs_r": cs_r,
            "time": [time_chunk.byte_offset, 8],
            "time_dtype": f["ocean_time"].dtype.str,
            "time_epoch": _parse_epoch(
                _text(f["ocean_time"].attrs["units"])
            ).isoformat(),
            "uv_dtype": f[u_name].dtype.str,
            "u_var": u_name,
            "v_var": v_name,
            "u_layer": u_layer,
            "v_layer": v_layer,
            "u_shape": [int(s) for s in f[u_name].shape[-2:]],
            "v_shape": [int(s) for s in f[v_name].shape[-2:]],
            "u": _roms_row_ranges(f[u_name], u_layer, row0, row1),
            "v": _roms_row_ranges(f[v_name], v_layer, max(row0 - 1, 0), row1),
            "wet_var": "wetdry_mask_rho" if "wetdry_mask_rho" in f else None,
            "wet_dtype": (
                f["wetdry_mask_rho"].dtype.str if "wetdry_mask_rho" in f else None
            ),
            "wet": (
                _roms_row_ranges(f["wetdry_mask_rho"], None, row0, row1)
                if "wetdry_mask_rho" in f
                else []
            ),
            "global_attrs": {
                k: _text(f.attrs[k])[:200]
                for k in ("title", "type", "history", "grd_file", "svn_rev")
                if k in f.attrs
            },
        }
    return {
        "layout": layout,
        "index": idx,
        "lonc": lon.ravel()[idx],
        "latc": lat.ravel()[idx],
        "edge_m": np.sqrt(dx * dy).ravel()[idx],
        "depth_m": h.ravel()[idx],
        "angle": angle.ravel()[idx],
        "eta": idx // lat.shape[1],
        "xi": idx % lat.shape[1],
    }


def fetch_hour_roms(
    client: httpx.Client,
    url: str,
    layout: dict,
    expected: datetime,
    index: np.ndarray,
    angle: np.ndarray,
    raw_dir: Path,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, str]:
    """Surface east / north velocity and wet flag on the box rho points.

    Same contract as :func:`fetch_hour`: byte ranges when the file has the
    template's size and timestamp, whole file otherwise.
    """
    epoch = datetime.fromisoformat(layout["time_epoch"])
    t_off, t_len = layout["time"]
    r = _get(client, url, (t_off, t_off + t_len))
    total = int(r.headers.get("Content-Range", "/0").rsplit("/", 1)[-1])
    t_val = float(np.frombuffer(r.content, dtype=layout["time_dtype"])[0])
    t_read = epoch + timedelta(seconds=t_val)
    shape = tuple(layout["shape_rho"])
    if total == layout["file_size"] and abs((t_read - expected).total_seconds()) < 1.0:
        u = _assemble_roms(
            [_get(client, url, (r["offset"], r["offset"] + r["length"])).content for r in layout["u"]],
            layout["u"], tuple(layout["u_shape"]), layout["uv_dtype"],
        )  # fmt: skip
        v = _assemble_roms(
            [_get(client, url, (r["offset"], r["offset"] + r["length"])).content for r in layout["v"]],
            layout["v"], tuple(layout["v_shape"]), layout["uv_dtype"],
        )  # fmt: skip
        if layout["wet"]:
            wet = _assemble_roms(
                [_get(client, url, (r["offset"], r["offset"] + r["length"])).content for r in layout["wet"]],
                layout["wet"], shape, layout["wet_dtype"],
            )  # fmt: skip
        else:
            wet = np.ones(shape, dtype=np.float32)
        mode = "ranges"
    else:
        print(
            f"  {url.rsplit('/', 1)[-1]}: layout differs (size {total}, time {t_read:%Y-%m-%dT%H}),"
            " whole file",
            file=sys.stderr,
        )
        import netCDF4

        raw_dir.mkdir(parents=True, exist_ok=True)
        tmp = raw_dir / (url.rsplit("/", 1)[-1] + ".whole")
        download_whole(client, url, tmp)
        with netCDF4.Dataset(tmp) as nc:
            t_val = float(nc["ocean_time"][0])
            nc.set_auto_mask(False)
            if layout["u_layer"] is None:
                u = np.asarray(nc[layout["u_var"]][0], dtype=np.float32)
                v = np.asarray(nc[layout["v_var"]][0], dtype=np.float32)
            else:
                u = np.asarray(
                    nc[layout["u_var"]][0, layout["u_layer"]], dtype=np.float32
                )
                v = np.asarray(
                    nc[layout["v_var"]][0, layout["v_layer"]], dtype=np.float32
                )
            wet = (
                np.asarray(nc[layout["wet_var"]][0], dtype=np.float32)
                if layout["wet_var"]
                else np.ones(shape, dtype=np.float32)
            )
        tmp.unlink()
        u[np.abs(u) > ROMS_FILL] = np.nan
        v[np.abs(v) > ROMS_FILL] = np.nan
        t_read = epoch + timedelta(seconds=t_val)
        if abs((t_read - expected).total_seconds()) >= 1.0:
            raise ValueError(f"{url}: time {t_read} differs from expected {expected}")
        mode = "whole"
    ur, vr = _to_rho(u, v)
    ue, vn = _rotate(ur.ravel()[index], vr.ravel()[index], angle)
    return ue, vn, (wet.ravel()[index] > 0.5).astype(np.int32), mode


def download(
    source_dir: Path,
    system: str,
    zone: str,
    bbox: list[float],
    start: datetime,
    days: int,
    layer: int,
    pause_s: float,
    template_key: str | None,
) -> list[Path]:
    """One file per UTC day, surface layer, box elements only."""
    info = SYSTEMS[system]
    roms = info["model"] == "ROMS"
    cycles = info["cycles"]
    raw_dir = source_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    client = httpx.Client(
        timeout=httpx.Timeout(60.0, connect=20.0), follow_redirects=True
    )
    key = template_key or object_key(
        system, start.replace(hour=cycles[0]), NOWCAST_HOURS[0]
    )
    template = raw_dir / key.rsplit("/", 1)[-1]
    if not template.exists():
        t0 = time.perf_counter()
        print(f"[download] template {BUCKET_URL + key}", file=sys.stderr)
        download_whole(client, BUCKET_URL + key, template)
        print(
            f"[download] template {template.stat().st_size / 1e6:.0f} MB in "
            f"{time.perf_counter() - t0:.0f} s",
            file=sys.stderr,
        )
    tpl = (read_template_roms if roms else read_template)(template, bbox, layer)
    layout, index = tpl["layout"], tpl["index"]
    (source_dir / "layout.json").write_text(
        json.dumps(
            {"template": key, **layout, "box_elements": int(index.size)}, indent=2
        )
    )
    if roms:
        per_hour = 8 + sum(r["length"] for k in ("u", "v", "wet") for r in layout[k])
        print(
            f"[download] {index.size} sea rho points in bbox {bbox} of "
            f"{layout['shape_rho'][0]} x {layout['shape_rho'][1]}, rows "
            f"{layout['box_rows']}, cols {layout['box_cols']}, pitch "
            f"{np.median(tpl['edge_m']):.0f} m, angle {np.degrees(np.median(tpl['angle'])):.1f} deg, "
            f"{layout['u_var']} layer {layout['u_layer']} (s_rho {layout['s_rho']:.4f}), "
            f"{per_hour / 1e6:.2f} MB per hour by ranges",
            file=sys.stderr,
        )
    else:
        per_hour = sum(n for _, n, _ in layout["u"]) * 2 + layout["wet_cells"][1] + 8
        print(
            f"[download] {index.size} elements in bbox {bbox} of {layout['nele']}, "
            f"median edge {np.median(tpl['edge_m']):.0f} m, sigma layer {layer} "
            f"({layout['siglay_at_node0']:.4f}), {per_hour / 1e6:.2f} MB per hour by ranges",
            file=sys.stderr,
        )
    written: list[Path] = []
    for d in range(days):
        day = start + timedelta(days=d)
        out = source_dir / f"{system}_{zone}_{day:%Y%m%d}.nc"
        if out.exists():
            written.append(out)
            continue
        t_day = time.perf_counter()
        slots = nowcast_slots(day, cycles)
        u = np.full((len(slots), index.size), np.nan, dtype=np.float32)
        v = np.full_like(u, np.nan)
        wet = np.zeros((len(slots), index.size), dtype=np.int8)
        times: list[datetime] = []
        modes: list[str] = []
        n_bytes = 0
        for i, (cycle, n, valid) in enumerate(slots):
            key = object_key(system, cycle, n)
            try:
                if roms:
                    ui, vi, wi, mode = fetch_hour_roms(
                        client, BUCKET_URL + key, layout, valid, index, tpl["angle"], raw_dir
                    )  # fmt: skip
                else:
                    ui, vi, wi, mode = fetch_hour(
                        client, BUCKET_URL + key, layout, valid, index, raw_dir
                    )
            except FileNotFoundError:
                print(
                    f"  {key.rsplit('/', 1)[-1]}: missing, hour skipped",
                    file=sys.stderr,
                )
                times.append(valid)
                modes.append("missing")
                continue
            u[i], v[i], wet[i] = ui, vi, wi.astype(np.int8)
            times.append(valid)
            modes.append(mode)
            n_bytes += per_hour if mode == "ranges" else layout["file_size"]
            time.sleep(pause_s)
        dry = wet == 0
        u[dry] = np.nan
        v[dry] = np.nan
        coords = {
            "time": np.array(
                [np.datetime64(t.replace(tzinfo=None), "ns") for t in times]
            ),
            "lonc": ("cell", tpl["lonc"].astype(np.float64)),
            "latc": ("cell", tpl["latc"].astype(np.float64)),
            "element": ("cell", index.astype(np.int32)),
            "edge_m": ("cell", tpl["edge_m"].astype(np.float32)),
            "depth_m": ("cell", tpl["depth_m"].astype(np.float32)),
        }
        attrs = {
            "source_system": system,
            "source_bucket": BUCKET_URL,
            "source_keys": json.dumps([object_key(system, c, n) for c, n, _ in slots]),
            "fetch_modes": json.dumps(modes),
            "layer": layer,
            "bbox": json.dumps(bbox),
            "model": json.dumps(layout["global_attrs"]),
            "downloaded_at": datetime.now(UTC).isoformat(timespec="seconds"),
        }
        if roms:
            coords["eta"] = ("cell", tpl["eta"].astype(np.int32))
            coords["xi"] = ("cell", tpl["xi"].astype(np.int32))
            coords["angle_deg"] = (
                "cell",
                np.degrees(tpl["angle"]).astype(np.float32),
            )
            attrs.update(
                {
                    "native_grid": "structured_curvilinear_c_grid",
                    "staggering": ROMS_STAGGERING,
                    "vertical_detail": (
                        (
                            "surface"
                            if layout["u_layer"] is None
                            else f"s_rho index {layout['u_layer']}"
                        )
                        + f" layer of ROMS ({layout['u_var']}; s_rho"
                        f" {layout['s_rho']:.4f}, Cs_r {layout['cs_r']:.2e})"
                    ),
                    "wet_dry_source": layout["wet_var"] or "mask_rho only (static)",
                }
            )
        else:
            attrs["siglay_at_node0"] = layout["siglay_at_node0"]
        ds = xr.Dataset(
            {
                "u": (("time", "cell"), u),
                "v": (("time", "cell"), v),
                "wet": (("time", "cell"), wet),
            },
            coords=coords,
            attrs=attrs,
        )
        layer_name = "surface s_rho layer" if roms else "surface sigma layer"
        ds["u"].attrs = {
            "units": "m s-1",
            "long_name": f"eastward velocity, {layer_name}",
        }
        ds["v"].attrs = {
            "units": "m s-1",
            "long_name": f"northward velocity, {layer_name}",
        }
        enc = {k: {"zlib": True, "complevel": 4} for k in ("u", "v", "wet")}
        tmp = out.with_suffix(".tmp.nc")
        ds.to_netcdf(tmp, encoding=enc)
        tmp.rename(out)
        written.append(out)
        n_ok = sum(m != "missing" for m in modes)
        print(
            f"[download] {out.name}: {n_ok}/{len(slots)} hours "
            f"({sum(m == 'whole' for m in modes)} whole), {n_bytes / 1e6:.0f} MB fetched, "
            f"{out.stat().st_size / 1e6:.1f} MB on disk in {time.perf_counter() - t_day:.0f} s",
            file=sys.stderr,
        )
    client.close()
    return written


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------


def sea_cells(path: Path, n_cells: int) -> np.ndarray:
    """Indices of the cells that carry a value in the first two days."""
    with xr.open_dataset(path) as ds:
        u = ds["u"].isel(time=slice(0, _SEA_PROBE_HOURS)).values
    if u.shape[1] != n_cells:
        raise ValueError(f"{path.name}: {u.shape[1]} cells differ from {n_cells}")
    return np.where(np.isfinite(u).any(axis=0))[0]


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

    Distances on a local equirectangular plane (km). Returns
    ``(index, distance_m)``; destinations farther than ``max_dist_m`` from any
    source get index -1.
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
    system: str,
    zone: str,
    label: str | None,
    rank: int,
    resolution_m: int,
    reference_dir: Path | None,
    rayleigh: float,
    inference: bool,
    min_speed_kt: float,
    tile_deg: float,
    bbox: list[float],
    dlat: float,
    dlon: float,
    reach_factor: float,
    min_reach_m: float,
    validity_bbox: list[float] | None,
    time_chunk: int,
    confidence: str = "medium",
    reference_harcon: str | None = None,
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
        lat1 = ds["latc"].values.astype(float)
        lon1 = ds["lonc"].values.astype(float)
        edge1 = ds["edge_m"].values.astype(float)
        source_attrs = dict(ds.attrs)
    n_native = lat1.size
    sea = sea_cells(files[0], n_native)
    n_cells = sea.size
    print(
        f"[{atlas_id}] {n_cells} wet cells of {n_native} (native elements)",
        file=sys.stderr,
    )
    if reference_harcon:
        ref_u, ref_v, ref_label = harcon_constants(reference_harcon)
    else:
        ref_u, ref_v, ref_label = reference_constants(
            reference_dir, float(lat1.mean()), float(lon1.mean())
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
    elif inference:
        print(
            f"[{atlas_id}] no reference atlas answers at the centre, no inference",
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
                for var, ga in (("u", ga_u), ("v", ga_v)):
                    block = ds[var].isel(time=sl).values
                    if block.shape[1] != n_native:
                        raise ValueError(
                            f"{f.name}: {block.shape[1]} cells differ from {n_native}"
                        )
                    ga.add(ts[sl], block[:, sea].astype(float))
        inputs.append({"file": f.name, "sha256": _sha256(f), "instants": len(ts)})
        print(
            f"[{atlas_id}] {f.name}: {len(ts)} instants in {time.perf_counter() - t_file:.1f} s",
            file=sys.stderr,
        )
    res_u = ga_u.solve(min_samples=max(48, 2 * ga_u.p))
    res_v = ga_v.solve(min_samples=max(48, 2 * ga_v.p))
    valid = np.isfinite(res_u.amp[0]) & np.isfinite(res_v.amp[0])
    print(
        f"[{atlas_id}] {int(valid.sum())} / {n_cells} wet cells fitted", file=sys.stderr
    )
    fitted = np.where(valid)[0]
    speed_native = max_reconstructed_speed(
        res_u.amp[:, fitted],
        res_u.phase_deg[:, fitted],
        res_v.amp[:, fitted],
        res_v.phase_deg[:, fitted],
        res_u.names,
    )

    # Nearest-neighbour resampling of the fitted native elements onto the
    # regular grid. A regular cell is served when its centre lies within
    # ``reach_factor`` equivalent edges of the nearest element centroid (at
    # least ``min_reach_m``): the reach follows the local mesh size, so the
    # open strait with 600 m triangles stays covered and the coastline of the
    # passes, meshed at 100 m, stays sharp.
    lat_native = lat1[sea][fitted]
    lon_native = lon1[sea][fitted]
    edge_native = edge1[sea][fitted]
    lats, lons = regular_grid(bbox, dlat, dlon)
    LON, LAT = np.meshgrid(lons, lats)
    dst_lat, dst_lon = LAT.ravel(), LON.ravel()
    max_reach = max(min_reach_m, reach_factor * float(edge_native.max()))
    nn, nn_dist = nearest_native(lat_native, lon_native, dst_lat, dst_lon, max_reach)
    hit = nn >= 0
    reach = np.maximum(min_reach_m, reach_factor * edge_native[np.where(hit, nn, 0)])
    hit &= nn_dist <= reach
    print(
        f"[{atlas_id}] regular grid {lats.size} x {lons.size} = {dst_lat.size} cells, "
        f"{int(hit.sum())} within reach of a fitted element "
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
    idx = fitted[src]  # index into the wet native cells
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
        "native_edge_m": edge_native[src].astype(np.float32),
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
    info = SYSTEMS.get(
        system,
        {"name": system.upper(), "model": "unknown", "product": "fields"},
    )
    model = json.loads(source_attrs.get("model", "{}"))
    layer = int(source_attrs.get("layer", 0))
    sig = float(source_attrs.get("siglay_at_node0", float("nan")))
    native_grid = source_attrs.get("native_grid", "unstructured_triangles")
    native_extra = {
        k: source_attrs[k]
        for k in ("staggering", "wet_dry_source")
        if k in source_attrs
    }
    vertical_detail = source_attrs.get(
        "vertical_detail",
        f"sigma layer {layer} of {info['model']} (centre at {sig:.4f} of the local depth,"
        " below the surface)",
    )
    licence_evidence = (
        f"AWS Open Data registry page {REGISTRY_URL} (read {LICENCE_READ_AT}): "
        "'NOAA data disseminated through NODD are open to the public and can be "
        "used as desired. [...] NOAA requests attribution for the use or "
        "dissemination of unaltered NOAA data. [...] If you modify NOAA data, you "
        "may not state or imply that it is original, unaltered NOAA data.'; "
        f"NOAA CO-OPS disclaimer {DISCLAIMER_URL} (read {LICENCE_READ_AT}): 'The "
        "information on government servers are in the public domain, unless "
        "specifically annotated otherwise, and may be used freely by the public.'"
    )
    meta = {
        "format": "ohmywind-harmonic-atlas",
        "schema_version": 3,
        "atlas": atlas_id,
        "zone": zone,
        "label": label or f"NOAA {system.upper()} ({info['model']}), {zone}",
        "rank": rank,
        "resolution_m": resolution_m,
        "effective_resolution_m": round(float(np.median(edge1))),
        "grid": {
            "type": "regular_ll",
            "dlat_deg": float(dlat),
            "dlon_deg": float(dlon),
            "origin": "regrid",
            "tile_deg": tile_deg,
            "regrid": {
                "method": "nearest_neighbour",
                "reach_factor": reach_factor,
                "min_reach_m": min_reach_m,
                "native": {
                    "type": native_grid,
                    "model": info["model"],
                    "elements_in_bbox": int(n_native),
                    "edge_m_percentiles": {
                        str(p): round(float(np.percentile(edge1, p)))
                        for p in (5, 25, 50, 75, 95)
                    },
                    **native_extra,
                },
            },
        },
        "source": {
            "short": system,
            "name": f"NOAA NOS {system.upper()}, {info['name']} ({info['model']}), hourly nowcast",
            "provider": "NOAA National Ocean Service, CO-OPS (NOAA Open Data Dissemination)",
            "url": BUCKET_URL + f"{system}/netcdf/",
            "product": f"{system}.tHHz.YYYYMMDD.{info['product']}.nNNN.nc",
            "version": model.get("source") or model.get("history") or "unknown",
            "licence": {
                "name": "US Government work, public domain (NODD open data)",
                "url": REGISTRY_URL,
                "read_at": LICENCE_READ_AT,
                "evidence": licence_evidence,
            },
            "attribution": (
                f"Derived from NOAA NOS {system.upper()} nowcast fields (NOAA Open "
                "Data Dissemination, public domain). Harmonic constants derived by "
                "OhMyWind (changes: harmonic analysis of the hourly surface series, "
                + (
                    "C-grid velocities averaged onto rho points and rotated to east / north, "
                    if native_grid.startswith("structured")
                    else ""
                )
                + "nearest-neighbour resampling onto a regular grid); this is not "
                "original, unaltered NOAA data and NOAA does not endorse it."
            ),
            "citation": REGISTRY_URL,
            "redistribution_of_derivative": "allowed (public domain), attribution requested",
        },
        "variables": ["u", "v"],
        "vertical": "surface",
        "vertical_detail": vertical_detail,
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
            "dry_cells_masked": True,
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
            "script": "scripts/build_ofs_atlas.py",
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


def rank_for_resolution(resolution_m: int) -> int:
    """The format's convention: 3 estuary (< 100 m), 2 coastal (to 500 m), 1 shelf (to 2 km), 0 basin."""
    if resolution_m < 100:
        return 3
    if resolution_m <= 500:
        return 2
    if resolution_m <= 2000:
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--system",
        default="sscofs",
        choices=sorted(SYSTEMS),
        help=(
            "FVCOM systems (sscofs, sfbofs, ngofs2, lakes, necofs) read the surface"
            " sigma layer of the fields files on the element centroids; ROMS"
            " systems (gomofs by its 2ds files, cbofs, ciofs, dbofs, tbofs by their"
            " fields files) read the surface s_rho layer on the C grid, average it"
            " onto rho points and rotate it by angle"
        ),
    )
    parser.add_argument(
        "--source-dir", type=Path, default=None, help="default build/ofs/<system>"
    )
    parser.add_argument("--glob", default=None, help="default <system>_<zone>_*.nc")
    parser.add_argument("--atlas-id", default=None, help="default <SYSTEM>_<ZONE>")
    parser.add_argument("--zone", default="salish")
    parser.add_argument("--label", default=None, help="human label stored in metadata")
    parser.add_argument(
        "--rank",
        type=int,
        default=None,
        help=(
            "cascade priority; by default the format's convention from --resolution-m:"
            " 3 under 100 m, 2 up to 500 m (SSCOFS), 1 up to 2 km (GoMOFS, CBOFS), 0 beyond"
        ),
    )
    parser.add_argument(
        "--resolution-m",
        type=int,
        default=200,
        help="pitch of the output grid (200 for SSCOFS, 700 for GoMOFS)",
    )
    parser.add_argument(
        "--confidence",
        choices=("high", "medium", "low"),
        default="medium",
        help="confidence stored in metadata (medium until validated against CO-OPS stations)",
    )
    parser.add_argument("--output-dir", type=Path, default=None)
    parser.add_argument(
        "--reference-atlas-dir",
        type=Path,
        default=Path("build/fes/atlas"),
        help="parent directory of atlases; the one answering at the domain centre feeds the inference",
    )
    parser.add_argument(
        "--reference-harcon",
        default=None,
        metavar="STATION:BIN",
        help=(
            "CO-OPS current station whose published constituents feed the"
            " inference instead of the reference atlas (PUG1616:31)"
        ),
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
        default=[47.2, -123.2, 48.5, -122.2],
        help="download subset and extent of the regular output grid",
    )
    parser.add_argument(
        "--dlat-deg", type=float, default=0.0018, help="200 m (0.0063 for 700 m)"
    )
    parser.add_argument(
        "--dlon-deg",
        type=float,
        default=0.0027,
        help="200 m at 47.9 N (0.0089 for 700 m at 45 N)",
    )
    parser.add_argument(
        "--reach-factor",
        type=float,
        default=0.75,
        help="a regular cell is served within this many equivalent edges of the nearest element",
    )
    parser.add_argument("--min-reach-m", type=float, default=150.0)
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
        "--download", action="store_true", help="fetch from the bucket first"
    )
    parser.add_argument(
        "--start", default="2026-08-19", help="first UTC day to download"
    )
    parser.add_argument("--days", type=int, default=32)
    parser.add_argument(
        "--layer",
        type=int,
        default=0,
        help="layer index from the surface (0 = surface; FVCOM sigma layer, ROMS s_rho counted from the top)",
    )
    parser.add_argument(
        "--pause-s", type=float, default=0.2, help="pause between hours"
    )
    parser.add_argument(
        "--template-key",
        default=None,
        help="bucket key of the whole file used for the byte layout (default: first hour)",
    )
    parser.add_argument("--no-build", action="store_true", help="download only")
    args = parser.parse_args(argv)

    source_dir = args.source_dir or Path("build/ofs") / args.system
    atlas_id = args.atlas_id or f"{args.system.upper()}_{args.zone.upper()}"
    if args.download:
        start = datetime.fromisoformat(args.start).replace(tzinfo=UTC)
        download(
            source_dir,
            args.system,
            args.zone,
            args.bbox,
            start,
            args.days,
            args.layer,
            args.pause_s,
            args.template_key,
        )
    if args.no_build:
        return 0
    files = sorted(source_dir.glob(args.glob or f"{args.system}_{args.zone}_*.nc"))
    out = args.output_dir or source_dir / "atlas" / atlas_id
    build(
        files,
        out,
        atlas_id,
        args.system,
        args.zone,
        args.label,
        args.rank if args.rank is not None else rank_for_resolution(args.resolution_m),
        args.resolution_m,
        args.reference_atlas_dir if args.reference_atlas_dir.exists() else None,
        args.rayleigh,
        not args.no_inference,
        args.min_speed_kt,
        args.tile_deg,
        args.bbox,
        args.dlat_deg,
        args.dlon_deg,
        args.reach_factor,
        args.min_reach_m,
        args.validity_bbox,
        args.time_chunk,
        args.confidence,
        args.reference_harcon,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
