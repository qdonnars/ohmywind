# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Put the hf-space package dir on sys.path for the whole test session.

``app.py`` imports its sibling ``security`` module by bare name, which is how
it resolves on the Space (the Dockerfile copies both into ``/app`` and runs
``python /app/app.py``, so the script's own directory is sys.path[0]). Tests
load ``app.py`` by path instead, so they have to reproduce that layout.
"""

from __future__ import annotations

import pathlib
import sys

_HF_DIR = str(pathlib.Path(__file__).parents[1].resolve())
if _HF_DIR not in sys.path:
    sys.path.insert(0, _HF_DIR)
