# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Validation cases of the auto-route spike (issue #540), with their extents.

Each case: a departure, an arrival, optional intent points, the extent the
rasters are built on (lat_min, lon_min, lat_max, lon_max) and a short label.
Coordinates are in the harbour or anchorage itself; the engine snaps a point
that its land raster puts ashore and reports how far it moved it.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Case:
    key: str
    label: str
    start: tuple[float, float]
    end: tuple[float, float]
    bbox: tuple[float, float, float, float]
    via: list[tuple[float, float]] = field(default_factory=list)
    note: str = ""
    # Close-ups drawn as extra images: name -> (lat_min, lon_min, lat_max, lon_max).
    zooms: dict[str, tuple[float, float, float, float]] = field(default_factory=dict)
    # Shoreline the main route uses: "osmplus" = OSM land polygons, minus OSM
    # river polygons where fetched, plus OSM breakwaters and piers.
    coast: str = "osmplus"
    # Height of water above chart datum the route is drawn for (0 = LAT).
    water_level: float = 0.0


CASES: list[Case] = [
    Case(
        "calanques",
        "Calanque de Sormiou -> Pointe-Rouge (cap Croisette)",
        (43.2080, 5.4185),
        (43.2442, 5.3655),
        (43.17, 5.30, 43.27, 5.47),
        zooms={
            "croisette": (43.198, 5.305, 43.226, 5.36),
            "arrivee": (43.232, 5.352, 43.256, 5.382),
        },
    ),
    Case(
        "batz",
        "Trebeurden -> port de l'ile de Batz",
        (48.7700, -3.5855),
        (48.7425, -4.0065),
        (48.68, -4.10, 48.88, -3.50),
        zooms={
            "batz": (48.715, -4.075, 48.785, -3.94),
            "depart": (48.74, -3.64, 48.80, -3.56),
            "meloine": (48.74, -3.92, 48.80, -3.76),
        },
    ),
    Case(
        "batz_chenal",
        "Trebeurden -> port de l'ile de Batz, point d'intention dans le chenal de Batz",
        (48.7700, -3.5855),
        (48.7425, -4.0065),
        (48.68, -4.10, 48.88, -3.50),
        via=[(48.7385, -3.9790)],
        zooms={"batz": (48.715, -4.075, 48.785, -3.94)},
    ),
    Case(
        "batz_mimaree",
        "Trebeurden -> port de l'ile de Batz, sans point d'intention, 3 m d'eau au-dessus du zero",
        (48.7700, -3.5855),
        (48.7425, -4.0065),
        (48.68, -4.10, 48.88, -3.50),
        water_level=3.0,
        zooms={"batz": (48.715, -4.075, 48.785, -3.94), "depart": (48.74, -3.64, 48.80, -3.56)},
    ),
    Case(
        "brest",
        "Brest (Chateau) -> Douarnenez (Treboul)",
        (48.3800, -4.4935),
        (48.0985, -4.3345),
        (48.02, -4.68, 48.42, -4.20),
        zooms={
            "goulet": (48.325, -4.64, 48.385, -4.48),
            "penhir": (48.22, -4.69, 48.30, -4.59),
            "chevre": (48.14, -4.59, 48.19, -4.52),
            "arrivee": (48.085, -4.37, 48.12, -4.31),
        },
    ),
    Case(
        "lorient",
        "Lorient (Kernevel) -> Groix (Port-Tudy)",
        (47.7180, -3.3690),
        (47.6445, -3.4465),
        (47.60, -3.52, 47.76, -3.30),
        zooms={
            "depart": (47.685, -3.40, 47.725, -3.345),
            "port_tudy": (47.635, -3.465, 47.66, -3.425),
        },
    ),
    Case(
        "glenan",
        "Concarneau -> les Glenan (la Chambre)",
        (47.8705, -3.9135),
        (47.7215, -3.9980),
        (47.68, -4.10, 47.90, -3.85),
        zooms={
            "depart": (47.845, -3.945, 47.878, -3.895),
            "arrivee": (47.705, -4.03, 47.745, -3.97),
        },
    ),
    Case(
        "toulon",
        "Toulon (darse) -> Saint-Tropez",
        (43.1185, 5.9330),
        (43.2725, 6.6365),
        (42.95, 5.85, 43.32, 6.75),
        zooms={
            "depart": (43.07, 5.88, 43.13, 5.98),
            "porquerolles": (42.98, 6.06, 43.06, 6.24),
            "camarat": (43.17, 6.58, 43.30, 6.74),
        },
    ),
    Case(
        "toulon_sud",
        "Toulon -> Saint-Tropez, point d'intention au sud de Porquerolles",
        (43.1185, 5.9330),
        (43.2725, 6.6365),
        (42.95, 5.85, 43.32, 6.75),
        via=[(42.9700, 6.2000)],
    ),
    Case(
        "loire",
        "Saint-Nazaire -> Nantes (estuaire de la Loire)",
        (47.2675, -2.1950),
        (47.1980, -1.5770),
        (47.15, -2.32, 47.32, -1.50),
        zooms={"nantes": (47.17, -1.70, 47.23, -1.55), "pont": (47.25, -2.24, 47.30, -2.12)},
    ),
]

BY_KEY = {c.key: c for c in CASES}
