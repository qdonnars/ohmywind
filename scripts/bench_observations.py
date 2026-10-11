#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars
"""Served currents against observations: HF radar surface currents.

Every earlier bench measured a model against a model (an atlas against the
regional model it was extracted from, or the global SMOC against the same).
This one measures the candidates against HF radar totals, hour by hour, at
every radar cell with enough good data:

A. SMOC total (utotal, vtotal): what Open-Meteo serves outside the atlases;
S. the served cascade, built with the repository's own registries and rules
   (unknown zone, SHOM C2D within 0.5 km, then ``MarcAtlasRegistry.covers``
   with the serving policy, dead water, blind pass), SMOC total elsewhere;
F. SMOC without Stokes drift (utide + uo, vtide + vo);
D. hybrid: the tide S serves (SHOM or atlas) + SMOC circulation (uo, vo),
   F where S falls back to SMOC;
Z. no current.

Sites (the French radars are not in the European HFR node):
- ``iroise``: SHOM WERA radars (Garchine, Brezellec), archive 2015-2021,
  read through the Shom archive API, December 2020 and January 2021 (SMOC
  starts on 2020-11-01, the radars stopped on 2021-01-31);
- ``cosyna``: German Bight (Hereon), EMODnet Physics ERDDAP;
- ``euskoos``: Basque coast (AZTI), EMODnet Physics ERDDAP, reaches the deep
  Bay of Biscay (third question of the bench);
- ``gibraltar``: the strait (Puertos del Estado), EMODnet Physics ERDDAP,
  checks the exclusion box of the serving policy;
- ``moorings``: current meters about 3 m deep (Copernicus In Situ TAC, IBI),
  Oleron and the Cantabrian deep-water buoys.

``analyse`` also scores serving rules (hybrid above a tide threshold), the
tide an atlas would have served where the policy declined it, and the M2
ellipse of the radar against every atlas by water depth.

Subcommands, in order:

``download``  radar files and SMOC components (credentials read from the main
              repo ``.env``, never printed);
``extract``   hourly radar, QC, candidates per cell (npz per site);
``analyse``   metrics per site, per served source, harmonic M2 check (JSON).

Usage, from ``packages/data-adapters``::

    env -u VIRTUAL_ENV uv run --with copernicusmarine --with xarray \\
        --with netcdf4 --with scipy python ../../scripts/bench_observations.py download
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
import sys
import time
import urllib.error
import urllib.request
import zipfile
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
MAIN = Path(os.environ.get("OPENWIND_MAIN_REPO", "/home/qdonnars/projects/open_wind"))
OUT = MAIN / "build" / "hf_radar"
BENCH_GLOBAL = MAIN / "build" / "bench_global"
ATLAS_DIR = Path(
    os.environ.get(
        "OPENWIND_ATLAS_DIR",
        "/tmp/claude-1000/-home-qdonnars-projects-open-wind/"
        "ec63fd0b-bbb2-49c0-a520-5f416fd39294/scratchpad/atlas_dir",
    )
)
MS_TO_KN = 1.0 / 0.514444
SMOC_DATASET = "cmems_mod_glo_phy_anfc_merged-uv_PT1H-i"
SMOC_VARS = ["utotal", "vtotal", "utide", "vtide", "uo", "vo"]
ERDDAP = "https://erddap.emodnet-physics.eu/erddap/griddap"
SHOM_API = "https://services.data.shom.fr/oceano/archive/download"
SHOM_MODEL = "RADARHF_OBS_R1110_IROISE"
# The archive API mails a link; the link is also built from its JSON answer,
# which is what this script polls. A reserved, undeliverable address (RFC 2606)
# keeps any personal address out of a third-party request.
SHOM_MAIL = "bench@example.org"
EARTH_KM = 6371.0
CANDIDATES = ("A", "S", "F", "D", "Z")

SITES: dict[str, dict] = {
    "iroise": {
        "kind": "shom",
        "months": ("2020-12", "2021-01"),
        "min_per_hour": 3,  # 10 min sampling, up to 6 per hour
        "thin": 2,  # 1.5 km grid, keep one cell in two each way
    },
    "cosyna": {
        "kind": "erddap",
        "dataset": "EUHFR_NRTcurrent_HFR-COSYNA-Total",
        # No data from 2022-07 to 2026-08 on the node: same months as Iroise.
        "months": ("2020-12", "2021-01"),
        "stride": 2,
        "min_per_hour": 2,  # 20 min sampling
        "thin": 1,
    },
    "euskoos": {
        "kind": "erddap",
        "dataset": "EUHFR_NRTcurrent_HFR-EUSKOOS-Total",
        "months": ("2026-01", "2026-07"),
        "stride": 1,
        "min_per_hour": 1,
        "thin": 1,
    },
    "gibraltar": {
        "kind": "erddap",
        "dataset": "EUHFR_NRTcurrent_HFR-Gibraltar-Total",
        "months": ("2026-01", "2026-07"),
        "stride": 2,
        "min_per_hour": 1,
        "thin": 1,
    },
    # Moored current meters (about 3 m below the surface) of the Copernicus
    # In Situ TAC, Bay of Biscay: Oleron (Cerema, shelf) and the Puertos del
    # Estado deep-water buoys on the Cantabrian slope (third question).
    "moorings": {
        "kind": "insitu",
        "dataset": "cmems_obs-ins_ibi_phybgcwav_mynrt_na_irr",
        "platforms": (
            "GL_TS_MO_6200080",
            "IR_TS_MO_6200024",
            "IR_TS_MO_6200025",
            "IR_TS_MO_6200082",
            "IR_TS_MO_6200083",
        ),
        "months": ("2026-01", "2026-07"),
        "min_per_hour": 1,
        "thin": 1,
    },
}
STATIC_DATASET = "cmems_mod_glo_phy_anfc_0.083deg_static"
DEPTH_FILE = OUT / "glo_deptho.nc"


def _load_credentials() -> None:
    """Copernicus credentials from the main repo .env, never printed."""
    wanted = ("COPERNICUSMARINE_SERVICE_USERNAME", "COPERNICUSMARINE_SERVICE_PASSWORD")
    for line in (MAIN / ".env").read_text().splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.strip() in wanted:
            os.environ[key.strip()] = value.strip().strip("'\"")
    missing = [k for k in wanted if not os.environ.get(k)]
    if missing:
        sys.exit(f"missing credentials: {missing}")


def month_range(month: str) -> tuple[datetime, datetime]:
    """First and last hour of the month, UTC."""
    y, m = (int(x) for x in month.split("-"))
    start = datetime(y, m, 1, tzinfo=UTC)
    nxt = datetime(y + (m == 12), m % 12 + 1, 1, tzinfo=UTC)
    return start, nxt - timedelta(hours=1)


def _iso(t: datetime) -> str:
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


# --------------------------------------------------------------------------
# Download


def _get(url: str, timeout: float = 300.0) -> tuple[int, bytes]:
    req = urllib.request.Request(url, headers={"User-Agent": "ohmywind-bench/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def download_shom(site: str, cfg: dict) -> None:
    """Daily Iroise archives: one API call per day, then poll the built link."""
    d = OUT / site
    d.mkdir(parents=True, exist_ok=True)
    days: list[str] = []
    for month in cfg["months"]:
        start, end = month_range(month)
        t = start
        while t <= end:
            days.append(t.strftime("%Y%m%d"))
            t += timedelta(days=1)
    pending: dict[str, str] = {}
    for day in days:
        path = d / f"{SHOM_MODEL}_{day}.zip"
        if path.exists():
            continue
        code, body = _get(f"{SHOM_API}?date={day}&model={SHOM_MODEL}&mail={SHOM_MAIL}")
        if code != 200:
            print(f"{site} {day}: API {code} {body[:120]!r}", flush=True)
            continue
        j = json.loads(body)
        pending[day] = (
            f"https://services.data.shom.fr/{j['key']}/telechargement/archiveoceano/"
            f"ARCHIVEOCEANO_{j['publicationId']}/file/{SHOM_MODEL}_{day}.zip"
        )
        time.sleep(0.5)
    deadline = time.time() + 1800
    while pending and time.time() < deadline:
        for day, url in list(pending.items()):
            code, body = _get(url)
            if code == 200 and body[:2] == b"PK":
                (d / f"{SHOM_MODEL}_{day}.zip").write_bytes(body)
                print(f"{site} {day}: {len(body) / 1e6:.1f} MB", flush=True)
                del pending[day]
        if pending:
            time.sleep(15)
    if pending:
        print(f"{site}: {len(pending)} days never became ready: {sorted(pending)}")


def download_erddap(site: str, cfg: dict) -> None:
    """One NetCDF per month: EWCT, NSCT, QCflag, time padded by 30 min."""
    d = OUT / site
    d.mkdir(parents=True, exist_ok=True)
    s = cfg["stride"]
    for month in cfg["months"]:
        path = d / f"{site}_{month}.nc"
        if path.exists():
            continue
        start, end = month_range(month)
        t0, t1 = _iso(start - timedelta(minutes=30)), _iso(end + timedelta(minutes=30))
        sub = f"[({t0}):1:({t1})][0][0:{s}:last][0:{s}:last]"
        url = f"{ERDDAP}/{cfg['dataset']}.nc?EWCT{sub},NSCT{sub},QCflag{sub}"
        t = time.time()
        code, body = _get(url, timeout=1800)
        if code != 200:
            print(f"{site} {month}: ERDDAP {code} {body[:300]!r}", flush=True)
            continue
        path.write_bytes(body)
        print(f"{site} {month}: {len(body) / 1e6:.0f} MB in {time.time() - t:.0f} s", flush=True)


def radar_extent(site: str) -> tuple[float, float, float, float]:
    """(lon_min, lon_max, lat_min, lat_max) of the radar grid."""
    if SITES[site]["kind"] == "shom":
        return (-6.78333, -4.64649, 47.30483, 49.26667)
    if SITES[site]["kind"] == "insitu":
        _, lat, lon, _, _, _ = read_moorings(site, SITES[site]["months"][0])
        return float(lon.min()), float(lon.max()), float(lat.min()), float(lat.max())
    import xarray as xr

    path = sorted((OUT / site).glob(f"{site}_*.nc"))[0]
    with xr.open_dataset(path) as ds:
        lat, lon = ds["latitude"].values, ds["longitude"].values
    return float(lon.min()), float(lon.max()), float(lat.min()), float(lat.max())


def smoc_path(site: str, month: str) -> Path:
    return OUT / f"smoc_{site}_{month}.nc"


def download_smoc(site: str, cfg: dict) -> None:
    """SMOC components over the radar box: cut from the bench files when the
    month exists there, else downloaded from Copernicus Marine."""
    import xarray as xr

    lo0, lo1, la0, la1 = radar_extent(site)
    lo0, lo1, la0, la1 = lo0 - 0.25, lo1 + 0.25, la0 - 0.25, la1 + 0.25
    for month in cfg["months"]:
        path = smoc_path(site, month)
        if path.exists():
            continue
        big = BENCH_GLOBAL / f"smoc_atl_{month}.nc"
        if big.exists():
            with xr.open_dataset(big) as ds:
                sub = ds[SMOC_VARS].sel(latitude=slice(la0, la1), longitude=slice(lo0, lo1)).load()
            sub.to_netcdf(path)
            print(f"{path.name}: cut from {big.name}", flush=True)
            continue
        _load_credentials()
        import copernicusmarine as cm

        start, end = month_range(month)
        cm.subset(
            dataset_id=SMOC_DATASET,
            variables=SMOC_VARS,
            minimum_longitude=lo0,
            maximum_longitude=lo1,
            minimum_latitude=la0,
            maximum_latitude=la1,
            start_datetime=_iso(start),
            end_datetime=_iso(end),
            output_directory=str(OUT),
            output_filename=path.name,
            disable_progress_bar=True,
        )
        print(f"{path.name}: {path.stat().st_size / 1e6:.0f} MB downloaded", flush=True)


def download_insitu(site: str, cfg: dict) -> None:
    """Monthly mooring files of the In Situ TAC (time series, ``TS``)."""
    _load_credentials()
    import copernicusmarine as cm

    d = OUT / site
    d.mkdir(parents=True, exist_ok=True)
    for month in cfg["months"]:
        ym = month.replace("-", "")
        for plat in cfg["platforms"]:
            if (d / f"{plat}_{ym}.nc").exists():
                continue
            try:
                cm.get(
                    dataset_id=cfg["dataset"],
                    dataset_part="monthly",
                    filter=f"*/{ym}/{plat}_{ym}.nc",
                    output_directory=str(d),
                    no_directories=True,
                    disable_progress_bar=True,
                )
            except Exception as e:  # a missing month is not fatal
                print(f"{site} {plat} {month}: {type(e).__name__}", flush=True)


def download_depth() -> None:
    """Global model bathymetry (1/12 deg) to sort points by water depth."""
    if DEPTH_FILE.exists():
        return
    _load_credentials()
    import copernicusmarine as cm

    cm.subset(
        dataset_id=STATIC_DATASET,
        variables=["deptho"],
        minimum_longitude=-20,
        maximum_longitude=13,
        minimum_latitude=35,
        maximum_latitude=56,
        output_directory=str(OUT),
        output_filename=DEPTH_FILE.name,
        disable_progress_bar=True,
    )


def cmd_download(args: argparse.Namespace) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    download_depth()
    for site, cfg in SITES.items():
        if args.site and site not in args.site:
            continue
        if cfg["kind"] == "shom":
            download_shom(site, cfg)
        elif cfg["kind"] == "insitu":
            download_insitu(site, cfg)
        else:
            download_erddap(site, cfg)
        if not args.radar_only:
            download_smoc(site, cfg)


# --------------------------------------------------------------------------
# Radar reading, hourly binning, QC


def _hour_bins(times: np.ndarray, hours: np.ndarray) -> np.ndarray:
    """Index of the hour each sample belongs to (nearest hour), -1 outside."""
    t = times.astype("datetime64[s]").astype("int64")
    h0 = hours[0].astype("datetime64[s]").astype("int64")
    k = np.rint((t - h0) / 3600.0).astype(int)
    return np.where((k >= 0) & (k < len(hours)), k, -1)


def _accumulate(acc: dict, k: np.ndarray, u: np.ndarray, v: np.ndarray, good: np.ndarray):
    """Sum good samples (time, y, x) into hourly bins."""
    u0 = np.where(good, u, 0.0)
    v0 = np.where(good, v, 0.0)
    for i in np.unique(k[k >= 0]):
        sel = k == i
        acc["su"][i] += u0[sel].sum(axis=0)
        acc["sv"][i] += v0[sel].sum(axis=0)
        acc["n"][i] += good[sel].sum(axis=0)


def read_moorings(site: str, month: str):
    """Hourly current of each mooring at its shallowest sensor (kt).

    Returns ``(hours, lat, lon, u, v, names)``, ``u``/``v`` shaped (T, N).
    Samples flagged 0, 1 or 2 (``HCSP_QC``, ``HCDT_QC``), ``HCDT`` read
    as the direction the current sets to (OceanSITES).
    """
    import xarray as xr

    cfg = SITES[site]
    start, end = month_range(month)
    hours = np.arange(
        np.datetime64(start.replace(tzinfo=None), "s"),
        np.datetime64(end.replace(tzinfo=None), "s") + 1,
        np.timedelta64(3600, "s"),
    )
    ym = month.replace("-", "")
    lats, lons, us, vs, names = [], [], [], [], []
    # Positions come from the first month so that a point keeps one place.
    for plat in cfg["platforms"]:
        path = OUT / site / f"{plat}_{ym}.nc"
        first = OUT / site / f"{plat}_{cfg['months'][0].replace('-', '')}.nc"
        pos_path = first if first.exists() else path
        if not pos_path.exists():
            continue
        with xr.open_dataset(pos_path) as ds:
            la = float(np.nanmedian(ds["LATITUDE"].values))
            lo = float(np.nanmedian(ds["LONGITUDE"].values))
        u = np.full(len(hours), np.nan)
        v = np.full(len(hours), np.nan)
        if path.exists():
            with xr.open_dataset(path) as ds:
                if "HCSP" in ds and "HCDT" in ds:
                    spd = ds["HCSP"].values.astype(float)
                    drc = ds["HCDT"].values.astype(float)
                    # QC 0 (not checked) is kept: Oleron ships nothing else.
                    # A 3 m/s ceiling stands in for the missing range test.
                    good = np.isin(ds["HCSP_QC"].values, (0, 1, 2)) & np.isin(
                        ds["HCDT_QC"].values, (0, 1, 2)
                    )
                    good &= np.isfinite(spd) & np.isfinite(drc) & (spd < 3.0)
                    if spd.ndim == 2:
                        j = int(np.argmax(good.sum(axis=0)))  # sensor with most data
                        spd, drc, good = spd[:, j], drc[:, j], good[:, j]
                    k = _hour_bins(ds["TIME"].values, hours)
                    uu = np.where(good, spd * np.sin(np.deg2rad(drc)), 0.0)
                    vv = np.where(good, spd * np.cos(np.deg2rad(drc)), 0.0)
                    su = np.bincount(k[k >= 0], uu[k >= 0], len(hours))
                    sv = np.bincount(k[k >= 0], vv[k >= 0], len(hours))
                    n = np.bincount(k[k >= 0], good[k >= 0].astype(float), len(hours))
                    with np.errstate(invalid="ignore", divide="ignore"):
                        u = np.where(n >= 1, su / n, np.nan) * MS_TO_KN
                        v = np.where(n >= 1, sv / n, np.nan) * MS_TO_KN
        lats.append(la)
        lons.append(lo)
        us.append(u)
        vs.append(v)
        names.append(plat)
    return (
        hours,
        np.array(lats),
        np.array(lons),
        np.column_stack(us),
        np.column_stack(vs),
        names,
    )


def depth_at(plat: np.ndarray, plon: np.ndarray) -> np.ndarray:
    """Water depth (m) of the global model cell nearest each point, NaN on land."""
    import xarray as xr

    if not DEPTH_FILE.exists():
        return np.full(len(plat), np.nan)
    with xr.open_dataset(DEPTH_FILE) as ds:
        lat1 = ds["latitude"].values.astype(float)
        lon1 = ds["longitude"].values.astype(float)
        dep = ds["deptho"].values.astype(float)
    iy = np.clip(np.rint((plat - lat1[0]) / (lat1[1] - lat1[0])).astype(int), 0, len(lat1) - 1)
    ix = np.clip(np.rint((plon - lon1[0]) / (lon1[1] - lon1[0])).astype(int), 0, len(lon1) - 1)
    return dep[iy, ix]


def atlas_m2(plat: np.ndarray, plon: np.ndarray) -> dict[str, np.ndarray]:
    """M2 semi-major axis (kt) of every atlas holding a cell near each point,
    whether or not the cascade serves it (third question)."""
    from openwind_data.currents.harmonic_analysis import current_ellipse
    from openwind_data.currents.marc_atlas import MarcAtlasRegistry, _extract_constants

    marc = MarcAtlasRegistry.from_directory(ATLAS_DIR)
    out: dict[str, np.ndarray] = {}
    for atlas in marc.atlases:
        col = np.full(len(plat), np.nan)
        for i, (la, lo) in enumerate(zip(plat.tolist(), plon.tolist(), strict=True)):
            if atlas.bbox and not (
                atlas.bbox[0] <= la <= atlas.bbox[2] and atlas.bbox[1] <= lo <= atlas.bbox[3]
            ):
                continue
            found = marc._best_cell(atlas, la, lo, required_col="M2_u_amp", neighbours=True)
            if found is None:
                continue
            cu = _extract_constants(found[0], found[1], "u")
            cv = _extract_constants(found[0], found[1], "v")
            if "M2" in cu and "M2" in cv:
                col[i] = current_ellipse(cu["M2"], cv["M2"]).semi_major * MS_TO_KN
        if np.isfinite(col).any():
            out[atlas.name] = col
    return out


def declined_tide(
    plat: np.ndarray, plon: np.ndarray, category: list[str], hours: np.ndarray
) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """Where the cascade fell back to SMOC, the tide of the atlas it declined.

    The first atlas in cascade order that holds a cell but passes on the point
    (``weak_tide`` under ``WEAK_TIDE_KT``, or ``excluded``: the Gibraltar box).
    Measures the two serving rules against the radar. NaN elsewhere.
    """
    from openwind_data.currents.harmonic import predict
    from openwind_data.currents.marc_atlas import MarcAtlasRegistry, _extract_constants

    marc = MarcAtlasRegistry.from_directory(ATLAS_DIR)
    times = [
        datetime.fromtimestamp(int(t), tz=UTC)
        for t in hours.astype("datetime64[s]").astype("int64")
    ]
    u = np.full((len(hours), len(plat)), np.nan)
    v = np.full((len(hours), len(plat)), np.nan)
    labels = [""] * len(plat)
    for i, (la, lo) in enumerate(zip(plat.tolist(), plon.tolist(), strict=True)):
        if category[i] != "smoc":
            continue
        for d in marc.declined_at(la, lo):
            if d.reason not in ("weak_tide", "excluded"):
                continue
            found = marc._best_cell(d.atlas, la, lo, required_col="M2_u_amp", neighbours=True)
            if found is None:
                continue
            cu = _extract_constants(found[0], found[1], "u")
            cv = _extract_constants(found[0], found[1], "v")
            if not cu or not cv:
                continue
            u[:, i] = predict(times, cu) * MS_TO_KN
            v[:, i] = predict(times, cv) * MS_TO_KN
            labels[i] = f"{d.atlas.name}:{d.reason}"
            break
    return u, v, labels


def read_radar(site: str, month: str):
    """Hourly radar for one month: (hours, lat, lon, u_kt, v_kt, n) on the grid.

    Good samples only (Shom ``flag == 1``, EU HFR node ``QCflag == 1``),
    vector mean of the samples within 30 min of each hour.
    """
    import netCDF4
    import xarray as xr

    cfg = SITES[site]
    start, end = month_range(month)
    hours = np.arange(
        np.datetime64(start.replace(tzinfo=None), "s"),
        np.datetime64(end.replace(tzinfo=None), "s") + 1,
        np.timedelta64(3600, "s"),
    )
    acc: dict | None = None
    lat = lon = None
    if cfg["kind"] == "shom":
        files = []
        for p in sorted((OUT / site).glob(f"{SHOM_MODEL}_*.zip")):
            day = p.stem.rsplit("_", 1)[1]
            if day[:6] == month.replace("-", ""):
                files.append(p)
        for p in files:
            with zipfile.ZipFile(p) as z:
                name = next(n for n in z.namelist() if n.endswith(".nc.gz"))
                raw = gzip.decompress(z.read(name))
            nc = netCDF4.Dataset("mem", memory=raw)
            with xr.open_dataset(xr.backends.NetCDF4DataStore(nc)) as ds:
                if acc is None:
                    lat = ds["latitude"].values.astype(float)
                    lon = ds["longitude"].values.astype(float)
                    shape = (len(hours), len(lat), len(lon))
                    acc = {"su": np.zeros(shape), "sv": np.zeros(shape), "n": np.zeros(shape, int)}
                u = ds["u"].values.astype(float)
                v = ds["v"].values.astype(float)
                good = (ds["flag"].values == 1) & np.isfinite(u) & np.isfinite(v)
                k = _hour_bins(ds["time"].values, hours)
            _accumulate(acc, k, u, v, good)
    else:
        path = OUT / site / f"{site}_{month}.nc"
        with xr.open_dataset(path) as ds:
            lat = ds["latitude"].values.astype(float)
            lon = ds["longitude"].values.astype(float)
            shape = (len(hours), len(lat), len(lon))
            acc = {"su": np.zeros(shape), "sv": np.zeros(shape), "n": np.zeros(shape, int)}
            k_all = _hour_bins(ds["time"].values, hours)
            step = 200
            for i0 in range(0, ds.sizes["time"], step):
                sl = slice(i0, i0 + step)
                u = ds["EWCT"].isel(time=sl, depth=0).values.astype(float)
                v = ds["NSCT"].isel(time=sl, depth=0).values.astype(float)
                qc = ds["QCflag"].isel(time=sl, depth=0).values
                good = (qc == 1) & np.isfinite(u) & np.isfinite(v)
                _accumulate(acc, k_all[sl], u, v, good)
    assert acc is not None and lat is not None and lon is not None
    n = acc["n"]
    ok = n >= cfg["min_per_hour"]
    with np.errstate(invalid="ignore", divide="ignore"):
        u = np.where(ok, acc["su"] / n, np.nan) * MS_TO_KN
        v = np.where(ok, acc["sv"] / n, np.nan) * MS_TO_KN
    return hours, lat, lon, u, v


# --------------------------------------------------------------------------
# SMOC and cascade


def _xyz(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    la, lo = np.deg2rad(lat), np.deg2rad(lon)
    return np.column_stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])


def _chord_km(d: np.ndarray) -> np.ndarray:
    return 2.0 * EARTH_KM * np.arcsin(np.clip(d / 2.0, 0.0, 1.0))


def smoc_series(site: str, month: str, plat: np.ndarray, plon: np.ndarray, hours: np.ndarray):
    """SMOC components (kt), (T, N), at the cell serving each point.

    The containing cell when wet, else the nearest wet one within 10 km
    (what Open-Meteo does near the coast, roughly); NaN beyond.
    """
    import xarray as xr
    from scipy.spatial import cKDTree

    with xr.open_dataset(smoc_path(site, month)) as ds:
        ds = ds.isel(depth=0) if "depth" in ds.dims else ds
        lat1 = ds["latitude"].values.astype(float)
        lon1 = ds["longitude"].values.astype(float)
        st = ds["time"].values.astype("datetime64[s]")
        it = np.searchsorted(st, hours)
        it_ok = (it < len(st)) & (st[np.clip(it, 0, len(st) - 1)] == hours)
        arrays = {v: ds[v].values.astype(float) for v in SMOC_VARS}
    wet = np.isfinite(arrays["utotal"]).mean(axis=0) > 0.5
    lo2, la2 = np.meshgrid(lon1, lat1)
    wy, wx = np.nonzero(wet)
    tree = cKDTree(_xyz(la2[wy, wx], lo2[wy, wx]))
    dlat, dlon = lat1[1] - lat1[0], lon1[1] - lon1[0]
    iy = np.clip(np.rint((plat - lat1[0]) / dlat).astype(int), 0, len(lat1) - 1)
    ix = np.clip(np.rint((plon - lon1[0]) / dlon).astype(int), 0, len(lon1) - 1)
    inside = wet[iy, ix]
    d, j = tree.query(_xyz(plat, plon))
    near = _chord_km(d) <= 10.0
    iy = np.where(inside, iy, np.where(near, wy[j], -1))
    ix = np.where(inside, ix, np.where(near, wx[j], -1))
    out = {}
    good = iy >= 0
    for v, a in arrays.items():
        col = np.full((len(hours), len(plat)), np.nan)
        sub = a[np.clip(it, 0, len(st) - 1)][:, iy[good], ix[good]]
        sub[~it_ok] = np.nan
        col[:, good] = sub * MS_TO_KN
        out[v] = col
    return out


def cascade_tide(plat: np.ndarray, plon: np.ndarray, hours: np.ndarray):
    """What the served cascade does at each point, and its tide (kt).

    Returns ``(u, v, meta)``: tide (T, N), NaN where the cascade answers
    SMOC or nothing; ``meta`` per point: source label, category, rank.
    Categories: ``shom``, ``coastal`` (atlas rank >= 2), ``open_sea``
    (rank <= 1), ``smoc`` (fallback), ``unknown_zone``, ``unknown_dead``,
    ``unknown_pass`` (blind pass within 3 km, the engine's rule).
    """
    from openwind_data.currents.harmonic import predict
    from openwind_data.currents.marc_atlas import MarcAtlasRegistry
    from openwind_data.currents.narrow_pass import source_confidence
    from openwind_data.currents.shom_c2d_registry import ShomC2dRegistry
    from openwind_data.currents.tidal_gaps import unknown_pass_along
    from openwind_data.currents.unknown_zones import unknown_zone_at

    marc = MarcAtlasRegistry.from_directory(ATLAS_DIR)
    shom = ShomC2dRegistry.from_directory(ATLAS_DIR)
    times = [
        datetime.fromtimestamp(int(t), tz=UTC)
        for t in hours.astype("datetime64[s]").astype("int64")
    ]
    n = len(plat)
    u = np.full((len(hours), n), np.nan)
    v = np.full((len(hours), n), np.nan)
    meta = {"source": [], "category": [], "rank": np.full(n, -1), "res_m": np.full(n, -1)}
    for i, (la, lo) in enumerate(zip(plat.tolist(), plon.tolist(), strict=True)):
        source, cat = "openmeteo_smoc", "smoc"
        zone = unknown_zone_at(la, lo)
        if zone is not None and "current" in zone.fields:
            source, cat = "unknown", "unknown_zone"
        elif shom.covers(la, lo):
            res = shom.predict_current_series(la, lo, times)
            if res is not None:
                spd, dirs, source = res
                r = np.deg2rad(dirs.astype(float))
                u[:, i] = spd * np.sin(r)
                v[:, i] = spd * np.cos(r)
                cat = "shom"
        else:
            atlas = marc.covers(la, lo)
            if atlas is not None:
                cell = marc.cell_at(la, lo)
                if cell is not None and cell.current_dead:
                    source, cat = "unknown", "unknown_dead"
                elif cell is not None and cell.u_constants and cell.v_constants:
                    u[:, i] = predict(times, cell.u_constants) * MS_TO_KN
                    v[:, i] = predict(times, cell.v_constants) * MS_TO_KN
                    source = atlas.source_label
                    cat = "coastal" if atlas.rank >= 2 else "open_sea"
                    meta["rank"][i] = atlas.rank
                    meta["res_m"][i] = atlas.resolution_m
        if cat in ("shom", "coastal", "open_sea", "smoc"):
            blind = unknown_pass_along(
                la, lo, la, lo, source, fine=source_confidence(source) == "high"
            )
            if blind is not None:
                cat = "unknown_pass"
                u[:, i] = v[:, i] = np.nan
        meta["source"].append(source)
        meta["category"].append(cat)
    return u, v, meta


def cmd_extract(args: argparse.Namespace) -> None:
    rng = np.random.default_rng(20261011)
    for site, cfg in SITES.items():
        if args.site and site not in args.site:
            continue
        months = [m for m in cfg["months"] if _month_ready(site, m)]
        if not months:
            print(f"{site}: no data", flush=True)
            continue
        hours_l, ou_l, ov_l = [], [], []
        lat = lon = None
        names: list[str] = []
        for month in months:
            if cfg["kind"] == "insitu":
                hours, lat, lon, u, v, names = read_moorings(site, month)
            else:
                hours, lat, lon, u, v = read_radar(site, month)
            hours_l.append(hours)
            ou_l.append(u)
            ov_l.append(v)
        hours = np.concatenate(hours_l)
        ou = np.concatenate(ou_l)
        ov = np.concatenate(ov_l)
        assert lat is not None and lon is not None
        valid = np.isfinite(ou) & np.isfinite(ov)
        share = valid.mean(axis=0)
        any_cell = valid.any(axis=0)
        if cfg["kind"] == "insitu":
            # Points, not a grid: a mooring with a fifth of the hours still counts.
            keep = share >= min(args.min_share, 0.2)
            plat, plon = lat[keep], lon[keep]
            obs_u, obs_v = ou[:, keep], ov[:, keep]
            names = [n for n, k in zip(names, keep, strict=True) if k]
        else:
            keep = share >= args.min_share
            thin = cfg["thin"]
            if thin > 1:
                mask = np.zeros_like(keep)
                mask[::thin, ::thin] = True
                keep &= mask
                any_cell &= mask
            iy, ix = np.nonzero(keep)
            lo2, la2 = np.meshgrid(lon, lat)
            plat, plon = la2[iy, ix], lo2[iy, ix]
            obs_u, obs_v = ou[:, iy, ix], ov[:, iy, ix]
            names = [f"{site}_{a}_{b}" for a, b in zip(iy.tolist(), ix.tolist(), strict=True)]
        print(
            f"{site}: {len(plat)} cells kept of {int(any_cell.sum())} with data "
            f"({len(hours)} h, {months})",
            flush=True,
        )
        sm = {k: [] for k in SMOC_VARS}
        for month, hrs in zip(months, hours_l, strict=True):
            s = smoc_series(site, month, plat, plon, hrs)
            for k in SMOC_VARS:
                sm[k].append(s[k])
        sm = {k: np.concatenate(x) for k, x in sm.items()}
        t0 = time.time()
        tu, tv, meta = cascade_tide(plat, plon, hours)
        print(f"{site}: cascade in {time.time() - t0:.0f} s", flush=True)
        has_tide = np.isfinite(tu).any(axis=0)
        unknown = np.array([c.startswith("unknown") for c in meta["category"]])
        a_u, a_v = sm["utotal"], sm["vtotal"]
        f_u, f_v = sm["utide"] + sm["uo"], sm["vtide"] + sm["vo"]
        s_u = np.where(has_tide, tu, a_u)
        s_v = np.where(has_tide, tv, a_v)
        s_u[:, unknown] = np.nan
        s_v[:, unknown] = np.nan
        d_u = np.where(has_tide, tu + sm["uo"], f_u)
        d_v = np.where(has_tide, tv + sm["vo"], f_v)
        x_u, x_v, x_lab = declined_tide(plat, plon, meta["category"], hours)
        np.savez_compressed(
            OUT / f"extract_{site}.npz",
            hours=hours,
            lat=plat,
            lon=plon,
            heading=rng.uniform(0.0, 2 * np.pi, len(plat)),
            obs_u=obs_u,
            obs_v=obs_v,
            A_u=a_u,
            A_v=a_v,
            S_u=s_u,
            S_v=s_v,
            F_u=f_u,
            F_v=f_v,
            D_u=d_u,
            D_v=d_v,
            tide_u=tu,
            tide_v=tv,
            smoc_tide_u=sm["utide"],
            smoc_tide_v=sm["vtide"],
            uo=sm["uo"],
            vo=sm["vo"],
            declined_u=x_u,
            declined_v=x_v,
            declined=np.array(x_lab),
            source=np.array(meta["source"]),
            category=np.array(meta["category"]),
            rank=meta["rank"],
            res_m=meta["res_m"],
            cells_with_data=int(any_cell.sum()),
            months=np.array(months),
            names=np.array(names),
            depth=depth_at(plat, plon),
            share=share[keep] if cfg["kind"] == "insitu" else share[iy, ix],
            **{f"m2_{k}": col for k, col in atlas_m2(plat, plon).items()},
        )
        cats = {c: meta["category"].count(c) for c in sorted(set(meta["category"]))}
        print(f"{site}: categories {cats}", flush=True)


def _month_ready(site: str, month: str) -> bool:
    if not smoc_path(site, month).exists():
        return False
    if SITES[site]["kind"] == "shom":
        return any((OUT / site).glob(f"{SHOM_MODEL}_{month.replace('-', '')}*.zip"))
    if SITES[site]["kind"] == "insitu":
        return any((OUT / site).glob(f"*_{month.replace('-', '')}.nc"))
    return (OUT / site / f"{site}_{month}.nc").exists()


# --------------------------------------------------------------------------
# Analyse


def metrics(cu, cv, ou, ov, heading) -> dict:
    """Pooled metrics of a candidate against the radar over finite pairs (kt)."""
    ok = np.isfinite(cu) & np.isfinite(cv) & np.isfinite(ou) & np.isfinite(ov)
    if not ok.any():
        return {"n": 0}
    du, dv = (cu - ou)[ok], (cv - ov)[ok]
    hb = np.broadcast_to(heading, cu.shape)[ok]
    along = du * np.sin(hb) + dv * np.cos(hb)
    sc, so = np.hypot(cu, cv)[ok], np.hypot(ou, ov)[ok]
    strong = so > 0.5
    ang = np.abs(
        (np.arctan2(cu[ok], cv[ok]) - np.arctan2(ou[ok], ov[ok]) + np.pi) % (2 * np.pi) - np.pi
    )
    return {
        "n": int(ok.sum()),
        "rmse": float(np.sqrt(np.mean(du**2 + dv**2))),
        "along": float(np.sqrt(np.mean(along**2))),
        "speed_bias": float(np.mean(sc - so)),
        "dir_err_deg": float(np.rad2deg(np.mean(ang[strong]))) if strong.any() else None,
        "n_strong": int(strong.sum()),
    }


def _cands(z) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    out = {c: (z[f"{c}_u"], z[f"{c}_v"]) for c in ("A", "S", "F", "D")}
    zero = np.zeros_like(z["A_u"])
    out["Z"] = (zero, zero)
    return out


def _table(z, sel: np.ndarray, common: bool = True) -> dict:
    """Metrics of every candidate on the points ``sel``; on the common sample
    (pairs where S is defined) when ``common``."""
    ou, ov = z["obs_u"][:, sel], z["obs_v"][:, sel]
    hd = z["heading"][sel]
    cands = _cands(z)
    mask = np.isfinite(ou)
    if common:
        for c in ("A", "S", "F", "D"):
            mask &= np.isfinite(cands[c][0][:, sel])
    res = {}
    for c, (cu, cv) in cands.items():
        cu2 = np.where(mask, cu[:, sel], np.nan)
        cv2 = np.where(mask, cv[:, sel], np.nan)
        res[c] = metrics(cu2, cv2, ou, ov, hd)
    so = np.hypot(ou, ov)[mask]
    res["obs_mean_speed"] = float(so.mean()) if so.size else None
    res["obs_p95_speed"] = float(np.percentile(so, 95)) if so.size else None
    return res


def m2_check(z, sel: np.ndarray) -> list[dict]:
    """Observed M2 ellipse against the served tide and SMOC tide (FES2014)."""
    from openwind_data.currents.harmonic_analysis import analyze, current_ellipse

    times = [
        datetime.fromtimestamp(int(t), tz=UTC)
        for t in z["hours"].astype("datetime64[s]").astype("int64")
    ]
    cons = ["M2", "S2", "N2", "K1", "O1", "M4"]
    out = []
    atlas_keys = [k for k in z.files if k.startswith("m2_")]
    for i in np.nonzero(sel)[0]:
        row = {
            "name": str(z["names"][i]),
            "lat": float(z["lat"][i]),
            "lon": float(z["lon"][i]),
            "depth_m": float(z["depth"][i]),
            "source": str(z["source"][i]),
            "category": str(z["category"][i]),
        }
        for k in atlas_keys:
            if np.isfinite(z[k][i]):
                row[f"atlas_{k[3:]}_m2_kt"] = float(z[k][i])
        for key, (uu, vv) in {
            "obs": (z["obs_u"][:, i], z["obs_v"][:, i]),
            "served": (z["tide_u"][:, i], z["tide_v"][:, i]),
            "smoc_tide": (z["smoc_tide_u"][:, i], z["smoc_tide_v"][:, i]),
        }.items():
            ok = np.isfinite(uu) & np.isfinite(vv)
            if ok.sum() < 24 * 20:
                continue
            try:
                ru, rv = analyze(times, uu, cons), analyze(times, vv, cons)
            except ValueError:
                continue
            e = current_ellipse(ru.constants["M2"], rv.constants["M2"])
            row[f"{key}_m2_kt"] = e.semi_major
            row[f"{key}_m2_phase"] = e.phase_deg
            row[f"{key}_m2_inc"] = e.inclination_deg
        out.append(row)
    return out


def rules(z, sel: np.ndarray) -> dict:
    """Candidate serving rules, scored on the common sample of ``sel``.

    ``D_if_tide>=x``: the hybrid where the served tide reaches ``x`` kt at
    spring (max of the predicted series), SMOC without Stokes (F) elsewhere.
    ``D_if_rank>=2``: the hybrid for SHOM and coastal atlases only.
    """
    ou, ov = z["obs_u"][:, sel], z["obs_v"][:, sel]
    hd = z["heading"][sel]
    cands = _cands(z)
    mask = np.isfinite(ou)
    for c in ("A", "S", "F", "D"):
        mask &= np.isfinite(cands[c][0][:, sel])
    tmax = np.nanmax(np.hypot(z["tide_u"], z["tide_v"]), axis=0)[sel]
    tmax = np.nan_to_num(tmax, nan=0.0)
    cat = z["category"][sel].astype(str)
    out = {}
    fu, fv = z["F_u"][:, sel], z["F_v"][:, sel]
    du, dv = z["D_u"][:, sel], z["D_v"][:, sel]
    choices = {f"D_if_tide>={x}": tmax >= x for x in (0.2, 0.3, 0.5, 0.75, 1.0, 1.5)}
    choices["D_if_rank>=2"] = np.isin(cat, ("shom", "coastal"))
    for name, use_d in choices.items():
        cu = np.where(use_d, du, fu)
        cv = np.where(use_d, dv, fv)
        out[name] = metrics(np.where(mask, cu, np.nan), np.where(mask, cv, np.nan), ou, ov, hd)
    return out


def declined_check(z) -> dict:
    """Where an atlas was declined (weak tide, exclusion box): SMOC against
    what the atlas would have served, alone and with SMOC circulation."""
    lab = z["declined"].astype(str)
    out = {}
    for reason in ("weak_tide", "excluded"):
        sel = np.char.endswith(lab, reason)
        if not sel.any():
            continue
        ou, ov = z["obs_u"][:, sel], z["obs_v"][:, sel]
        hd = z["heading"][sel]
        xu, xv = z["declined_u"][:, sel], z["declined_v"][:, sel]
        mask = np.isfinite(ou) & np.isfinite(xu) & np.isfinite(z["A_u"][:, sel])
        cands = {
            "A": (z["A_u"][:, sel], z["A_v"][:, sel]),
            "F": (z["F_u"][:, sel], z["F_v"][:, sel]),
            "atlas_tide": (xu, xv),
            "atlas_tide+uo": (xu + z["uo"][:, sel], xv + z["vo"][:, sel]),
            "Z": (np.zeros_like(xu), np.zeros_like(xv)),
        }
        res = {"cells": int(sel.sum()), "atlases": sorted(set(lab[sel].tolist()))}
        for c, (cu, cv) in cands.items():
            res[c] = metrics(np.where(mask, cu, np.nan), np.where(mask, cv, np.nan), ou, ov, hd)
        out[reason] = res
    return out


def best_lag(z, sel: np.ndarray) -> dict:
    """Shift (h) minimising the vector RMSE of A and S: a timing sanity check."""
    ou, ov = z["obs_u"][:, sel], z["obs_v"][:, sel]
    out = {}
    for c in ("A", "S"):
        cu, cv = z[f"{c}_u"][:, sel], z[f"{c}_v"][:, sel]
        errs = {}
        for lag in range(-2, 3):
            su, sv = np.roll(cu, lag, axis=0), np.roll(cv, lag, axis=0)
            ok = np.isfinite(su) & np.isfinite(ou)
            if ok.any():
                errs[lag] = float(np.sqrt(np.mean(((su - ou) ** 2 + (sv - ov) ** 2)[ok])))
        if errs:
            out[c] = min(errs, key=errs.get)
    return out


DEPTH_BANDS = ((0, 50), (50, 200), (200, 1000), (1000, 7000))


def m2_summary(rows: list[dict]) -> dict:
    """Median M2 semi-major axis (kt) per depth band: radar, served tide,
    SMOC tide (FES2014) and every atlas, on the cells holding the radar fit."""
    out = {}
    for lo_, hi_ in DEPTH_BANDS:
        band = [r for r in rows if lo_ <= r.get("depth_m", np.nan) < hi_ and "obs_m2_kt" in r]
        if not band:
            continue
        keys = sorted({k for r in band for k in r if k.endswith("_m2_kt")})
        res: dict = {"cells": len(band)}
        for k in keys:
            vals = np.array([r[k] for r in band if k in r])
            obs = np.array([r["obs_m2_kt"] for r in band if k in r])
            res[k] = {
                "n": len(vals),
                "median": float(np.median(vals)),
                "median_ratio_to_obs": float(np.median(vals / obs)) if k != "obs_m2_kt" else 1.0,
            }
        out[f"{lo_}-{hi_} m"] = res
    return out


def cmd_analyse(args: argparse.Namespace) -> None:
    report: dict = {"sites": {}}
    pooled: dict[str, list] = {c: [] for c in CANDIDATES}
    for site in SITES:
        path = OUT / f"extract_{site}.npz"
        if not path.exists():
            continue
        z = np.load(path, allow_pickle=False)
        cat = z["category"]
        n_pts = len(cat)
        unknown = np.char.startswith(cat.astype(str), "unknown")
        entry: dict = {
            "months": z["months"].tolist(),
            "hours": len(z["hours"]),
            "cells_with_data": int(z["cells_with_data"]),
            "cells_used": n_pts,
            "obs_valid_share": float(np.isfinite(z["obs_u"]).mean()),
            "categories": {str(c): int((cat == c).sum()) for c in np.unique(cat)},
            "sources": {str(s): int((z["source"] == s).sum()) for s in np.unique(z["source"])},
            "all_known": _table(z, ~unknown),
            "all_points_no_S": _table(z, np.ones(n_pts, bool), common=False),
            "by_category": {},
        }
        for c in np.unique(cat):
            sel = cat == c
            entry["by_category"][str(c)] = _table(z, sel, common=not str(c).startswith("unknown"))
        # Tide strength bands: spring-ish max of the observed speed per cell.
        smax = np.nanpercentile(np.hypot(z["obs_u"], z["obs_v"]), 95, axis=0)
        entry["by_obs_p95"] = {}
        for lo_, hi_ in ((0, 0.5), (0.5, 1.0), (1.0, 2.0), (2.0, 99)):
            sel = (~unknown) & (smax >= lo_) & (smax < hi_)
            if sel.any():
                entry["by_obs_p95"][f"{lo_}-{hi_}"] = _table(z, sel) | {"cells": int(sel.sum())}
        if args.m2:
            rows = m2_check(z, ~unknown)
            entry["m2"] = rows
            entry["m2_by_depth"] = m2_summary(rows)
        entry["by_depth"] = {}
        for lo_, hi_ in DEPTH_BANDS:
            sel = (~unknown) & (z["depth"] >= lo_) & (z["depth"] < hi_)
            if sel.any():
                entry["by_depth"][f"{lo_}-{hi_} m"] = _table(z, sel) | {"cells": int(sel.sum())}
        by_source = {}
        for src in np.unique(z["source"]):
            sel = (~unknown) & (z["source"] == src)
            if sel.any():
                by_source[str(src)] = _table(z, sel) | {"cells": int(sel.sum())}
        entry["by_source"] = by_source
        entry["rules"] = rules(z, ~unknown)
        entry["declined"] = declined_check(z)
        entry["best_lag_h"] = best_lag(z, ~unknown)
        if SITES[site]["kind"] == "insitu":
            entry["per_point"] = {
                str(z["names"][i]): _table(z, np.arange(n_pts) == i)
                | {
                    "source": str(z["source"][i]),
                    "depth_m": float(z["depth"][i]),
                }
                for i in range(n_pts)
                if not unknown[i]
            }
        report["sites"][site] = entry
        # Pooled over sites, common sample.
        ou, ov = z["obs_u"][:, ~unknown], z["obs_v"][:, ~unknown]
        cands = _cands(z)
        mask = np.isfinite(ou)
        for c in ("A", "S", "F", "D"):
            mask &= np.isfinite(cands[c][0][:, ~unknown])
        hb = np.broadcast_to(z["heading"][~unknown], ou.shape)
        for c, (cu, cv) in cands.items():
            du = (cu[:, ~unknown] - ou)[mask]
            dv = (cv[:, ~unknown] - ov)[mask]
            pooled[c].append(
                np.column_stack([du, dv, du * np.sin(hb[mask]) + dv * np.cos(hb[mask])])
            )
    report["pooled"] = {}
    for c, parts in pooled.items():
        if not parts:
            continue
        a = np.concatenate(parts)
        report["pooled"][c] = {
            "n": len(a),
            "rmse": float(np.sqrt(np.mean(a[:, 0] ** 2 + a[:, 1] ** 2))),
            "along": float(np.sqrt(np.mean(a[:, 2] ** 2))),
        }
    path = OUT / "results.json"
    path.write_text(json.dumps(report, indent=1, default=float))
    print(f"wrote {path}")
    _print_summary(report)


def _print_summary(report: dict) -> None:
    def line(name: str, t: dict) -> str:
        cells = []
        for c in CANDIDATES:
            m = t.get(c, {})
            if not m or not m.get("n"):
                cells.append(f"{c}: -")
                continue
            de = m.get("dir_err_deg")
            cells.append(
                f"{c}: {m['rmse']:.3f}/{m['along']:.3f} b{m['speed_bias']:+.2f}"
                + (f" d{de:.0f}" if de is not None else "")
            )
        return f"  {name:<22} n={t.get('S', t.get('A', {})).get('n', 0):>8}  " + " | ".join(cells)

    for site, e in report["sites"].items():
        print(f"\n{site} {e['months']} cells {e['cells_used']}/{e['cells_with_data']}")
        print(f"  categories {e['categories']}")
        print(line("all (known)", e["all_known"]))
        for c, t in e["by_category"].items():
            print(line(c, t))
        for b, t in e["by_obs_p95"].items():
            print(line(f"obs p95 {b} ({t['cells']})", t))
    print(
        "\npooled",
        {c: (round(v["rmse"], 3), round(v["along"], 3)) for c, v in report["pooled"].items()},
    )


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("download")
    d.add_argument("--site", nargs="*")
    d.add_argument("--radar-only", action="store_true")
    d.set_defaults(func=cmd_download)
    e = sub.add_parser("extract")
    e.add_argument("--site", nargs="*")
    e.add_argument("--min-share", type=float, default=0.3, help="share of hours with good data")
    e.set_defaults(func=cmd_extract)
    a = sub.add_parser("analyse")
    a.add_argument("--m2", action="store_true", help="harmonic M2 check per cell")
    a.set_defaults(func=cmd_analyse)
    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
