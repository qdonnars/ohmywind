# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The shoreline of the world as tiles of one Mercator lattice.

One lattice for the whole planet: ``WORLD_PX`` square pixels across, in the
spherical Mercator projection, column 0 at 180° W and row 0 at the south
edge (85.05° S). A pixel is 61 m at the equator, 45 m at 43° N, 42 m at
46° N, 31 m at 60° N: square on the ground everywhere, which is what the
search needs, and a straight line in the lattice is the straight line a web
map draws between two waypoints.

The lattice is cut into ``TILES`` x ``TILES`` tiles of ``TILE_PX`` pixels.
A tile is all sea, all land, or mixed; only the mixed ones carry a bitmap
(about a tile in fifteen: the coast is a line). The archive is one file:

    magic ``OWLT1\\n``, u32 length of the header, the header (JSON),
    the states (zlib, one byte per tile, row-major from the south-west:
    0 sea, 1 land, 2 mixed),
    the directory (u32 offsets, one per mixed tile plus one, row-major),
    the mixed tiles (zlib of the bitmap packed along rows, row 0 at the
    south, the most significant bit at the west).

Everything before the directory is the *index*: what a client that fetches
tiles one by one needs first. A browser reads the same bytes as this module,
through ``/api/v1/land-tiles`` (see ``openwind_api.routes.land_tiles``).

An archive may cover a rectangle of tiles only (``coverage`` in the header):
the one shipped in this package covers France and the coasts around it, the
world one is a download. Outside the coverage nothing is known, and no route
is repaired there.
"""

from __future__ import annotations

import hashlib
import json
import math
import struct
import zlib
from collections import OrderedDict
from pathlib import Path

import numpy as np

MAGIC = b"OWLT1\n"
ZOOM = 9
TILES = 1 << ZOOM  # tiles per side
TILE_PX = 1280
WORLD_PX = TILES * TILE_PX
SEA, LAND, MIXED = 0, 1, 2
# The lattice stops where the square Mercator world does.
MAX_LAT = math.degrees(math.atan(math.sinh(math.pi)))
# Metres per degree of latitude, as everywhere in the routing code.
M_PER_DEG = 111_195.0
# Decoded tiles kept in memory per archive (160 kB each).
TILE_CACHE = 96


def col_of(lon: float) -> float:
    """Fractional column of a longitude (the west edge of column 0 is 180° W)."""
    return (lon + 180.0) / 360.0 * WORLD_PX


def row_of(lat: float) -> float:
    """Fractional row of a latitude (the south edge of row 0 is 85.05° S)."""
    return (0.5 + math.asinh(math.tan(math.radians(lat))) / (2.0 * math.pi)) * WORLD_PX


def lon_of(col: float) -> float:
    return col / WORLD_PX * 360.0 - 180.0


def lat_of(row: float) -> float:
    return math.degrees(math.atan(math.sinh((row / WORLD_PX - 0.5) * 2.0 * math.pi)))


def rows_of(lats: np.ndarray) -> np.ndarray:
    return (
        0.5 + np.arcsinh(np.tan(np.radians(np.asarray(lats, dtype=np.float64)))) / (2.0 * math.pi)
    ) * WORLD_PX


def cols_of(lons: np.ndarray) -> np.ndarray:
    return (np.asarray(lons, dtype=np.float64) + 180.0) / 360.0 * WORLD_PX


def pixel_m(lat: float) -> float:
    """Side of a pixel on the ground at this latitude, in metres.

    To the micrometre: every cost of the search is a multiple of it, and a
    cosine is not the same to the last bit in every language.
    """
    return math.floor(360.0 / WORLD_PX * M_PER_DEG * math.cos(math.radians(lat)) * 1e6 + 0.5) / 1e6


def encode_tile(land: np.ndarray) -> bytes:
    """A mixed tile's payload from its ``(TILE_PX, TILE_PX)`` mask, row 0 at the south."""
    return zlib.compress(np.packbits(land, axis=1).tobytes(), 9)


