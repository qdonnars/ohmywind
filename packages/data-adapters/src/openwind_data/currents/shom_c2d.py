# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Parser for the SHOM "Courants de marée 2D" ASCII atlas (Édition 2005).

This module loads the public-domain dataset distributed by SHOM under
Licence Ouverte v2.0 (cf. ``data.gouv.fr/datasets/courants-de-maree-des-cotes-
de-france-manche-atlantique-produit-numerique-1``). The product covers the
French Manche and Atlantic coasts with hand-curated current vectors at
discrete points, organised hour-by-hour relative to the high or low tide
of a reference port.

It is **not** wired into the runtime cascade — MARC PREVIMER (250 m on
critical passes, 700 m on the shelf) is finer than every C2D zone except
a few micro-cartouches (Bloscon 170 m, Roscoff 160 m). C2D's value lives
elsewhere:

1. As a **bench reference** for measuring MARC skill at named hotspots
   (Goulet de Brest, Raz de Sein, Ouessant, Goulet du Morbihan,
   Saint-Malo, Hague). C2D is built from a different model lineage
   (TELEMAC-2D or SHOM finite-difference) with denser bathymetry and
   has been validated against SHOM in-situ measurements, so divergence
   between MARC and C2D at the same point is meaningful signal.
2. As a **cross-check** for narrow-pass-zone definitions: where C2D and
   MARC disagree by more than X%, the bbox is a candidate for the
   ``narrow_pass`` registry.

Format reference: ``DOCUMENTATION/NoticeCourants.pdf`` §8.2 inside the
SHOM C2D distribution. Each zone file is ASCII Latin-1 encoded:

- Line 1: reference port name. Suffix ``.BM`` (or ``BM``) means the
  hourly index is referenced to **low** tide; otherwise high tide.
- For each grid point, three lines:
  1. Position WGS84 ``sDDMM.mmm sDDDMM.mmm`` (lat, lon, signed degrees +
     decimal minutes; lat positive = N, lon positive = E).
  2. Vives-eaux (coef 95) — 13 U values, ``*``, 13 V values.
     Tenths of a knot. Hour offsets -6h, -5h, ..., 0h, +1h, ..., +6h
     relative to the reference port's high (or low) tide.
     Components positive toward east (U) and north (V).
  3. Mortes-eaux (coef 45) — same layout.

To predict the current at coefficient C, linearly interpolate:

    V(C) = V_me + (C - 45) / 50 * (V_ve - V_me)

Mediterranean coasts are not covered (per SHOM: tidal currents
negligible there).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

# Hours sampled in each VE/ME line, relative to PM/BM at the reference port.
HOUR_OFFSETS: tuple[int, ...] = tuple(range(-6, 7))  # -6, -5, ..., +6 → 13 values
# m/s to knots: 1 m/s = 1.94384 kt. SHOM stores values in 1/10 kt so the file
# integer 25 means 2.5 kt directly — no m/s round-trip needed.
DECIKT_TO_KN = 0.1


@dataclass(frozen=True, slots=True)
class C2dPoint:
    """A single SHOM C2D grid point with its 4 hourly time series.

    All speeds are in knots (converted from the raw 1/10 kt integer storage).
    Components ``u`` are positive toward east, ``v`` positive toward north.

    The reference convention (``ref_tide``) tells callers whether the 13
    samples are anchored to high tide (``"PM"``) or low tide (``"BM"``) at
    the zone's reference port. Coefficient 45 ≈ mortes-eaux, 95 ≈ vives-eaux.
    """

    lat: float
    lon: float
    u_ve_kn: tuple[float, ...]  # length 13, coef 95
    v_ve_kn: tuple[float, ...]
    u_me_kn: tuple[float, ...]  # length 13, coef 45
    v_me_kn: tuple[float, ...]

    def speed_kn_at(self, hour_offset: int, coef: float) -> float:
        """Speed (kt) at a given hour offset and tide coefficient.

        ``hour_offset`` must be one of ``HOUR_OFFSETS`` (no time interpolation
        here — keep this primitive small; callers do hour interpolation).
        ``coef`` is linearly interpolated between 45 and 95 (extrapolation
        allowed but flagged by the caller's domain knowledge).
        """
        idx = HOUR_OFFSETS.index(hour_offset)
        u = self.u_me_kn[idx] + (coef - 45.0) / 50.0 * (self.u_ve_kn[idx] - self.u_me_kn[idx])
        v = self.v_me_kn[idx] + (coef - 45.0) / 50.0 * (self.v_ve_kn[idx] - self.v_me_kn[idx])
        return float(np.hypot(u, v))


@dataclass(frozen=True, slots=True)
class C2dZone:
    """One SHOM C2D zone (one .UJA atlas planche).

    Attributes:
        atlas_id: SHOM atlas number (557..565).
        name: zone short name from the filename (e.g. ``"MORBIHAN"``).
        ref_port: reference port name as printed in the file header,
            stripped of any ``.BM`` suffix.
        ref_tide: ``"PM"`` (high tide) or ``"BM"`` (low tide); tells callers
            which tide event the hourly samples are anchored to.
        points: tuple of grid points. Order matches the file.
    """

    atlas_id: int
    name: str
    ref_port: str
    ref_tide: str  # "PM" or "BM"
    points: tuple[C2dPoint, ...]

    @property
    def bbox(self) -> tuple[float, float, float, float]:
        """``(lat_min, lon_min, lat_max, lon_max)`` over the zone's points."""
        lats = [p.lat for p in self.points]
        lons = [p.lon for p in self.points]
        return (min(lats), min(lons), max(lats), max(lons))


