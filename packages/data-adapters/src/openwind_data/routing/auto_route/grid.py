# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The raster the auto-route engine searches: land, depth and distance to land.

A :class:`NavGrid` is a regular lat/lon grid of nearly square pixels (the
longitude pitch is the latitude pitch over ``cos(lat)``), row 0 at the south
edge. ``land`` comes from a shoreline (OSM land polygons, GSHHG, Natural
Earth), ``depth`` from a bathymetry in metres below chart datum (positive is
water depth, zero or negative is drying or land, NaN unknown). Building the
grid from polygons happens offline; the engine only reads arrays.

:class:`MercatorGrid` is the same raster cut from the world lattice of
``land_tiles``, which is what the route repair searches.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from openwind_data.routing.auto_route import land_tiles

M_PER_DEG_LAT = 111_195.0


@dataclass
class NavGrid:
    lat0: float  # south edge of row 0
    lon0: float  # west edge of column 0
    dlat: float
    dlon: float
    land: np.ndarray  # bool (n_lat, n_lon)
    depth: np.ndarray | None = None  # float32 metres below chart datum, NaN unknown
    coast_source: str = ""
    depth_source: str = ""
    depth_pitch_m: float | None = None  # native resolution of the bathymetry
    _dist: np.ndarray | None = field(default=None, repr=False)

    @property
    def shape(self) -> tuple[int, int]:
        return self.land.shape  # type: ignore[return-value]

    @property
    def pitch_m(self) -> float:
        return self.dlat * M_PER_DEG_LAT

    def rc(self, lat: float, lon: float) -> tuple[int, int]:
        return math.floor((lat - self.lat0) / self.dlat), math.floor((lon - self.lon0) / self.dlon)

    def rc_float(self, lats: np.ndarray, lons: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        return (np.asarray(lats) - self.lat0) / self.dlat, (
            np.asarray(lons) - self.lon0
        ) / self.dlon

    def latlon(self, r: float, c: float) -> tuple[float, float]:
        """Centre of pixel (r, c), or any fractional position."""
        return self.lat0 + (r + 0.5) * self.dlat, self.lon0 + (c + 0.5) * self.dlon

    def inside(self, r: int, c: int) -> bool:
        return 0 <= r < self.shape[0] and 0 <= c < self.shape[1]

    def distance_to_land(self) -> np.ndarray:
        """Metres from each pixel centre to the nearest land pixel (0 on land).

        Two-pass chamfer (1, sqrt 2), each pass a loop over rows vectorised
        along them; within a row the horizontal propagation is a cumulative
        minimum. Overestimates the Euclidean distance by 8 % at most, which is
        plenty for a cost and a clearance. Pixels with no land in the grid get
        a large finite value.
        """
        if self._dist is not None:
            return self._dist
        self._dist = chamfer_distance(self.land, self.pitch_m)
        return self._dist


@dataclass
class MercatorGrid(NavGrid):
    """A window of the world lattice (``land_tiles``), each cell ``factor`` pixels a side.

    Cell ``(r, c)`` covers lattice rows ``row0 + r * factor`` to
    ``row0 + (r + 1) * factor`` and the same along the columns. The cells are
    square on the ground; ``pitch`` is their side at the middle latitude of
    the window, which the engine takes for the whole of it (over a window of
    one degree of latitude at 47° N it is off by 1 % at the edges).
    ``lat0``, ``lon0``, ``dlat`` and ``dlon`` describe the south-west corner
    and the mean pitch, for a reader; nothing here computes with them.
    """

    row0: int = 0
    col0: int = 0
    factor: int = 1
    pitch: float = 0.0

    @property
    def pitch_m(self) -> float:
        return self.pitch

    def rc(self, lat: float, lon: float) -> tuple[int, int]:
        return (
            math.floor((land_tiles.row_of(lat) - self.row0) / self.factor),
            math.floor((land_tiles.col_of(lon) - self.col0) / self.factor),
        )

    def rc_float(self, lats: np.ndarray, lons: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        return (
            (land_tiles.rows_of(lats) - self.row0) / self.factor,
            (land_tiles.cols_of(lons) - self.col0) / self.factor,
        )

    def latlon(self, r: float, c: float) -> tuple[float, float]:
        return (
            land_tiles.lat_of(self.row0 + (r + 0.5) * self.factor),
            land_tiles.lon_of(self.col0 + (c + 0.5) * self.factor),
        )


def chamfer_distance(mask: np.ndarray, pitch_m: float) -> np.ndarray:
    """Metres from each pixel to the nearest ``True`` pixel of ``mask`` (see above)."""
    n_lat, n_lon = mask.shape
    big = 1e9
    d = np.where(mask, 0.0, big)
    idx = np.arange(n_lon, dtype=np.float64)
    s2 = math.sqrt(2.0)

    def horizontal(row: np.ndarray) -> np.ndarray:
        fwd = np.minimum.accumulate(row - idx) + idx
        bwd = (np.minimum.accumulate((row + idx)[::-1]))[::-1] - idx
        return np.minimum(fwd, bwd)

    for rows in (range(n_lat), range(n_lat - 1, -1, -1)):
        prev = None
        for i in rows:
            row = d[i]
            if prev is not None:
                row = np.minimum(row, prev + 1.0)
                row[1:] = np.minimum(row[1:], prev[:-1] + s2)
                row[:-1] = np.minimum(row[:-1], prev[1:] + s2)
            row = horizontal(row)
            d[i] = row
            prev = row
    return (d * pitch_m).astype(np.float32)
