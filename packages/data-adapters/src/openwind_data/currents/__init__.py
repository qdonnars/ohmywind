# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Tidal currents and heights subpackage.

Provides:
- ``harmonic``: Schureman/Cartwright-1985 predictor for tidal heights and
  currents from harmonic constants. Standard Greenwich-phase convention,
  validated against PREVIMER MARC + REFMAR Brest.
- ``marc_atlas`` (Phase 2): Parquet-backed loader for the MARC atlases.
- ``router`` (Phase 2): cascade MARC → Open-Meteo SMOC.
"""