def _parse_lat_lon_token(s: str) -> float:
    """Parse a SHOM ``sDDMM.mmm`` token into signed decimal degrees.

    The text is a numeric string where the integer part is degrees * 100
    plus minutes and the fractional part is decimal minutes. So
    ``"4737.420"`` means 47°37.420'N (= 47 + 37.420/60 ≈ 47.62367°). A
    ``-`` sign on the whole token flips hemisphere.
    """
    val = float(s)
    sign = 1.0 if val >= 0 else -1.0
    val = abs(val)
    degrees = int(val // 100)
    minutes = val - degrees * 100
    return sign * (degrees + minutes / 60.0)


def _parse_hourly_line(line: str) -> tuple[tuple[float, ...], tuple[float, ...]]:
    """Parse one VE or ME line into ``(u[13], v[13])`` arrays in knots.

    The raw line is fixed-width and may have negative integers concatenated
    without whitespace (e.g. ``-22-10  0``). We split each side of ``*`` on
    a regex-equivalent walk: scan character-by-character, start a new field
    on a sign or digit boundary, terminate on whitespace or sign change.
    """
    if "*" not in line:
        raise ValueError(f"missing '*' separator in C2D line: {line!r}")
    u_part, v_part = line.split("*", 1)
    us = _split_packed_ints(u_part)
    vs = _split_packed_ints(v_part)
    if len(us) != 13 or len(vs) != 13:
        raise ValueError(f"expected 13 U + 13 V values, got {len(us)} + {len(vs)} in {line!r}")
    return (
        tuple(x * DECIKT_TO_KN for x in us),
        tuple(x * DECIKT_TO_KN for x in vs),
    )


def _split_packed_ints(s: str) -> list[int]:
    """Split a SHOM-style packed integer field like ``"-22-10  0  4"``.

    Whitespace separates fields; a ``-`` sign also starts a new field even
    without preceding whitespace. Empty whitespace-only segments are
    skipped.
    """
    out: list[int] = []
    buf = ""
    for ch in s:
        if ch == "-":
            if buf and buf != "-":
                out.append(int(buf))
            buf = "-"
        elif ch.isspace():
            if buf and buf != "-":
                out.append(int(buf))
            buf = ""
        else:
            buf += ch
    if buf and buf != "-":
        out.append(int(buf))
    return out


def parse_c2d_file(path: Path | str, atlas_id: int) -> C2dZone:
    """Load one SHOM C2D zone file (e.g. ``DONNEES/558/MORBIHAN_558``).

    The file is Latin-1 encoded (SHOM legacy). The ``atlas_id`` is the
    SHOM atlas number (557..565); callers usually derive it from the
    parent directory name.
    """
    p = Path(path)
    text = p.read_text(encoding="latin-1")
    # Some files use \r\n; splitlines handles both.
    raw_lines = text.splitlines()
    # Drop fully blank trailing lines but preserve interior structure.
    lines = [line for line in raw_lines if line.strip() != ""]
    if not lines:
        raise ValueError(f"empty C2D file: {p}")

    header = lines[0].strip()
    # ".BM", " BM" or "_BM" suffix → reference is low tide. SHOM mixes the
    # three across files (e.g. "Le Havre.BM" in atlas 561 vs
    # "La_Rochelle_BM" in atlas 559). Otherwise high tide.
    ref_tide = "PM"
    ref_port = header
    upper = header.upper()
    if upper.endswith(".BM") or upper.endswith(" BM") or upper.endswith("_BM"):
        ref_tide = "BM"
        ref_port = header[:-3].strip().rstrip("_").strip()

    # Each subsequent point is exactly 3 lines: position, VE, ME.
    body = lines[1:]
    if len(body) % 3 != 0:
        raise ValueError(f"C2D body line count not divisible by 3 in {p}: got {len(body)} lines")

    points: list[C2dPoint] = []
    for i in range(0, len(body), 3):
        pos_line = body[i]
        ve_line = body[i + 1]
        me_line = body[i + 2]
        # Position line: two whitespace-separated tokens, possibly with a
        # trailing tab/space artefact from the original CD-ROM export.
        tokens = pos_line.split()
        if len(tokens) < 2:
            raise ValueError(f"bad C2D position line in {p}: {pos_line!r}")
        lat = _parse_lat_lon_token(tokens[0])
        lon = _parse_lat_lon_token(tokens[1])
        u_ve, v_ve = _parse_hourly_line(ve_line)
        u_me, v_me = _parse_hourly_line(me_line)
        points.append(
            C2dPoint(
                lat=lat,
                lon=lon,
                u_ve_kn=u_ve,
                v_ve_kn=v_ve,
                u_me_kn=u_me,
                v_me_kn=v_me,
            )
        )

    return C2dZone(
        atlas_id=atlas_id,
        name=p.name.rsplit("_", 1)[0],
        ref_port=ref_port,
        ref_tide=ref_tide,
        points=tuple(points),
    )


def load_c2d_directory(donnees_dir: Path | str) -> tuple[C2dZone, ...]:
    """Load every zone file under a SHOM C2D ``DONNEES`` directory.

    Walks ``DONNEES/<atlas_id>/<ZONE_NAME>_<atlas_id>`` files and skips
    the ``_lisezmoi_*.txt`` documentation. Returns zones in deterministic
    order (sorted by atlas id then zone name) so downstream code can rely
    on a stable iteration.
    """
    root = Path(donnees_dir)
    zones: list[C2dZone] = []
    for atlas_dir in sorted(root.iterdir()):
        if not atlas_dir.is_dir():
            continue
        try:
            atlas_id = int(atlas_dir.name)
        except ValueError:
            continue
        for zone_file in sorted(atlas_dir.iterdir()):
            if zone_file.name.startswith("_") or not zone_file.is_file():
                continue
            zones.append(parse_c2d_file(zone_file, atlas_id))
    return tuple(zones)
