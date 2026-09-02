# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The Dockerfile and pyproject.toml must agree on what the Space needs.

The Space builds from the Dockerfile, not from ``pyproject.toml``: its
``pip install`` line is the real deployment contract. The pyproject exists so
the tests are collectable and the versions are tracked in the repository, and
it deliberately does not change the deploy path.

That leaves one risk: the two drifting apart, so that a dependency added for
the Space is missing in CI, or the reverse. These tests are the cheap guard
against that, not a full resolver.
"""

from __future__ import annotations

import pathlib
import re
import tomllib

_HF_DIR = pathlib.Path(__file__).parents[1]
_DOCKERFILE = _HF_DIR / "Dockerfile"
_PYPROJECT = _HF_DIR / "pyproject.toml"

# Vendored into the image by the sync workflow and pip-installed from a local
# path, so they carry no version specifier in either file.
_LOCAL_PACKAGES = {"openwind-api", "openwind-mcp-core"}
# ``openwind-data`` is vendored and installed too, but as a dependency of the
# two above rather than of the wrapper, so it appears in the Dockerfile and
# not in the pyproject. Everything the REST layer needs (starlette, httpx) is
# now declared by openwind-api and no longer named here.
_VENDORED_NOT_DECLARED = {"openwind-data"}
_TRANSITIVE_ONLY: set[str] = set()


def _distribution_name(requirement: str) -> str:
    """ "uvicorn[standard]>=0.30" -> "uvicorn". Extras and specifiers dropped."""
    return re.split(r"[\[<>=!;\s]", requirement.strip(), maxsplit=1)[0].lower()


def _pyproject_dependencies() -> set[str]:
    data = tomllib.loads(_PYPROJECT.read_text())
    return {_distribution_name(dep) for dep in data["project"]["dependencies"]}


def _dockerfile_pip_dependencies() -> set[str]:
    """Names on the ``RUN pip install`` line, minus the vendored local paths."""
    text = _DOCKERFILE.read_text()
    # The line is continued with backslashes; join before matching.
    joined = text.replace("\\\n", " ")
    match = re.search(r"^RUN pip install (.+)$", joined, flags=re.MULTILINE)
    assert match, "no `RUN pip install` line found in the Dockerfile"
    names = set()
    for token in match.group(1).split():
        cleaned = token.strip('"')
        if cleaned.startswith("/app/"):
            # /app/data-adapters -> openwind-data is not derivable from the
            # path, and the local packages are asserted separately below.
            continue
        names.add(_distribution_name(cleaned))
    return names


def test_every_third_party_docker_dependency_is_declared() -> None:
    missing = _dockerfile_pip_dependencies() - _pyproject_dependencies()
    assert not missing, (
        f"installed on the Space but absent from pyproject.toml: {sorted(missing)}. "
        "CI would test against a different dependency set than production."
    )


def test_no_third_party_dependency_is_declared_without_shipping() -> None:
    declared = _pyproject_dependencies() - _LOCAL_PACKAGES - _TRANSITIVE_ONLY
    extra = declared - _dockerfile_pip_dependencies()
    assert not extra, (
        f"declared in pyproject.toml but never installed on the Space: {sorted(extra)}. "
        "Either add it to the Dockerfile or drop it from the dependencies."
    )


def test_local_packages_are_vendored_into_the_image() -> None:
    dockerfile = _DOCKERFILE.read_text()
    for vendored in ("vendor/data-adapters", "vendor/api", "vendor/mcp-core"):
        assert vendored in dockerfile, f"{vendored} is no longer copied into the image"
    assert _LOCAL_PACKAGES <= _pyproject_dependencies()


def test_the_vendored_packages_match_what_the_sync_workflow_copies() -> None:
    """The Dockerfile can only COPY what the workflow put in ``vendor/``.

    They are two files in two directories edited at different times, and the
    failure mode is a build that dies on a missing path several minutes in,
    on a Space nobody is watching.
    """
    workflow = (
        pathlib.Path(__file__).parents[3] / ".github" / "workflows" / "sync-hf-space.yml"
    ).read_text()
    dockerfile = _DOCKERFILE.read_text()
    for package in ("data-adapters", "api", "mcp-core"):
        assert f'"$BUILD_DIR/vendor/{package}"' in workflow, (
            f"the sync workflow no longer vendorises {package}, but the Dockerfile still copies it"
        )
        assert f"vendor/{package}" in dockerfile
