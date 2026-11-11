# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The build step that pulls the tidal atlases, and refuses to ship without them.

An image built without the atlases looks healthy from outside and plans the
Raz de Sein on an 8 km global current. These tests pin that the build stops
in every way that can happen (no token, a network or permission error, a
dataset that came down incomplete), that it passes when the dataset is
whole, and that the one explicit escape hatch still builds a local image.
No network: ``huggingface_hub`` is replaced by fakes that write a dataset on
disk, or raise.
"""

from __future__ import annotations

import importlib.util
import json
import logging
import pathlib
import types

import huggingface_hub
import pytest
from openwind_data.currents.land_mask import LandMask

_HF_DIR = pathlib.Path(__file__).parents[1].resolve()


def _load(name: str):
    spec = importlib.util.spec_from_file_location(f"hf_{name}", _HF_DIR / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def fetch():
    return _load("fetch_atlases")


def _write_dataset(root: pathlib.Path, *, atlases, root_files, empty=()) -> None:
    """The dataset's layout: one directory per harmonic atlas, SHOM and the mask at the root."""
    root.mkdir(parents=True, exist_ok=True)
    for name in atlases:
        sub = root / name
        sub.mkdir(exist_ok=True)
        (sub / "metadata.json").write_text(json.dumps({"atlas": name}))
        if name not in empty:
            tile = sub / "tile_lat=48.0" / "tile_lon=-5.0"
            tile.mkdir(parents=True, exist_ok=True)
            (tile / "data.parquet").write_bytes(b"PAR1")
    for name in root_files:
        (root / name).write_bytes(b"x")


class _FakeHub:
    """Stands in for ``snapshot_download`` and ``HfApi``: writes, or raises."""

    def __init__(self, monkeypatch, *, writer=None, error: Exception | None = None):
        self.calls: list[dict] = []
        self._writer = writer
        self._error = error
        monkeypatch.setattr(huggingface_hub, "snapshot_download", self._download)
        monkeypatch.setattr(huggingface_hub, "HfApi", self._api)

    def _download(self, repo_id, *, repo_type, local_dir, token):
        self.calls.append({"repo_id": repo_id, "repo_type": repo_type, "token": token})
        if self._error is not None:
            raise self._error
        if self._writer is not None:
            self._writer(pathlib.Path(local_dir))
        return local_dir

    @staticmethod
    def _api(token):
        return types.SimpleNamespace(dataset_info=lambda _id: types.SimpleNamespace(private=True))


def _env(tmp_path, **extra) -> dict[str, str]:
    return {"ATLAS_DATA_DIR": str(tmp_path / "atlas"), "HF_TOKEN": "hf_test"} | extra


def _complete(fetch):
    def write(root: pathlib.Path) -> None:
        _write_dataset(
            root,
            atlases=[*fetch.REQUIRED_HARMONIC_ATLASES, "BSH_NORDSEE"],
            root_files=fetch.REQUIRED_ROOT_FILES,
        )

    return write


def test_a_complete_dataset_builds(fetch, tmp_path, monkeypatch, capsys) -> None:
    hub = _FakeHub(monkeypatch, writer=_complete(fetch))
    assert fetch.main(_env(tmp_path)) == 0
    assert hub.calls == [
        {"repo_id": "Qdonnars/openwind-tidal-atlas", "repo_type": "dataset", "token": "hf_test"}
    ]
    out = capsys.readouterr().out
    assert "harmonic atlases (8)" in out
    assert "BSH_NORDSEE" in out


def test_no_token_fails_the_build(fetch, tmp_path, monkeypatch, capsys) -> None:
    hub = _FakeHub(monkeypatch, writer=_complete(fetch))
    env = _env(tmp_path)
    del env["HF_TOKEN"]
    assert fetch.main(env) == 1
    assert hub.calls == []
    err = capsys.readouterr().err
    assert "HF_TOKEN is not set" in err
    assert "ALLOW_MISSING_ATLASES=1" in err


@pytest.mark.parametrize(
    "error",
    [
        OSError("Connection reset by peer"),
        # What an expired token or a revoked read access comes back as.
        PermissionError("401 Client Error: Unauthorized for url"),
    ],
)
def test_a_network_or_permission_error_fails_the_build(
    fetch, tmp_path, monkeypatch, capsys, error
) -> None:
    _FakeHub(monkeypatch, error=error)
    assert fetch.main(_env(tmp_path)) == 1
    assert "ERROR fetching the tidal atlas dataset" in capsys.readouterr().err
    # The directory exists all the same: the runtime loaders read an empty
    # one as "no coverage" rather than crashing, if anything ever runs it.
    assert (tmp_path / "atlas").is_dir()


def test_a_dataset_missing_an_atlas_fails_the_build(fetch, tmp_path, monkeypatch, capsys) -> None:
    def write(root: pathlib.Path) -> None:
        _write_dataset(
            root,
            atlases=[a for a in fetch.REQUIRED_HARMONIC_ATLASES if a != "FINIS"],
            root_files=fetch.REQUIRED_ROOT_FILES,
        )

    _FakeHub(monkeypatch, writer=write)
    assert fetch.main(_env(tmp_path)) == 1
    assert "harmonic atlases missing: FINIS" in capsys.readouterr().err


