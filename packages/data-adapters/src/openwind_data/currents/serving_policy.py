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
- **Gibraltar is cut out of the Copernicus IBI and MED atlases.** The atlas
  holds the tide alone and erases the Atlantic inflow: 1.1 to 1.9 kt of
  error in the strait against 0.5 to 0.75 for the global model, which keeps
  the circulation.
"""

from __future__ import annotations

Box = tuple[float, float, float, float]  # (lat_min, lon_min, lat_max, lon_max)

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

EXCLUDED_BOXES: dict[str, tuple[Box, ...]] = {
    "CMEMS_IBI": (GIBRALTAR,),
    "CMEMS_MED": (GIBRALTAR,),
}
