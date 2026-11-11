#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars
"""Fixtures for the tidal-stream direction tests, extracted from local atlas builds.

The direction suites (``packages/data-adapters/tests/currents/test_direction_*``)
check that the cascade serves the flood and the ebb the right way round at
reference passes. Two levels, two kinds of data:

- **open atlases** (BSH CC BY 4.0, NorKyst CC BY 4.0, NOAA GoMOFS public
  domain): a few cells around each pass, copied verbatim from the built
  atlas into ``tests/currents/fixtures/atlas_open/`` in the standard layout,
  committed, run by the CI on every pull request;
- **private atlases** (SHOM C2D, MARC PREVIMER, under a no-redistribution
  commitment): nothing is copied. ``patterns`` lists the dataset files the
  cascade opens at each pass, and the CI job downloads only those from the
  private Hugging Face dataset.

Subcommands, run from the repository root::

    uv run --project packages/data-adapters python scripts/build_test_fixtures_currents.py \\
        link-local --build-dir build --out /tmp/ohmywind-atlas
    uv run --project packages/data-adapters python scripts/build_test_fixtures_currents.py \\
        fixtures --build-dir build
    uv run --project packages/data-adapters python scripts/build_test_fixtures_currents.py \\
        patterns --atlas-dir /tmp/ohmywind-atlas

``link-local`` lays the scattered ``build/`` tree out as the dataset is laid
out (one directory per atlas, the SHOM pair at the root), with symlinks only,
so ``MARC_ATLAS_DIR=/tmp/ohmywind-atlas`` runs the private suite locally
without copying a byte.

``fixtures`` and ``patterns`` both verify what they wrote: the cascade over
the extract must answer, at every instant the suites sample, exactly what it
answers over the full atlases. An extract that changes the answer is refused.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import shutil
import sys
import tempfile
from pathlib import Path

import numpy as np
import polars as pl
from openwind_data.currents.marc_atlas import (
    MarcAtlasRegistry,
    _neighbour_tiles,
    _tile_origin_of,
    _tile_path_at,
)
from openwind_data.currents.router import CompositeMarineAdapter
from openwind_data.currents.shom_c2d_registry import ShomC2dRegistry

REPO = Path(__file__).resolve().parents[1]
TESTS = REPO / "packages" / "data-adapters" / "tests" / "currents"


def _truth():
    """The pass list, from the test helper itself, so the two cannot drift."""
    spec = importlib.util.spec_from_file_location(
        "tidal_truth", TESTS / "tidal_truth.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules["tidal_truth"] = module
    spec.loader.exec_module(module)
    return module


# Where each published atlas family sits in a local ``build/`` tree.
_BUILD_GLOBS = (
    "marc/*",
    "bsh/atlas/BSH_*",
    "cmems/atlas/CMEMS_*",
    "cmems_arc/atlas/CMEMS_ARC_*",
    "norkyst/atlas/NORKYST_*",
)
_SHOM_FILES = ("shom_c2d_points.parquet", "shom_c2d_ref_ports.json")

# The open fixtures and where their atlas is built. GoMOFS is not in the
# dataset (the North American atlases are frozen, docs/tidal-world/README.md):
# it is here for its builder, the one that rotates ROMS grid velocities.
_OPEN_ATLASES = {
    "BSH_AUSALT": "bsh/atlas/BSH_AUSALT",
    "BSH_CUXBRU": "bsh/atlas/BSH_CUXBRU",
    "NORKYST_TRONDELAG": "norkyst/atlas/NORKYST_TRONDELAG",
    "GOMOFS_FUNDY": "ofs/gomofs/atlas/GOMOFS_FUNDY",
}
# Cells kept around a pass, in grid steps. The cascade reads the nearest cell
# per variable and, in a coastal atlas, looks three cells around for a living
# one only when the nearest is dead. Two steps keep the nearest cell of each
# variable and its ring; the verification below refuses anything less.
_EXTRACT_RADIUS_STEPS = 2.0
_M_PER_DEG = 111_000.0


def cmd_link_local(build_dir: Path, out: Path) -> int:
    out.mkdir(parents=True, exist_ok=True)
    n = 0
    for pattern in _BUILD_GLOBS:
        for src in sorted(build_dir.glob(pattern)):
            if (src / "metadata.json").exists():
                dst = out / src.name
                if dst.is_symlink() or dst.exists():
                    dst.unlink()
                dst.symlink_to(src.resolve())
                n += 1
    for name in _SHOM_FILES:
        src = build_dir / "shom_c2d" / name
        if src.exists():
            dst = out / name
            if dst.is_symlink() or dst.exists():
                dst.unlink()
            dst.symlink_to(src.resolve())
    print(f"{n} atlases linked under {out}; export MARC_ATLAS_DIR={out}")
    return 0


def _series_signature(
    adapter: CompositeMarineAdapter, truth, passes
) -> dict[str, list]:
    """What the cascade serves at every sampled instant of every pass."""
    out: dict[str, list] = {}
    for p in passes:
        for phase in p.phases:
            r = truth.stream_by_apply_atlases(adapter, p, phase)
            out[f"{p.key}/{phase.label}"] = list(
                zip(r.sources, r.directions, r.speeds, strict=True)
            )
    return out


def _same(a: dict[str, list], b: dict[str, list]) -> list[str]:
    bad: list[str] = []
    for key, served in a.items():
        for (sa, da, va), (sb, db, vb) in zip(served, b[key], strict=True):
            if (
                sa != sb
                or not np.isclose(da, db, atol=1e-6)
                or not np.isclose(va, vb, atol=1e-6)
            ):
                bad.append(f"{key}: {sa} {da:.3f} {va:.3f} != {sb} {db:.3f} {vb:.3f}")
                break
    return bad


def _extract_atlas(src: Path, dst: Path, points: list[tuple[float, float]]) -> int:
    meta = json.loads((src / "metadata.json").read_text())
    res = float(meta["resolution_m"])
    tile_deg = float((meta.get("grid") or {}).get("tile_deg") or 0.5)
    radius_m = _EXTRACT_RADIUS_STEPS * res
    kept: dict[Path, pl.DataFrame] = {}
    for lat, lon in points:
        tiles = [
            (*_tile_origin_of(lat, lon, tile_deg), 0.0),
            *_neighbour_tiles(lat, lon, tile_deg),
        ]
        for t_lat, t_lon, floor_m in tiles:
            if floor_m > radius_m:
                continue
            rel = (
                Path(f"tile_lat={t_lat:.1f}") / f"tile_lon={t_lon:.1f}" / "data.parquet"
            )
            if not (src / rel).exists():
                continue
            df = pl.read_parquet(src / rel)
            cos = np.cos(np.deg2rad(lat))
            d = np.hypot(
                (df["lat"].to_numpy() - lat) * _M_PER_DEG,
                (df["lon"].to_numpy() - lon) * _M_PER_DEG * cos,
            )
            near = df.filter(pl.Series(d <= radius_m))
            if near.height:
                kept[rel] = (
                    pl.concat([kept[rel], near]).unique() if rel in kept else near
                )
    if dst.exists():
        shutil.rmtree(dst)
    dst.mkdir(parents=True)
    cells = 0
    tile_polys = []
    for rel, df in sorted(kept.items()):
        (dst / rel).parent.mkdir(parents=True, exist_ok=True)
        df = df.sort(["lat", "lon"])
        df.write_parquet(
            dst / rel, compression="zstd", compression_level=19, statistics=False
        )
        cells += df.height
        t_lat = float(rel.parts[0].split("=")[1])
        t_lon = float(rel.parts[1].split("=")[1])
        tile_polys.append(
            [
                [
                    [t_lon, t_lat],
                    [t_lon + tile_deg, t_lat],
                    [t_lon + tile_deg, t_lat + tile_deg],
                    [t_lon, t_lat + tile_deg],
                    [t_lon, t_lat],
                ]
            ]
        )
    # The emprise stays the atlas's own: it decides where the atlas is a
    # candidate, and a shrunken one would change the cascade's order.
    cov = json.loads((src / "coverage.geojson").read_text())
    bbox_feature = cov["features"][0]
    (dst / "coverage.geojson").write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    bbox_feature,
                    {
                        "type": "Feature",
                        "properties": {"atlas": meta["atlas"], "kind": "tiles"},
                        "geometry": {"type": "MultiPolygon", "coordinates": tile_polys},
                    },
                ],
            }
        )
        + "\n"
    )
    meta.pop("inputs", None)
    meta["cells"] = cells
    meta["tiles"] = len(kept)
    meta["test_fixture"] = {
        "note": "Extract for the tidal-stream direction tests, cells copied verbatim from the built atlas.",
        "script": "scripts/build_test_fixtures_currents.py",
        "points": [[round(a, 4), round(b, 4)] for a, b in points],
        "radius_m": radius_m,
    }
    (dst / "metadata.json").write_text(
        json.dumps(meta, indent=1, ensure_ascii=False) + "\n"
    )
    return cells


_README = """\
# Atlas ouverts pour les tests de sens des courants

