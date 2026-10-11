#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Archive the BSH surface-current forecasts before the FTP forgets them.

BSH publishes surface-current predictions for the North Sea, the Baltic and
the Elbe twice a day on ``ftp://ftp.bsh.de/Stroemungsvorhersagen/`` (GRIB2,
15-minute step, uppermost 0 to 5 m layer, CC BY 4.0 per the ``LICENSE.txt``
next to the data, read 2026-09-19). The FTP keeps roughly three days. A
harmonic atlas needs months, so this script is the thing that has to run
every day: it lists the directories, downloads every ``.grb2.bz2`` not yet in
the archive, and appends a line per file to ``manifest.jsonl`` (name, size,
sha256, fetch time). It never deletes and never overwrites a complete file,
so it is safe to run as often as you like, from a laptop or from CI.

Usage::

    uv run scripts/archive_bsh_currents.py --archive-dir build/bsh/archive
    uv run scripts/archive_bsh_currents.py --areas CuxBru,AusAlt,idb,db --dry-run

Areas are the ``XX`` in ``Current_XX_YYYYMMDDHH_VV.grb2`` (see the FTP
README): ``no``, ``db``, ``idb``, ``nfi``, ``ofi`` (Nordsee), ``ba``, ``wb``,
``kbu``, ``mbu``, ``rgn``, ``snd``, ``blt`` (Ostsee), ``AusAlt``, ``CuxBru``,
``BruPag``, ``PagHam`` (Elbe). No credentials, no third-party dependency:
stdlib ``ftplib`` only.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from ftplib import FTP
from pathlib import Path

FTP_HOST = "ftp.bsh.de"
FTP_ROOT = "/Stroemungsvorhersagen/grib2"
DIRECTORIES = ("Nordsee", "Ostsee", "Elbe")
DEFAULT_AREAS = ("db", "idb", "nfi", "ofi", "AusAlt", "CuxBru", "BruPag", "PagHam")
_NAME_RE = re.compile(
    r"^Current_(?P<area>[A-Za-z]+)_(?P<run>\d{10})_(?P<day>\d{2})\.grb2\.bz2$"
)


@dataclass(frozen=True)
class RemoteFile:
    directory: str
    name: str
    size: int

    @property
    def area(self) -> str:
        m = _NAME_RE.match(self.name)
        return m["area"] if m else ""


def list_remote(ftp: FTP, areas: set[str]) -> list[RemoteFile]:
    """Every compressed GRIB2 on the FTP whose area is wanted."""
    found: list[RemoteFile] = []
    for directory in DIRECTORIES:
        ftp.cwd(f"{FTP_ROOT}/{directory}")
        entries: list[tuple[str, dict[str, str]]] = list(ftp.mlsd(facts=["size"]))
        for name, facts in entries:
            m = _NAME_RE.match(name)
            if m is None or m["area"] not in areas:
                continue
            found.append(RemoteFile(directory, name, int(facts.get("size", "0"))))
    return sorted(found, key=lambda f: (f.directory, f.name))


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch(ftp: FTP, remote: RemoteFile, archive_dir: Path, manifest: Path) -> bool:
    """Download one file if absent or incomplete. Returns True when fetched."""
    target = archive_dir / remote.directory / remote.name
    if target.exists() and target.stat().st_size == remote.size:
        return False
    target.parent.mkdir(parents=True, exist_ok=True)
    part = target.with_suffix(target.suffix + ".part")
    ftp.cwd(f"{FTP_ROOT}/{remote.directory}")
    with part.open("wb") as fh:
        ftp.retrbinary(f"RETR {remote.name}", fh.write)
    if remote.size and part.stat().st_size != remote.size:
        part.unlink(missing_ok=True)
        raise OSError(
            f"{remote.name}: got {part.stat().st_size if part.exists() else 0} bytes, expected {remote.size}"
        )
    part.replace(target)
    with manifest.open("a") as fh:
        fh.write(
            json.dumps(
                {
                    **asdict(remote),
                    "sha256": _sha256(target),
                    "fetched_at": datetime.now(UTC).isoformat(timespec="seconds"),
                }
            )
            + "\n"
        )
    return True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--archive-dir", type=Path, default=Path("build/bsh/archive"))
    parser.add_argument(
        "--areas", default=",".join(DEFAULT_AREAS), help="comma-separated area codes"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="list what would be fetched"
    )
    args = parser.parse_args(argv)
    areas = {a.strip() for a in args.areas.split(",") if a.strip()}
    archive_dir: Path = args.archive_dir
    manifest = archive_dir / "manifest.jsonl"

    with FTP(FTP_HOST, timeout=120) as ftp:
        ftp.login()
        remote = list_remote(ftp, areas)
        print(f"{len(remote)} remote files match areas {sorted(areas)}")
        fetched = skipped = 0
        total_bytes = 0
        for rf in remote:
            if args.dry_run:
                have = (archive_dir / rf.directory / rf.name).exists()
                print(
                    f"  {'have' if have else 'NEW '} {rf.directory}/{rf.name} ({rf.size / 1e6:.1f} MB)"
                )
                continue
            try:
                if fetch(ftp, rf, archive_dir, manifest):
                    fetched += 1
                    total_bytes += rf.size
                    print(
                        f"  fetched {rf.directory}/{rf.name} ({rf.size / 1e6:.1f} MB)"
                    )
                else:
                    skipped += 1
            except OSError as exc:
                print(f"  ERROR {rf.name}: {exc}", file=sys.stderr)
    if not args.dry_run:
        print(f"fetched {fetched} ({total_bytes / 1e6:.0f} MB), already had {skipped}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
