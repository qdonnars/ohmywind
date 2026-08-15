# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The registry manifest must keep matching what we actually serve.

``server.json`` is what directories, clients and articles copy from. Once an
entry is published, the URL inside it gets duplicated into places we do not
control, so a drift between this file and the real endpoint is expensive in a
way most config drift is not: republishing fixes the registry, not the copies.

Offline on purpose. A network check would fail in CI for reasons unrelated to
the manifest, and the drift being guarded against is between two files in this
repo, not between us and the registry.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
MANIFEST = REPO_ROOT / "server.json"

# The namespace is earned by a DNS TXT record on this exact domain. Publishing
# under any other prefix would be rejected, so the two must agree.
AUTH_DOMAIN = "ohmywind.fr"
EXPECTED_NAMESPACE = "fr.ohmywind"
PUBLIC_ENDPOINT = "https://mcp.ohmywind.fr/mcp"


@pytest.fixture(scope="module")
def manifest() -> dict:
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def test_namespace_matches_the_domain_we_can_prove(manifest) -> None:
    namespace, _, _ = manifest["name"].partition("/")
    assert namespace == EXPECTED_NAMESPACE
    # Reverse-DNS of the domain that carries the proof record.
    assert ".".join(reversed(AUTH_DOMAIN.split("."))) == namespace


def test_description_fits_the_registry_limit(manifest) -> None:
    """100 characters, enforced by the schema and easy to blow past."""
    assert 0 < len(manifest["description"]) <= 100


def test_the_advertised_endpoint_is_the_public_one(manifest) -> None:
    """Never a ``*.hf.space`` URL.

    The whole point of fronting the Spaces with our own domain was so that the
    published address survives a change of backend. Publishing the Space
    hostname would hand that guarantee back.
    """
    remotes = manifest["remotes"]
    assert [r["url"] for r in remotes] == [PUBLIC_ENDPOINT]
    assert all(r["type"] == "streamable-http" for r in remotes)
    assert "hf.space" not in MANIFEST.read_text(encoding="utf-8")


def test_the_readme_advertises_the_same_endpoint() -> None:
    """The README is what directories mirror, so the two must not diverge."""
    readme = (REPO_ROOT / "README.md").read_text(encoding="utf-8")
    assert PUBLIC_ENDPOINT in readme


def test_version_is_semver_ish(manifest) -> None:
    parts = manifest["version"].split("-")[0].split(".")
    assert len(parts) == 3 and all(p.isdigit() for p in parts), manifest["version"]
