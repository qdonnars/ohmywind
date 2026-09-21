# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Per-point confidence labelling for current values.

The qualitative tag (``"high"`` / ``"medium"`` / ``"low"`` / ``None``) sits
beside ``current_source`` on each ``SegmentReport`` so the LLM and UI can
qualify a current value without re-deriving the rules.

The labelling is source-based, with one data-driven exception. We
previously shipped a hand-drawn list of named narrow-pass bboxes (Goulet de
Brest, Raz de Sein, Goulet du Morbihan, etc.) to downgrade confidence inside
known choke points. That approach was unprincipled (bboxes drawn by
intuition rather than by physics) and has been removed. What replaces it is
measured by the map builder against the atlases themselves: a known pass
whose published spring current an atlas misses by half or more within
3 km is listed as unresolved by that atlas in ``tidal_gaps.geojson``, and
``confidence_for_point`` drops a fine source to ``"medium"`` within
:data:`~openwind_data.currents.tidal_gaps.DEFAULT_UNRESOLVED_RADIUS_KM` of
such a pass. An 800 m grid has no cell in a 150 m channel: NorKyst reads
0.3 kt a kilometre from Saltstraumen, and the ``currents.tidal_gap`` notice
must survive that answer.
"""

from __future__ import annotations

import re
from typing import Literal

from openwind_data.currents.tidal_gaps import unresolved_pass_at

ConfidenceLevel = Literal["high", "medium", "low"]

# Labels of atlases in the standard format end with their resolution:
# ``marc_finis_250m``, ``bsh_cuxbru_90m``, ``marc_atlne_2000m``.
_RESOLUTION_SUFFIX = re.compile(r"_(\d+)m$")
# At or below this pitch an atlas resolves a race or an estuary mouth; above
# it, it only says "there is tide here" and earns the same tag as a global
# model. ATLNE (2 km) sits above it: the Elbe report showed why a 2 km cell
# in an estuary must not read as a high-confidence value.
_HIGH_CONFIDENCE_MAX_RESOLUTION_M = 1000


def confidence_for_point(lat: float, lon: float, source: str | None) -> ConfidenceLevel | None:
    """Confidence tag for the current value at (lat, lon) with given source.

    - ``None`` source → ``None`` (no current data, nothing to qualify).
    - SHOM Atlas C2D (``"shom_c2d_*"``) → ``"high"``: French navigation
      reference, hand-placed points on flow features, validated against
      in-situ measurements.
    - An atlas label ending in its resolution (``"marc_finis_250m"``,
      ``"bsh_cuxbru_90m"``) → ``"high"`` at 1 km or finer, ``"medium"``
      above (``"marc_atlne_2000m"``): a 2 km cell resolves neither a pass
      nor an estuary, and reads like a global model does.
    - Open-Meteo SMOC (``"openmeteo_smoc"``) → ``"medium"``: 8 km global
      Mercator product, fine for open water but blunt near the coast.
    - Anything else → ``"medium"`` (unknown source, stay conservative).
    - A fine atlas within 3 km of a known pass it does not resolve (its
      reconstructed maximum there is under half the published spring
      current, per ``tidal_gaps.geojson``) → ``"medium"``: the grid is
      blind to the channel, whatever its pitch says.
    """
    if source is None:
        return None
    if source.startswith("shom_c2d_"):
        return "high"
    match = _RESOLUTION_SUFFIX.search(source)
    if match is None or int(match.group(1)) > _HIGH_CONFIDENCE_MAX_RESOLUTION_M:
        return "medium"
    if unresolved_pass_at(lat, lon, source) is not None:
        return "medium"
    return "high"
