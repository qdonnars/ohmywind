# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Tidal harmonic predictor.

Schureman + Cartwright 1985 astronomical longitudes. Standard convention used
by SHOM, PREVIMER and most national hydrographic services:

    h(t) = Z0 + sum_i [ H_i * f_i(t) * cos(sigma_i * dt + V0_i(t) + u_i(t) - G_i) ]

where H_i is the amplitude (m for heights, m/s for current components),
G_i is the Greenwich phase lag (degrees, UTC reference), f_i/u_i are nodal
corrections, and V0_i is the equilibrium argument at the start of the
prediction day. sigma_i is the constituent angular frequency (deg/h).

This module is a clean Python port of the public-domain NOC reconstruction
code (Hughes/Williams, NOC-MSM/anyTide) using Cartwright (1985) astronomical
longitudes. The formulation matches what the LEGOS Tidal ToolBox `predictor`
applies on PREVIMER atlases. End-to-end validation against REFMAR Brest 2008
gives RMSE 14 cm and r-squared = 0.99 over 8000+ hourly observations using
MARC PREVIMER FINIS atlas constants directly (no transform on G).

Avoid utide.reconstruct or uptide.from_amplitude_phase with externally
sourced constants: those libraries assume their internal V0 convention which
differs from the absolute Schureman one expected here.
"""

from __future__ import annotations

from datetime import UTC, datetime

import numpy as np

# fmt: off
# 60 standard constituents, Doodson-indexed, with angular frequencies (deg/h).
# Subset of NOC's 120; covers all MARC PREVIMER constituents we use.
NAMES: tuple[str, ...] = (
    "SA",   "SSA",  "MM",   "MSF",  "MF",   "2Q1",  "SIG1", "Q1",   "RO1",  "O1",
    "MP1",  "M1",   "CHI1", "PI1",  "P1",   "S1",   "K1",   "PSI1", "PHI1", "TH1",
    "J1",   "SO1",  "OO1",  "OQ2",  "MNS2", "2N2",  "MU2",  "N2",   "NU2",  "OP2",
    "M2",   "MKS2", "LAM2", "L2",   "T2",   "S2",   "R2",   "K2",   "MSN2", "KJ2",
    "2SM2", "MO3",  "M3",   "SO3",  "MK3",  "SK3",  "MN4",  "M4",   "SN4",  "MS4",
    "MK4",  "S4",   "SK4",  "2MN6", "M6",   "MSN6", "2MS6", "2MK6", "2SM6", "MSK6",
)

FREQS_DEG_PER_H: tuple[float, ...] = (
    0.0410686,  0.0821373,  0.5443747,  1.0158958,  1.0980330,
    12.8542862, 12.9271398, 13.3986609, 13.4715145, 13.9430356,
    14.0251729, 14.4920521, 14.5695476, 14.9178647, 14.9589314,
    15.0000000, 15.0410686, 15.0821353, 15.1232059, 15.5125897,
    15.5854433, 16.0569644, 16.1391017, 27.3416965, 27.4238338,
    27.8953548, 27.9682085, 28.4397295, 28.5125832, 28.9019670,
    28.9841042, 29.0662415, 29.4556253, 29.5284789, 29.9589333,
    30.0000000, 30.0410667, 30.0821373, 30.5443747, 30.6265120,
    31.0158958, 42.9271398, 43.4761564, 43.9430356, 44.0251729,
    45.0410686, 57.4238338, 57.9682085, 58.4397295, 58.9841042,
    59.0662415, 60.0000000, 60.0821373, 86.4079380, 86.9523127,
    87.4238338, 87.9682085, 88.0503458, 88.9841042, 89.0662415,
)
# fmt: on

NCONST = 60
_NAME_TO_IDX = {n: i for i, n in enumerate(NAMES)}

# Constituent name aliases — MARC PREVIMER uses some non-standard spellings.
# Maps any input to the canonical NOC table name.
ALIASES: dict[str, str] = {
    # MARC -> canonical
    "Mf": "MF",
    "Mm": "MM",
    "Mu2": "MU2",
    "Nu2": "NU2",
    "Ki1": "CHI1",
    "Ro1": "RO1",
    "Sig1": "SIG1",
    "Tta1": "TH1",
    "Phi1": "PHI1",
    "Pi1": "PI1",
    "Psi1": "PSI1",
    "La2": "LAM2",
    # Same names, just casing
    "OO1": "OO1",
    "MSF": "MSF",
    # Aliases with no NOC equivalent — drop silently when not in table
    # (KQ1, E2, MP1 may apply depending on NOC version)
}


def _canonical(name: str) -> str | None:
    """Return canonical NOC name for ``name``, or ``None`` if unknown."""
    n = ALIASES.get(name, name)
    return n if n in _NAME_TO_IDX else None


def _utc_to_mjd(t: datetime) -> float:
    """Modified Julian Date (days since 1858-11-17 00:00 UT)."""
    if t.tzinfo is None:
        t = t.replace(tzinfo=UTC)
    epoch = datetime(1858, 11, 17, tzinfo=UTC)
    return (t - epoch).total_seconds() / 86400.0


def _astronomical_longitudes(mjdn: np.ndarray) -> tuple[np.ndarray, ...]:
    """Cartwright 1985 ecliptic mean longitudes (s, h, p, N, p1) at 00:00 UT of ``mjdn``.

    Includes UT→TDT correction (deltat ≈ 32 s + drift). Returns degrees mod 360.
    """
    cycle = 360.0
    c, b = 32.0, 90.0
    t0 = (36204.0 - 51544.5) / 36525.0
    a_const = 32.184 - b * t0 - c * t0**2

    t = (mjdn - 51544 - 0.5) / 36525  # Julian centuries UTC after J2000
    dt = a_const + b * t + c * t**2
    tt = t + dt / (86400.0 * 36525.0)  # TDT centuries

    s = 218.3166 + 481267.8811 * tt - 0.0019 * tt**2
    h = 280.4661 + 36000.7698 * tt + 0.0003 * tt**2
    p = 83.3532 + 4069.0136 * tt - 0.0106 * tt**2
    en = 125.0445 - 1934.1364 * tt + 0.0018 * tt**2
    p1 = 282.9384 + 1.7194 * tt + 0.0002 * tt**2

    return tuple(np.mod(x, cycle) for x in (s, h, p, en, p1))


def _equilibrium_argument(
    s: np.ndarray, h: np.ndarray, p: np.ndarray, p1: np.ndarray
) -> np.ndarray:
    """V0 (degrees mod 360) at 00:00 UT for all 60 constituents.

    Returns shape (n_times, NCONST). NOC's vsetfast, using the table mapping.
    """
    h2, h3, h4 = h + h, h + h + h, h + h + h + h
    s2, s3, s4 = s + s, s + s + s, s + s + s + s
    p2 = p + p
    n = len(s)
    # Use 1-indexed array (size 121) then drop and reindex to 0..59.
    v = np.zeros((n, 121))
    v[:, 1] = h
    v[:, 2] = h2
    v[:, 3] = s - p
    v[:, 4] = s2 - h2
    v[:, 5] = s2
    v[:, 6] = h - s4 + p2 + 270.0
    v[:, 7] = h3 - s4 + 270.0
    v[:, 8] = h - s3 + p + 270.0
    v[:, 9] = h3 - s3 - p + 270.0
    v[:, 10] = h - s2 + 270.0
    v[:, 11] = h3 - s2 + 90.0
    v[:, 12] = h - s + 90.0
    v[:, 13] = h3 - s - p + 90.0
    v[:, 14] = p1 - h2 + 270.0
    v[:, 15] = 270.0 - h
    v[:, 16] = 180.0
    v[:, 17] = h + 90.0
    v[:, 18] = h2 - p1 + 90.0
    v[:, 19] = h3 + 90.0
    v[:, 20] = s - h + p + 90.0
    v[:, 21] = s + h - p + 90.0
    v[:, 23] = s2 + h + 90.0
    v[:, 26] = h2 - s4 + p2
    v[:, 27] = h4 - s4
    v[:, 28] = h2 - s3 + p
    v[:, 29] = h4 - s3 - p
    v[:, 31] = h2 - s2
    v[:, 32] = h4 - s2
    v[:, 33] = p - s + 180.0
    v[:, 34] = h2 - s - p + 180.0
    v[:, 35] = p1 - h
    v[:, 36] = 0.0
    v[:, 37] = h - p1 + 180.0
    v[:, 38] = h2
    v[:, 22] = -v[:, 10]
    v[:, 24] = v[:, 10] + v[:, 8]
    v[:, 25] = v[:, 31] + v[:, 28]
    v[:, 30] = v[:, 10] + v[:, 15]
    v[:, 39] = v[:, 31] - v[:, 28]
    v[:, 40] = v[:, 17] + v[:, 21]
    v[:, 41] = -v[:, 31]
    v[:, 42] = v[:, 31] + v[:, 10]
    v[:, 43] = h3 - s3 + 180.0
    v[:, 44] = v[:, 10]
    v[:, 45] = v[:, 31] + v[:, 17]
    v[:, 46] = v[:, 17]
    v[:, 47] = v[:, 25]
    v[:, 48] = v[:, 31] + v[:, 31]
    v[:, 49] = v[:, 28]
    v[:, 50] = v[:, 31]
    v[:, 51] = v[:, 31] + v[:, 38]
    v[:, 52] = 0.0
    v[:, 53] = v[:, 38]
    v[:, 54] = v[:, 48] + v[:, 28]
    v[:, 55] = v[:, 48] + v[:, 31]
    v[:, 56] = v[:, 47]
    v[:, 57] = v[:, 48]
    v[:, 58] = v[:, 48] + v[:, 38]
    v[:, 59] = v[:, 31]
    v[:, 60] = v[:, 51]
    v = np.mod(v, 360.0)
    v[v < 0.0] += 360.0
    return np.roll(v, -1, axis=1)[:, :NCONST]


def _nodal_corrections(p: np.ndarray, en: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Nodal phase u (degrees) and amplitude factor f (unitless) for all 60 constituents.

    Port of NOC's ufsetfast. Returns shape (n_times, NCONST) for both arrays.
    """
    rad = np.pi / 180.0
    deg = 180.0 / np.pi
    pw = p * rad
    nw = en * rad
    w1, w2, w3 = np.cos(nw), np.cos(2 * nw), np.cos(3 * nw)
    w4, w5, w6 = np.sin(nw), np.sin(2 * nw), np.sin(3 * nw)
    a1 = pw - nw
    a2 = 2.0 * pw
    a3 = a2 - nw
    a4 = a2 - 2.0 * nw

    n = len(p)
    u = np.zeros((n, 121))
    f = np.zeros((n, 121))

    # Primary formulas (1-indexed, NOC convention)
    u[:, 3] = 0.0
    f[:, 3] = 1.0 - 0.1300 * w1 + 0.0013 * w2  # MM
    u[:, 5] = -0.4143 * w4 + 0.0468 * w5 - 0.0066 * w6
    f[:, 5] = 1.0429 + 0.4135 * w1 - 0.004 * w2  # MF
    u[:, 10] = 0.1885 * w4 - 0.0234 * w5 + 0.0033 * w6
    f[:, 10] = 1.0089 + 0.1871 * w1 - 0.0147 * w2 + 0.0014 * w3  # O1

    # M1 (constituent index 12) — atan2 of (x, y)
    x = 2.0 * np.cos(pw) + 0.4 * np.cos(a1)
    y = np.sin(pw) + 0.2 * np.sin(a1)
    u[:, 12] = np.arctan2(y, x)
    f[:, 12] = np.sqrt(x**2 + y**2)

    u[:, 17] = -0.1546 * w4 + 0.0119 * w5 - 0.0012 * w6
    f[:, 17] = 1.0060 + 0.1150 * w1 - 0.0088 * w2 + 0.0006 * w3  # K1
    u[:, 21] = -0.2258 * w4 + 0.0234 * w5 - 0.0033 * w6
    f[:, 21] = 1.0129 + 0.1676 * w1 - 0.0170 * w2 + 0.0016 * w3  # J1
    f[:, 23] = 1.1027 + 0.6504 * w1 + 0.0317 * w2 - 0.0014 * w3
    u[:, 23] = -0.6402 * w4 + 0.0702 * w5 - 0.0099 * w6  # OO1
    u[:, 31] = -0.0374 * w4
    f[:, 31] = 1.0004 - 0.0373 * w1 + 0.0002 * w2  # M2

    # L2 (idx 34) — uses x,y / atan2 form
    x = 1.0 - 0.2505 * np.cos(a2) - 0.1102 * np.cos(a3) - 0.0156 * np.cos(a4) - 0.037 * w1
    y = -0.2505 * np.sin(a2) - 0.1102 * np.sin(a3) - 0.0156 * np.sin(a4) - 0.037 * w4
    u[:, 34] = np.arctan2(y, x)
    f[:, 34] = np.sqrt(x**2 + y**2)

    u[:, 38] = -0.3096 * w4 + 0.0119 * w5 - 0.0007 * w6
    f[:, 38] = 1.0241 + 0.2863 * w1 + 0.0083 * w2 - 0.0015 * w3  # K2

    # Compound u's (radians, copied from primaries)
    u[:, 1] = 0.0
    u[:, 2] = 0.0
    u[:, 4] = -u[:, 31]
    u[:, 6] = u[:, 10]
    u[:, 7] = u[:, 10]
    u[:, 8] = u[:, 10]
    u[:, 9] = u[:, 10]
    u[:, 11] = u[:, 31]
    u[:, 13] = u[:, 21]
    u[:, 14] = 0.0
    u[:, 15] = 0.0
    u[:, 16] = 0.0
    u[:, 18] = 0.0
    u[:, 19] = 0.0
    u[:, 20] = u[:, 21]
    u[:, 22] = -u[:, 10]
    u[:, 24] = 2.0 * u[:, 10]
    u[:, 25] = 2.0 * u[:, 31]
    u[:, 26] = u[:, 31]
    u[:, 27] = u[:, 31]
    u[:, 28] = u[:, 31]
    u[:, 29] = u[:, 31]
    u[:, 30] = u[:, 10]
    u[:, 32] = u[:, 31] + u[:, 38]
    u[:, 33] = u[:, 31]
    u[:, 35] = 0.0
    u[:, 36] = 0.0
    u[:, 37] = 0.0
    u[:, 39] = 0.0
    u[:, 40] = u[:, 17] + u[:, 21]
    u[:, 41] = u[:, 4]
    u[:, 42] = u[:, 31] + u[:, 10]
    u[:, 43] = u[:, 31] * 1.5
    u[:, 44] = u[:, 10]
    u[:, 45] = u[:, 31] + u[:, 17]
    u[:, 46] = u[:, 17]
    u[:, 47] = u[:, 25]
    u[:, 48] = u[:, 25]
    u[:, 49] = u[:, 31]
    u[:, 50] = u[:, 31]
    u[:, 51] = u[:, 32]
    u[:, 52] = 0.0
    u[:, 53] = u[:, 38]
    u[:, 54] = u[:, 25] + u[:, 31]
    u[:, 55] = u[:, 54]
    u[:, 56] = u[:, 25]
    u[:, 57] = u[:, 25]
    u[:, 58] = u[:, 25] + u[:, 38]
    u[:, 59] = u[:, 31]
    u[:, 60] = u[:, 32]

    u = np.mod(u * deg, 360.0)
    u[u < 0.0] += 360.0

    # Compound f's
    f[:, 1] = 1.0
    f[:, 2] = 1.0
    f[:, 4] = f[:, 31]
    f[:, 6] = f[:, 10]
    f[:, 7] = f[:, 10]
    f[:, 8] = f[:, 10]
    f[:, 9] = f[:, 10]
    f[:, 11] = f[:, 31]
    f[:, 13] = f[:, 21]
    f[:, 14] = 1.0
    f[:, 15] = 1.0
    f[:, 16] = 1.0
    f[:, 18] = 1.0
    f[:, 19] = 1.0
    f[:, 20] = f[:, 21]
    f[:, 22] = f[:, 10]
    f[:, 24] = f[:, 10] ** 2
    f[:, 25] = f[:, 31] ** 2
    f[:, 26] = f[:, 31]
    f[:, 27] = f[:, 31]
    f[:, 28] = f[:, 31]
    f[:, 29] = f[:, 31]
    f[:, 30] = f[:, 10]
    f[:, 32] = f[:, 31] * f[:, 38]
    f[:, 33] = f[:, 31]
    f[:, 35] = 1.0
    f[:, 36] = 1.0
    f[:, 37] = 1.0
    f[:, 39] = f[:, 25]
    f[:, 40] = f[:, 17] * f[:, 21]
    f[:, 41] = f[:, 31]
    f[:, 42] = f[:, 31] * f[:, 10]
    f[:, 43] = f[:, 31] ** 1.5
    f[:, 44] = f[:, 10]
    f[:, 45] = f[:, 31] * f[:, 17]
    f[:, 46] = f[:, 17]
    f[:, 47] = f[:, 25]
    f[:, 48] = f[:, 25]
    f[:, 49] = f[:, 31]
    f[:, 50] = f[:, 31]
    f[:, 51] = f[:, 32]
    f[:, 52] = 1.0
    f[:, 53] = f[:, 38]
    f[:, 54] = f[:, 25] * f[:, 31]
    f[:, 55] = f[:, 54]
    f[:, 56] = f[:, 25]
    f[:, 57] = f[:, 25]
    f[:, 58] = f[:, 25] * f[:, 38]
    f[:, 59] = f[:, 31]
    f[:, 60] = f[:, 32]

    u = np.roll(u, -1, axis=1)[:, :NCONST]
    f = np.roll(f, -1, axis=1)[:, :NCONST]
    return u, f


