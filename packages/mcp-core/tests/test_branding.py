"""Guards on the brand strings clients actually see.

Written after the 2026-08-01 cosmetic rebrand shipped with the server name
still on the old brand. The sweep that renamed everything else matched
``OpenWind`` and ``openwind.fr``; ``FastMCP("openwind")`` is lowercase and
bare, so it slipped through, and nothing failed. The commit message and the PR
both claimed it was done.

These assertions are cheap and they fail loudly. They exist because a rename
verified by grepping is only as good as the grep.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

from openwind_mcp_core import build_server
from openwind_mcp_core.render import build_ohmywind_url
from openwind_mcp_core.server import PLAN_UI_RESOURCE_URI, SERVER_NAME

# Identifiers that legitimately still carry the pre-rebrand spelling. Each one
# routes something or is resolved by something, so renaming it is a breaking
# change scheduled with the Space and module renames, not a copy edit.
DELIBERATE_LEGACY = {
    PLAN_UI_RESOURCE_URI: "resource URI resolved by MCP Apps hosts",
    "openwind_url": "field name in the tool's structuredContent",
}


def test_server_name_is_the_current_brand() -> None:
    """The name clients display. This is the one that shipped wrong."""
    server = build_server(adapter=object())
    assert server.name == "ohmywind"
    assert SERVER_NAME == "ohmywind"


def test_deep_links_point_at_the_current_domain() -> None:
    url = build_ohmywind_url([{"lat": 43.3, "lon": 5.4}], "2026-08-02T08:00:00Z", "cruiser_40ft")
    assert url.startswith("https://ohmywind.fr/plan?")


def _docstring_nodes(tree: ast.AST) -> set[int]:
    """ids() of the Constant nodes that are docstrings rather than data."""
    docstrings = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Module | ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef):
            continue
        body = getattr(node, "body", None)
        if not body:
            continue
        first = body[0]
        if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant):
            if isinstance(first.value.value, str):
                docstrings.add(id(first.value))
    return docstrings


def test_no_stale_brand_in_strings_shown_to_users() -> None:
    """Scan every string literal in the package for the old brand.

    Deliberately source-level rather than behavioural: the failure being
    guarded against is a *missed* occurrence, so the check has to look at
    everything rather than at the handful of values a test happens to call.

    Docstrings and comments are excluded on purpose. They are prose for whoever
    reads the repo, and several of them exist precisely to explain why an
    identifier still carries the old spelling. String literals are what reaches
    a user, so those are what this holds to the current brand.
    """
    package = Path(__file__).resolve().parents[1] / "src" / "openwind_mcp_core"
    pattern = re.compile(r"[A-Za-z0-9_.-]*[Oo]pen[Ww]ind[A-Za-z0-9_.-]*")
    found: dict[str, list[str]] = {}

    for source in sorted(package.rglob("*.py")):
        tree = ast.parse(source.read_text(encoding="utf-8"))
        docstrings = _docstring_nodes(tree)

        leftovers: set[str] = set()
        for node in ast.walk(tree):
            if not isinstance(node, ast.Constant) or not isinstance(node.value, str):
                continue
            if id(node) in docstrings:
                continue
            text = node.value
            for legacy in DELIBERATE_LEGACY:
                text = text.replace(legacy, "")
            leftovers.update(m.group(0) for m in pattern.finditer(text))

        if leftovers:
            found[source.name] = sorted(leftovers)

    assert found == {}, f"pre-rebrand strings left in mcp-core: {found}"
