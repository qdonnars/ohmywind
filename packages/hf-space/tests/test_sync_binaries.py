# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Every binary the Space sync ships is declared to the Hub's large-file storage.

The Hub refuses a push that holds a binary file outside Xet/LFS storage,
whatever its size, and the sync workflow declares the tracked extensions by
hand. A binary whose extension is missing passes every test and the CI, then
fails the push after the merge, and the Space silently stays on its old code:
a poster image on 2026-10-21 (#488), the land tiles on 2026-11-24 (#586).
This test reads the workflow's list and the files it vendors, so the miss
shows on the pull request instead.
"""

from __future__ import annotations

import fnmatch
import re
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
WORKFLOW = REPO / ".github/workflows/sync-hf-space.yml"
# What "Assemble Space build context" copies into the Space.
VENDORED = (
    "packages/hf-space",
    "packages/data-adapters",
    "packages/api",
    "packages/mcp-core",
)


def tracked_patterns() -> list[str]:
    """The extensions the workflow writes to the Space's ``.gitattributes``."""
    text = WORKFLOW.read_text(encoding="utf-8")
    match = re.search(
        r"filter=lfs diff=lfs merge=lfs -text\\n' \\\n(.*?)> \.gitattributes", text, re.S
    )
    assert match, "the workflow no longer writes .gitattributes the way this test reads it"
    return re.findall(r"'([^']+)'", match.group(1))


def shipped_files() -> list[Path]:
    """The files of the vendored packages as a checkout holds them, tests left out
    (the workflow prunes every ``tests`` directory before it pushes)."""
    out = subprocess.run(
        ["git", "ls-files", "-z", "--", *VENDORED],
        cwd=REPO,
        check=True,
        capture_output=True,
    ).stdout
    files = [REPO / name for name in out.decode().split("\0") if name]
    return [f for f in files if "tests" not in f.relative_to(REPO).parts and f.is_file()]


def is_binary(path: Path) -> bool:
    """A NUL byte in the first 8 kB, which is how git itself decides."""
    with path.open("rb") as f:
        return b"\0" in f.read(8000)


def test_the_workflow_declares_patterns() -> None:
    patterns = tracked_patterns()
    assert "*.owlt" in patterns
    assert all(p.startswith("*.") for p in patterns)


def test_every_shipped_binary_is_declared_to_large_file_storage() -> None:
    patterns = tracked_patterns()
    files = shipped_files()
    assert files, "git listed nothing: the test would pass on an empty set"
    missing = sorted(
        str(f.relative_to(REPO))
        for f in files
        if is_binary(f) and not any(fnmatch.fnmatch(f.name, p) for p in patterns)
    )
    assert not missing, (
        "binary files the Space sync would be refused for; add their extension to the "
        f"printf list in {WORKFLOW.relative_to(REPO)}: {missing}"
    )
