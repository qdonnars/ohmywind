# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""A coarse land mask, so the tidal overlay answers nothing on land.

The regular lattices of the regridded MARC atlases carry extrapolated
values a few kilometres inland, and the registry accepts a cell within
5 km of the query: a click on Guipavas, 5 km from the Elorn, was answered
with a 700 m atlas and 0.3 kt. The mask is a packed bitmap on a regular
lat/lon grid, built offline from a public shoreline
(``scripts/build_land_mask.py``, Natural Earth 10 m, one pixel of about
1 km; the shipped file has the sea dilated by two pixels, so a harbour or
a river mouth stays at sea) and shipped next to the atlases. Outside the
bitmap, or without the file, nothing is land: the mask only ever removes
answers it is sure about.

Water wins over the shoreline. The 1:10M line stops short of the rivers a
fine atlas resolves: it ends at Övelgönne on the Elbe, so the port of
Hamburg was land while the BSH model has water there. :func:`load_land_mask`
therefore clears every pixel that holds a cell of a fine atlas on its native
grid, or a SHOM C2D point (:func:`water_evidence`): a hydrodynamic model's
wet cell is the best proof of water we have, and calling water land hides a
current from a sailor, which a current shown on a field never does. The
regridded MARC lattices do not count, their extrapolated cells are the very
reason the mask exists.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    from openwind_data.currents.marc_atlas import MarcAtlasRegistry
    from openwind_data.currents.shom_c2d_registry import ShomC2dRegistry

FILE_NAME = "land_mask.npz"
META_NAME = "land_mask.json"


@dataclass(frozen=True, slots=True)
class LandMask:
    """``is_land(lat, lon)`` from a packed bitmap; empty when no file was found."""

    bits: np.ndarray | None  # packed rows, shape (n_lat, ceil(n_lon / 8))
    n_lat: int = 0
    n_lon: int = 0
    lat0: float = 0.0  # south edge of the first row
    lon0: float = 0.0  # west edge of the first column
    pitch_deg: float = 0.01
    source: str = ""

    @classmethod
    def empty(cls) -> LandMask:
        return cls(bits=None)

    @classmethod
    def from_directory(cls, root: Path | str | None) -> LandMask:
        """Load ``land_mask.npz`` from ``root``; an absent file is an empty mask."""
        if not root:
            return cls.empty()
        path = Path(root) / FILE_NAME
        if not path.is_file():
            return cls.empty()
        with np.load(path) as data:
            bits = np.ascontiguousarray(data["bits"], dtype=np.uint8)
            meta = json.loads(str(data["meta"]))
        return cls(
            bits=bits,
            n_lat=int(meta["n_lat"]),
            n_lon=int(meta["n_lon"]),
            lat0=float(meta["lat0"]),
            lon0=float(meta["lon0"]),
            pitch_deg=float(meta["pitch_deg"]),
            source=str(meta.get("source", "")),
        )

    @property
    def loaded(self) -> bool:
        return self.bits is not None

    def with_water(self, lats: np.ndarray, lons: np.ndarray) -> LandMask:
        """A copy where every pixel holding one of the points is sea.

        Points outside the bitmap are ignored; an empty mask stays empty.
        """
        if self.bits is None or len(lats) == 0:
            return self
        lats = np.asarray(lats, dtype=np.float64)
        lons = np.asarray(lons, dtype=np.float64)
        rows = np.floor((lats - self.lat0) / self.pitch_deg).astype(np.int64)
        cols = np.floor((lons - self.lon0) / self.pitch_deg).astype(np.int64)
        inside = (rows >= 0) & (rows < self.n_lat) & (cols >= 0) & (cols < self.n_lon)
        rows, cols = rows[inside], cols[inside]
        bits = self.bits.copy()
        clear = ~(np.uint8(0x80) >> (cols & 7).astype(np.uint8))
        np.bitwise_and.at(bits, (rows, cols >> 3), clear)
        return LandMask(
            bits=bits,
            n_lat=self.n_lat,
            n_lon=self.n_lon,
            lat0=self.lat0,
            lon0=self.lon0,
            pitch_deg=self.pitch_deg,
            source=self.source,
        )

    def is_land(self, lat: float, lon: float) -> bool:
        """True only where the bitmap says land; False outside it or when empty."""
        if self.bits is None:
            return False
        row = int(np.floor((lat - self.lat0) / self.pitch_deg))
        col = int(np.floor((lon - self.lon0) / self.pitch_deg))
        if row < 0 or row >= self.n_lat or col < 0 or col >= self.n_lon:
            return False
        byte = self.bits[row, col >> 3]
        return bool((byte >> (7 - (col & 7))) & 1)


def pack(land: np.ndarray, lat0: float, lon0: float, pitch_deg: float, source: str) -> dict:
    """The arrays ``np.savez_compressed`` writes for a boolean ``land[n_lat, n_lon]``
    (row 0 at the south edge). The builder's side of the format."""
    n_lat, n_lon = land.shape
    meta = {
        "n_lat": int(n_lat),
        "n_lon": int(n_lon),
        "lat0": float(lat0),
        "lon0": float(lon0),
        "pitch_deg": float(pitch_deg),
        "source": source,
    }
    return {"bits": np.packbits(land.astype(bool), axis=1), "meta": np.array(json.dumps(meta))}


def water_evidence(
    marc: MarcAtlasRegistry | None, shom: ShomC2dRegistry | None
) -> tuple[np.ndarray, np.ndarray]:
    """Latitudes and longitudes the served atlases hold water at.

    The cells of the fine atlases on their native grid
    (:meth:`MarcAtlasRegistry.water_cells`) and every SHOM C2D point.
    """
    lats: list[np.ndarray] = []
    lons: list[np.ndarray] = []
    if marc is not None:
        a, o = marc.water_cells()
        lats.append(a)
        lons.append(o)
    if shom is not None and len(shom.lats):
        lats.append(np.asarray(shom.lats, dtype=np.float64))
        lons.append(np.asarray(shom.lons, dtype=np.float64))
    if not lats:
        return np.empty(0), np.empty(0)
    return np.concatenate(lats), np.concatenate(lons)


def load_land_mask(
    root: Path | str | None,
    *,
    marc: MarcAtlasRegistry | None = None,
    shom: ShomC2dRegistry | None = None,
) -> LandMask:
    """The mask under ``root`` with the served atlases' water cleared from it.

    The one way the REST API and the MCP server build the mask, so a point
    is land or sea for both alike.
    """
    return LandMask.from_directory(root).with_water(*water_evidence(marc, shom))
