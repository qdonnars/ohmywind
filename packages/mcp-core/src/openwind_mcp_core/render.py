"""Deep-link helper used by ``plan_passage``.

Historically this module also generated a ~5 KB self-contained HTML widget
that the LLM was asked to inject verbatim into chat. That pattern was fragile
across hosts (Cursor / Le Chat / terminal would code-fence or sanitize it),
so we removed it in PR #74 and migrated to MCP Apps: a sandboxed
``ui://openwind/plan-passage`` resource that iframes ohmywind.fr/plan
directly. The web app is now the single source of visual truth.

(The resource URI still carries the pre-rebrand ``openwind`` segment. It is a
contract identifier resolved by hosts, not display copy, so it is renamed in a
later phase alongside the Space and module renames.)

Only the URL builder remains here — used both by the tool's response payload
and by the MCP Apps resource template.
"""

from __future__ import annotations

from urllib.parse import quote


def build_ohmywind_url(
    waypoints: list[dict[str, float]],
    departure_iso: str,
    archetype: str,
) -> str:
    """Build the ohmywind.fr/plan deep-link URL.

    Used as the always-on fallback CTA for clients that don't render the MCP
    Apps iframe (Le Chat, Goose, terminals) — they show this URL as
    "View full plan →" instead.

    Deep-links emitted before the rebrand pointed at ``openwind.fr``; those
    keep working through the 301 that fronts the old domain.
    """
    wpts = ";".join(f"{w['lat']:.3f},{w['lon']:.3f}" for w in waypoints)
    dep = quote(departure_iso, safe="")
    return f"https://ohmywind.fr/plan?wpts={wpts}&departure={dep}&archetype={archetype}"