def predict(
    times_utc: list[datetime],
    constants: dict[str, tuple[float, float]],
    z0: float = 0.0,
) -> np.ndarray:
    """Predict tide heights (or current component) at the given UTC times.

    Args:
        times_utc: list of timezone-aware (UTC) datetime instances.
        constants: mapping ``{constituent_name: (amplitude, phase_g_deg)}``.
            Names use either canonical NOC spelling (e.g. ``"M2"``, ``"MF"``)
            or MARC PREVIMER spelling (e.g. ``"Mf"``, ``"La2"``); see
            ``ALIASES``. Constituents not in the NOC-60 table are silently
            skipped.
        z0: constant offset added to the prediction (m). Default 0 (predict
            around mean sea level — the convention for MARC PREVIMER).

    Returns:
        Array of predicted heights in metres, shape (len(times_utc),).
    """
    if not times_utc:
        return np.zeros(0)

    mjd = np.array([_utc_to_mjd(t) for t in times_utc])
    mjdn = np.floor(mjd).astype(int)
    hrs = 24.0 * (mjd - mjdn)

    s, h, p, en, p1 = _astronomical_longitudes(mjdn)
    v_arr = _equilibrium_argument(s, h, p, p1)
    u_arr, f_arr = _nodal_corrections(p, en)

    pred = np.full(len(times_utc), z0, dtype=float)
    rad = np.pi / 180.0
    for raw_name, (amp, ga) in constants.items():
        canonical = _canonical(raw_name)
        if canonical is None:
            continue
        k = _NAME_TO_IDX[canonical]
        sigma = FREQS_DEG_PER_H[k]
        pred += amp * f_arr[:, k] * np.cos(rad * (sigma * hrs + v_arr[:, k] + u_arr[:, k] - ga))
    return pred