def test_a_dataset_without_shom_or_the_mask_fails_the_build(
    fetch, tmp_path, monkeypatch, capsys
) -> None:
    def write(root: pathlib.Path) -> None:
        _write_dataset(root, atlases=fetch.REQUIRED_HARMONIC_ATLASES, root_files=())

    _FakeHub(monkeypatch, writer=write)
    assert fetch.main(_env(tmp_path)) == 1
    err = capsys.readouterr().err
    assert "shom_c2d_points.parquet missing" in err
    assert "shom_c2d_ref_ports.json missing" in err
    assert "land_mask.npz missing" in err


def test_an_atlas_without_tiles_fails_the_build(fetch, tmp_path, monkeypatch, capsys) -> None:
    # A metadata.json alone is what an interrupted upload leaves behind.
    def write(root: pathlib.Path) -> None:
        _write_dataset(
            root,
            atlases=fetch.REQUIRED_HARMONIC_ATLASES,
            root_files=fetch.REQUIRED_ROOT_FILES,
            empty=("MANE",),
        )

    _FakeHub(monkeypatch, writer=write)
    assert fetch.main(_env(tmp_path)) == 1
    assert "without a single tile: MANE" in capsys.readouterr().err


def test_the_atlas_name_is_the_one_its_metadata_gives(fetch, tmp_path) -> None:
    # The runtime registry serves an atlas under ``metadata.json``'s name.
    root = tmp_path / "atlas"
    _write_dataset(root, atlases=["FINIS"], root_files=())
    (root / "FINIS").rename(root / "finis-v2")
    assert fetch.harmonic_atlases(root) == {"FINIS": True}


def test_the_escape_hatch_builds_without_a_token(fetch, tmp_path, monkeypatch, capsys) -> None:
    hub = _FakeHub(monkeypatch, writer=_complete(fetch))
    env = _env(tmp_path, ALLOW_MISSING_ATLASES="1")
    del env["HF_TOKEN"]
    assert fetch.main(env) == 0
    assert hub.calls == []
    out = capsys.readouterr().out
    assert "ALLOW_MISSING_ATLASES=1" in out
    assert "Never ship this image" in out
    assert (tmp_path / "atlas").is_dir()


def test_the_escape_hatch_also_covers_an_incomplete_dataset(fetch, tmp_path, monkeypatch) -> None:
    _FakeHub(monkeypatch, error=OSError("unreachable"))
    assert fetch.main(_env(tmp_path, ALLOW_MISSING_ATLASES="true")) == 0


def test_the_required_list_can_be_replaced(fetch, tmp_path, monkeypatch, capsys) -> None:
    def write(root: pathlib.Path) -> None:
        _write_dataset(root, atlases=["FINIS"], root_files=fetch.REQUIRED_ROOT_FILES)

    _FakeHub(monkeypatch, writer=write)
    assert fetch.main(_env(tmp_path, REQUIRED_ATLASES="FINIS")) == 0
    assert fetch.main(_env(tmp_path, REQUIRED_ATLASES="FINIS, ATLNE")) == 1
    assert "harmonic atlases missing: ATLNE" in capsys.readouterr().err


@pytest.mark.parametrize(
    ("raw", "allowed"), [("1", True), ("true", True), ("yes", True), ("0", False), ("", False)]
)
def test_allow_missing_reads_only_an_explicit_yes(fetch, raw, allowed) -> None:
    assert fetch.allow_missing({"ALLOW_MISSING_ATLASES": raw}) is allowed


# ---------------------------------------------------------------- at runtime


def _services(*, marc_atlases=(), shom_points=0, land=False):
    import numpy as np

    return types.SimpleNamespace(
        marc=types.SimpleNamespace(atlases=marc_atlases),
        shom=types.SimpleNamespace(lats=np.zeros(shom_points)),
        land=LandMask(bits=np.zeros(1, dtype=np.uint8)) if land else LandMask.empty(),
    )


def test_starting_without_atlases_is_an_error_unless_allowed(caplog) -> None:
    app = _load("app")
    with caplog.at_level(logging.INFO):
        assert app.report_atlases(_services(), environ={}) is False
    record = caplog.records[-1]
    assert record.levelno == logging.ERROR
    assert "WITHOUT harmonic atlases" in record.getMessage()
    assert "SHOM Atlas C2D" in record.getMessage()


def test_starting_without_atlases_when_allowed_is_a_warning(caplog) -> None:
    app = _load("app")
    with caplog.at_level(logging.INFO):
        app.report_atlases(_services(), environ={"ALLOW_MISSING_ATLASES": "1"})
    assert caplog.records[-1].levelno == logging.WARNING


def test_a_full_start_says_what_it_loaded(caplog) -> None:
    app = _load("app")
    with caplog.at_level(logging.INFO):
        assert app.report_atlases(
            _services(marc_atlases=("A", "B"), shom_points=10, land=True), environ={}
        )
    assert "2 harmonic atlas(es), 10 SHOM C2D point(s)" in caplog.records[-1].getMessage()
