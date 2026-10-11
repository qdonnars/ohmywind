# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Which published atlases the cascade serves, and where it must not.

The dataset ``Qdonnars/openwind-tidal-atlas`` is shared by the dev and prod
Spaces, so what it holds is not a decision: this module is. An atlas can be
built, published and still withheld here, which keeps the decision in a
reviewed diff and makes it reversible without touching the dataset.

Decided at the 2026-10-11 review of the tidal work (``docs/tidal-world/
README.md``, "Périmètre servi"):

- **NorKyst (Norway) and Copernicus Arctic (Iceland) are withheld.** Out of
  the mission (the French coast and its neighbours), and NorKyst replaces
  the total current with the tide alone where the tide explains 7 to 44 % of
  the variance: the bench against the regional model put it level with the
  global model at best (0.30 kt against 0.29 along the route). The Iceland
  atlas was 0.02 kt better than the global model; out of scope all the same.
  Outside every atlas the cascade answers Open-Meteo SMOC, and the passes
  there (Saltstraumen, Moskstraumen) fall to the unknown-current rule.
- **An open-sea atlas does not answer where the tide is weak** (``WEAK_TIDE_KT``
  below): the general current, which only the global model holds, matters
  more there.
- **The Mediterranean atlas stays in the Mediterranean**: its model's
  domain reaches the Bay of Biscay, where the bench against observations
  measured it at 1.7 to 3.1 times the observed M2.
- **Gibraltar is cut out of the Copernicus IBI and MED atlases.** The atlas
  holds the tide alone and erases the Atlantic inflow: 1.1 to 1.9 kt of
  error in the strait against 0.5 to 0.75 for the global model, which keeps
  the circulation.
"""

from __future__ import annotations

Box = tuple[float, float, float, float]  # (lat_min, lon_min, lat_max, lon_max)

# Where the tide is too weak to matter, the general current matters more,
# and only the global model holds it. An open-sea atlas (rank 0 basin or 1
# shelf: ATLNE, MANGA, BSH 926 m, the Copernicus atlases) answers only where
# its spring tidal current reaches ``WEAK_TIDE_KT``; below, the global model
# answers with the general current (tide and circulation together). Same
# threshold the Copernicus builders already applied when they dropped their
# weak cells (``--min-speed-kt 0.2``): ATLNE and MANGA kept every cell, so a
# 0.06 to 0.1 kt tide replaced the general current all over the open
# Atlantic and the deep Bay of Biscay. Coastal and pass atlases (rank 2 and
# 3: MARC 250 m, BSH 90 m) keep every cell: there the 8 km global model does
# not see the geometry, and a weak tide in a sheltered bay is information.
WEAK_TIDE_KT = 0.2
OPEN_SEA_MAX_RANK = 1

# Dead water in a coastal atlas (rank 2 and up, MARC 250 m, BSH 90 m): an M2
# current under 1 cm/s (0.02 kt) or an M2 height under 5 cm, on a coast where
# the tide runs in metres. The lattice holds such cells on its land fringe
# and wherever the model cut the water off from the tide: the Rance above its
# barrage, the Seine above Tancarville (a zero at Rouen, served with a high
# confidence). The cascade first looks for a living cell within three cells,
# and withholds the value when there is none. Not applied to open-sea atlases:
# a near-zero tide in the Baltic is physics, and the weak-tide rule already
# hands those waters to the global model.
COASTAL_MIN_RANK = 2
DEAD_CURRENT_M2_MS = 0.01
DEAD_HEIGHT_M2_M = 0.05

WITHHELD_ATLASES: frozenset[str] = frozenset(
    {
        "NORKYST_SKAGERRAK",
        "NORKYST_ROGALAND",
        "NORKYST_VESTLAND",
        "NORKYST_TRONDELAG",
        "NORKYST_HELGELAND",
        "NORKYST_LOFOTEN",
        "NORKYST_TROMS",
        "NORKYST_FINNMARK",
        "CMEMS_ARC_ICELAND",
    }
)

# The strait from Cape Trafalgar and Cape Spartel to Gibraltar and Ceuta,
# where the inflow the tidal atlases cannot hold is strongest.
GIBRALTAR: Box = (35.70, -6.10, 36.25, -5.20)

# The Atlantic part of the Mediterranean model's domain (it reaches the Bay
# of Biscay and the Iberian and Moroccan coasts as a boundary buffer). The
# 2026-10-11 bench against observations caught the MED atlas answering in
# the Bay of Biscay (52 radar cells and the Cabo Peñas buoy) with 1.7 to 3.1
# times the measured M2 (docs/tidal-world/bench-observations.md). North of
# 42.5 N the Mediterranean starts east of 3 E, south of it east of the
# Gibraltar box: two boxes keep the atlas in its own sea.
ATLANTIC_NORTH: Box = (42.5, -20.0, 48.0, 0.5)
ATLANTIC_SOUTH: Box = (30.0, -20.0, 42.5, -5.95)

# Stable ids, translated by the clients.
BOX_NAMES: dict[Box, str] = {
    GIBRALTAR: "gibraltar",
    ATLANTIC_NORTH: "atlantic",
    ATLANTIC_SOUTH: "atlantic",
}

EXCLUDED_BOXES: dict[str, tuple[Box, ...]] = {
    "CMEMS_IBI": (GIBRALTAR,),
    "CMEMS_MED": (GIBRALTAR, ATLANTIC_NORTH, ATLANTIC_SOUTH),
}
