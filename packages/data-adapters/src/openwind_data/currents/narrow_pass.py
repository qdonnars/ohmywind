# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Per-point confidence labelling for current values.

The qualitative tag (``"high"`` / ``"medium"`` / ``"low"`` / ``None``) sits
beside ``current_source`` on each ``SegmentReport`` so the LLM and UI can
qualify a current value without re-deriving the rules.

The labelling is **source-based for now**. We previously shipped a
hand-drawn list of named narrow-pass bboxes (Goulet de Brest, Raz de Sein,
Goulet du Morbihan, etc.) to downgrade confidence inside known choke
points. That approach was unprincipled — bboxes drawn by intuition rather
than by physics — and has been removed. The data-driven replacement will
land with the SHOM Atlas C2D ingestion: zones where C2D peak speeds
exceed a threshold (e.g. ≥ 3 kt at vives-eaux) are exactly the zones
where every freely-available product under-resolves the choke, so the
confidence downgrade can be derived from the data instead of hand-drawn.

Until that adapter is wired, ``confidence_for_point`` reflects only the
source product's intrinsic resolution.
"""

from __future__ import annotations

from typing import Literal

ConfidenceLevel = Literal["high", "medium", "low"]


def confidence_for_point(lat: float, lon: float, source: str | None) -> ConfidenceLevel | None:
    """Confidence tag for the current value at (lat, lon) with given source.

    - ``None`` source → ``None`` (no current data, nothing to qualify).
    - SHOM Atlas C2D (``"shom_c2d_*"``) → ``"high"``: French navigation
      reference, hand-placed points on flow features, validated against
      in-situ measurements.
    - MARC PREVIMER (``"marc_*"``) → ``"high"``: Ifremer harmonic atlas,
      regular 250 m to 2 km grid depending on zone.
    - Open-Meteo SMOC (``"openmeteo_smoc"``) → ``"medium"``: 8 km global
      Mercator product, fine for open water but blunt near the coast.
    - Anything else → ``"medium"`` (unknown source, stay conservative).

    The ``lat`` and ``lon`` arguments are reserved for the data-driven
    successor (SHOM-peak-based downgrade in choke points) and are
    currently unused.
    """
    del lat, lon  # reserved for the data-driven successor
    if source is None:
        return None
    if source.startswith("shom_c2d_") or source.startswith("marc_"):
        return "high"
    if source == "openmeteo_smoc":
        return "medium"
    return "medium"