Extraits de quelques cellules d'atlas harmoniques construits par OhMyWind, au
format standard (`docs/harmonic_atlas_format.md`), lus par
`tests/currents/test_direction_open.py`. Régénérés par
`scripts/build_test_fixtures_currents.py fixtures --build-dir build` ; le
script refuse un extrait qui change la réponse de la cascade au point testé.

Seules des sources redistribuables sont ici. MARC PREVIMER et SHOM C2D, sous
engagement de non redistribution, n'y sont pas : leurs tests lisent le jeu
de données privé (`test_direction_real_atlas.py`, marqueur `real_atlas`).

Constantes de hauteur des ports de calage (dans `tidal_truth.py`, pas dans ce
dossier) : TICON-4, Hart-Davis, Dettmering, Seitz (DGFI-TUM), SEANOE 2025,
doi:10.17882/109129, CC BY 4.0 ; amplitudes converties en mètres, phases
ramenées à [0, 360[.

## Attributions

"""


def cmd_fixtures(build_dir: Path, out: Path) -> int:
    truth = _truth()
    passes = truth.OPEN_FIXTURE_PASSES
    by_atlas: dict[str, list[tuple[float, float]]] = {}
    for p in passes:
        by_atlas.setdefault(p.fixture_atlas, []).append((p.lat, p.lon))
    out.mkdir(parents=True, exist_ok=True)
    readme = [_README]
    for name, points in sorted(by_atlas.items()):
        src = build_dir / _OPEN_ATLASES[name]
        cells = _extract_atlas(src, out / name, points)
        meta = json.loads((src / "metadata.json").read_text())
        source = meta["source"]
        readme.append(
            f"- **{name}** ({cells} cellules) : {source['attribution']} "
            f"Licence : {source['licence']['name']} ({source['licence']['url']}). "
            f"Source : {source['url']}.\n"
        )
        print(f"{name}: {cells} cells")
    (out / "README.md").write_text("".join(readme))

    # The extract must answer what the full atlases answer, instant for instant.
    with tempfile.TemporaryDirectory() as tmp:
        full_root = Path(tmp)
        for name in by_atlas:
            (full_root / name).symlink_to((build_dir / _OPEN_ATLASES[name]).resolve())
        everything = frozenset()
        full = CompositeMarineAdapter(
            upstream=None,  # type: ignore[arg-type]
            marc=MarcAtlasRegistry.from_directory(full_root, withheld=everything),
        )
        extract = CompositeMarineAdapter(
            upstream=None,  # type: ignore[arg-type]
            marc=MarcAtlasRegistry.from_directory(out, withheld=everything),
        )
        bad = _same(
            _series_signature(full, truth, passes),
            _series_signature(extract, truth, passes),
        )
    size = sum(f.stat().st_size for f in out.rglob("*") if f.is_file())
    print(f"fixtures under {out}: {size / 1024:.1f} KiB")
    if bad:
        print(
            "extract differs from the full atlas:\n  " + "\n  ".join(bad),
            file=sys.stderr,
        )
        return 1
    return 0


def _pattern_files(atlas_dir: Path, truth) -> list[str]:
    """Dataset paths the cascade opens at each private pass, and nothing else."""
    marc = MarcAtlasRegistry.from_directory(atlas_dir)
    shom = ShomC2dRegistry.from_directory(atlas_dir)
    files: set[str] = set(_SHOM_FILES)
    for p in truth.REAL_ATLAS_PASSES:
        if shom.covers(p.lat, p.lon):
            continue  # SHOM answers before any atlas is opened
        for atlas in marc._candidates(p.lat, p.lon):
            name = atlas.parquet_dir.name
            files.add(f"{name}/metadata.json")
            files.add(f"{name}/coverage.geojson")
            reach = max(marc._cell_threshold_m(atlas), 3.0 * atlas.resolution_m)
            tile_lat, tile_lon = _tile_origin_of(p.lat, p.lon, atlas.tile_deg)
            tiles = [
                (tile_lat, tile_lon, 0.0),
                *_neighbour_tiles(p.lat, p.lon, atlas.tile_deg),
            ]
            for t_lat, t_lon, floor_m in tiles:
                path = _tile_path_at(atlas, t_lat, t_lon)
                if floor_m < reach and path.exists():
                    files.add(str(path.relative_to(atlas_dir)))
            if marc._decline(atlas, p.lat, p.lon) is None:
                break  # the atlas that answers; those behind it are never read
    return sorted(files)


def cmd_patterns(atlas_dir: Path, out: Path) -> int:
    truth = _truth()
    files = _pattern_files(atlas_dir, truth)
    size = sum((atlas_dir / f).stat().st_size for f in files)
    header = (
        "# Dataset files the private direction suite opens (test_direction_real_atlas.py).\n"
        "# One path per line, relative to the root of Qdonnars/openwind-tidal-atlas, read\n"
        "# by the CI job as snapshot_download(allow_patterns=...). Regenerate with\n"
        "#   scripts/build_test_fixtures_currents.py patterns --atlas-dir <dataset copy>\n"
        f"# {len(files)} files, {size / 1e6:.1f} MB.\n"
    )
    out.write_text(header + "".join(f"{f}\n" for f in files))
    print(f"{len(files)} files, {size / 1e6:.1f} MB -> {out}")

    # The subset must answer what the whole dataset answers.
    with tempfile.TemporaryDirectory() as tmp:
        sub = Path(tmp)
        for f in files:
            (sub / f).parent.mkdir(parents=True, exist_ok=True)
            (sub / f).symlink_to((atlas_dir / f).resolve())

        def adapter(root: Path) -> CompositeMarineAdapter:
            return CompositeMarineAdapter(
                upstream=None,  # type: ignore[arg-type]
                marc=MarcAtlasRegistry.from_directory(root),
                shom=ShomC2dRegistry.from_directory(root),
            )

        passes = truth.REAL_ATLAS_PASSES
        bad = _same(
            _series_signature(adapter(atlas_dir), truth, passes),
            _series_signature(adapter(sub), truth, passes),
        )
    if bad:
        print(
            "subset differs from the dataset:\n  " + "\n  ".join(bad), file=sys.stderr
        )
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_link = sub.add_parser(
        "link-local", help="lay build/ out as the dataset, with symlinks"
    )
    p_link.add_argument("--build-dir", type=Path, default=REPO / "build")
    p_link.add_argument("--out", type=Path, required=True)
    p_fix = sub.add_parser("fixtures", help="extract the open fixtures")
    p_fix.add_argument("--build-dir", type=Path, default=REPO / "build")
    p_fix.add_argument("--out", type=Path, default=TESTS / "fixtures" / "atlas_open")
    p_pat = sub.add_parser(
        "patterns", help="list the private dataset files the suite reads"
    )
    p_pat.add_argument("--atlas-dir", type=Path, required=True)
    p_pat.add_argument(
        "--out", type=Path, default=TESTS / "fixtures" / "real_atlas_patterns.txt"
    )
    args = parser.parse_args(argv)
    if args.cmd == "link-local":
        return cmd_link_local(args.build_dir, args.out)
    if args.cmd == "fixtures":
        return cmd_fixtures(args.build_dir, args.out)
    return cmd_patterns(args.atlas_dir, args.out)


if __name__ == "__main__":
    raise SystemExit(main())