def decode_tile(payload: bytes) -> np.ndarray:
    """The packed bitmap, ``(TILE_PX, TILE_PX // 8)`` uint8, from a tile's payload."""
    return np.frombuffer(zlib.decompress(payload), dtype=np.uint8).reshape(TILE_PX, TILE_PX // 8)


def write_archive(
    path: Path,
    states: np.ndarray,
    payloads: list[bytes],
    coverage: tuple[int, int, int, int],
    meta: dict,
) -> None:
    """Write an archive: ``states`` is ``(TILES, TILES)`` uint8, ``payloads`` the
    mixed tiles in row-major order, ``coverage`` the tile rectangle
    ``tx0, ty0, tx1, ty1`` (upper bounds excluded) the archive answers for."""
    if int((states == MIXED).sum()) != len(payloads):
        raise ValueError("one payload per mixed tile")
    # What a cache keys a tile on: two archives with the same id hold the
    # same tiles.
    digest = hashlib.sha256(states.astype(np.uint8).tobytes())
    for p in payloads:
        digest.update(p)
    header = json.dumps(
        {
            "id": digest.hexdigest()[:12],
            "zoom": ZOOM,
            "tile_px": TILE_PX,
            "coverage": list(coverage),
            **meta,
        },
        ensure_ascii=False,
        sort_keys=True,
    ).encode()
    packed_states = zlib.compress(states.astype(np.uint8).tobytes(), 9)
    offsets = np.zeros(len(payloads) + 1, dtype="<u4")
    offsets[1:] = np.cumsum([len(p) for p in payloads])
    with path.open("wb") as f:
        f.write(MAGIC)
        f.write(struct.pack("<I", len(header)))
        f.write(header)
        f.write(struct.pack("<I", len(packed_states)))
        f.write(packed_states)
        f.write(offsets.tobytes())
        for p in payloads:
            f.write(p)


class LandTiles:
    """An archive of land tiles, read where it lies; tiles are decoded on demand."""

    def __init__(self, path: Path | str) -> None:
        self.path = Path(path)
        with self.path.open("rb") as f:
            if f.read(len(MAGIC)) != MAGIC:
                raise ValueError(f"{self.path} is not a land tile archive")
            (n,) = struct.unpack("<I", f.read(4))
            self.meta: dict = json.loads(f.read(n))
            if self.meta.get("zoom") != ZOOM or self.meta.get("tile_px") != TILE_PX:
                raise ValueError(f"{self.path} is cut on another lattice than this code reads")
            (n,) = struct.unpack("<I", f.read(4))
            self.states = np.frombuffer(zlib.decompress(f.read(n)), dtype=np.uint8).reshape(
                TILES, TILES
            )
            self.index_bytes = f.tell()  # what a tile-by-tile client reads first
            count = int((self.states == MIXED).sum())
            self._offsets = np.frombuffer(f.read(4 * (count + 1)), dtype="<u4").astype(np.int64)
            self._data_start = f.tell()
        # Rank of each mixed tile in the directory.
        self._rank = np.cumsum(self.states.ravel() == MIXED).reshape(TILES, TILES) - 1
        self.coverage: tuple[int, int, int, int] = tuple(self.meta["coverage"])  # type: ignore[assignment]
        self.id: str = self.meta["id"]
        self._cache: OrderedDict[tuple[int, int], np.ndarray] = OrderedDict()

    def covers(self, row: float, col: float) -> bool:
        tx0, ty0, tx1, ty1 = self.coverage
        return tx0 * TILE_PX <= col < tx1 * TILE_PX and ty0 * TILE_PX <= row < ty1 * TILE_PX

    def index(self) -> bytes:
        """The bytes before the directory: magic, header and states."""
        with self.path.open("rb") as f:
            return f.read(self.index_bytes)

    def payload(self, tx: int, ty: int) -> bytes | None:
        """A mixed tile's bytes as stored, None for a tile that is all sea or all land."""
        if not (0 <= tx < TILES and 0 <= ty < TILES) or self.states[ty, tx] != MIXED:
            return None
        k = int(self._rank[ty, tx])
        with self.path.open("rb") as f:
            f.seek(self._data_start + int(self._offsets[k]))
            return f.read(int(self._offsets[k + 1] - self._offsets[k]))

    def _packed(self, tx: int, ty: int) -> np.ndarray:
        key = (tx, ty)
        hit = self._cache.get(key)
        if hit is not None:
            self._cache.move_to_end(key)
            return hit
        payload = self.payload(tx, ty)
        assert payload is not None
        packed = decode_tile(payload)
        self._cache[key] = packed
        if len(self._cache) > TILE_CACHE:
            self._cache.popitem(last=False)
        return packed

    def land_at(self, rows: np.ndarray, cols: np.ndarray) -> np.ndarray:
        """Whether each lattice pixel ``(row, col)`` (integers) is land.

        A pixel outside the lattice, north or south of it, is land; the
        columns wrap around the antimeridian.
        """
        rows = np.asarray(rows, dtype=np.int64)
        cols = np.asarray(cols, dtype=np.int64) % WORLD_PX
        out = np.ones(rows.shape, dtype=bool)
        inside = (rows >= 0) & (rows < WORLD_PX)
        ty, tx = rows // TILE_PX, cols // TILE_PX
        key = np.where(inside, ty * TILES + tx, -1)
        for k in np.unique(key):
            if k < 0:
                continue
            sel = key == k
            y, x = divmod(int(k), TILES)
            state = self.states[y, x]
            if state != MIXED:
                out[sel] = state == LAND
                continue
            packed = self._packed(x, y)
            r, c = rows[sel] - y * TILE_PX, cols[sel] - x * TILE_PX
            out[sel] = ((packed[r, c >> 3] >> (7 - (c & 7))) & 1).astype(bool)
        return out

    def window(self, r0: int, r1: int, c0: int, c1: int) -> np.ndarray:
        """The land mask of rows ``r0..r1`` and columns ``c0..c1`` (upper bounds excluded)."""
        out = np.ones((r1 - r0, c1 - c0), dtype=bool)
        for ty in range(max(0, r0) // TILE_PX, (min(WORLD_PX, r1) - 1) // TILE_PX + 1):
            ra, rb = max(r0, ty * TILE_PX), min(r1, (ty + 1) * TILE_PX)
            for txu in range(c0 // TILE_PX, (c1 - 1) // TILE_PX + 1):
                ca, cb = max(c0, txu * TILE_PX), min(c1, (txu + 1) * TILE_PX)
                tx = txu % TILES
                state = self.states[ty, tx]
                dst = out[ra - r0 : rb - r0, ca - c0 : cb - c0]
                if state != MIXED:
                    dst[:] = state == LAND
                    continue
                la, lb = ca - txu * TILE_PX, cb - txu * TILE_PX
                bits = np.unpackbits(
                    self._packed(tx, ty)[
                        ra - ty * TILE_PX : rb - ty * TILE_PX, la >> 3 : (lb + 7) >> 3
                    ],
                    axis=1,
                )
                dst[:] = bits[:, la & 7 : (la & 7) + (lb - la)]
        return out


def largest_archive(directory: Path | str | None) -> LandTiles | None:
    """Of the archives (``*.owlt``) of a directory, the one that covers the most.

    None without a directory or without an archive in it. A deployment that
    puts the world next to the archive shipped in this package gets the
    world, for the route repair and for the tiles it hands to a client alike.
    """
    if not directory or not Path(directory).is_dir():
        return None
    archives = [LandTiles(f) for f in sorted(Path(directory).glob("*.owlt"))]

    def tiles_covered(t: LandTiles) -> int:
        tx0, ty0, tx1, ty1 = t.coverage
        return (tx1 - tx0) * (ty1 - ty0)

    return max(archives, key=tiles_covered) if archives else None
