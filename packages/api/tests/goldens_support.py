# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Byte-for-byte comparison against recorded REST responses.

Why bytes and not parsed JSON: the web client, the MCP widget and every saved
plan read this payload by key, and two of the three read it in a fixed order
(the sweep table renders ``windows[]`` as it comes). Comparing parsed objects
would let a key reorder, a float widening, or a dropped ``null`` through, and
those are precisely the changes an extraction refactor makes by accident.

Regenerating is deliberate and visible::

    OPENWIND_REGENERATE_GOLDENS=1 uv run pytest tests/test_rest_goldens.py

which rewrites the files under ``tests/goldens/`` and leaves the diff in the
working tree. A PR that changes a golden without saying so in its description
is a contract change nobody agreed to.
"""

from __future__ import annotations

import os
import pathlib

GOLDEN_DIR = pathlib.Path(__file__).parent / "goldens"

REGENERATE = os.environ.get("OPENWIND_REGENERATE_GOLDENS") == "1"


def assert_golden(name: str, payload: bytes) -> None:
    """Compare ``payload`` to the recorded bytes of ``name``, or record them."""
    path = GOLDEN_DIR / name
    if REGENERATE:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)
    if not path.is_file():
        raise AssertionError(
            f"missing golden {name}; run OPENWIND_REGENERATE_GOLDENS=1 pytest to record it"
        )
    recorded = path.read_bytes()
    if recorded == payload:
        return
    raise AssertionError(
        f"{name} differs from the recorded response.\n"
        f"  recorded: {len(recorded)} bytes\n"
        f"  produced: {len(payload)} bytes\n"
        f"  first difference at byte {_first_difference(recorded, payload)}\n"
        f"  recorded around it: {_around(recorded, payload)!r}\n"
        f"  produced around it: {_around(payload, recorded)!r}\n"
        "If the change is intended, re-record with "
        "OPENWIND_REGENERATE_GOLDENS=1 and show the diff in the PR."
    )


def _first_difference(a: bytes, b: bytes) -> int:
    for i, (x, y) in enumerate(zip(a, b, strict=False)):
        if x != y:
            return i
    return min(len(a), len(b))


def _around(subject: bytes, other: bytes, span: int = 60) -> bytes:
    i = _first_difference(subject, other)
    return subject[max(0, i - span) : i + span]
