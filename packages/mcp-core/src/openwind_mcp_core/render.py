# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

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

import logging
import math
import os
from urllib.parse import quote, urlsplit

from openwind_data.routing import validate_motor

_logger = logging.getLogger(__name__)

DEFAULT_WEB_BASE = "https://ohmywind.fr"

# Which web app the deep-links point at, per environment.
#
# This was hard-coded to production, so the dev Space handed out production
# links: every plan produced while testing sent the tester to the live site,
# and nothing exercised the dev front end. The web app has had `VITE_API_BASE`
# per environment from the start; this is the missing mirror of it.
#
# Set `OHMYWIND_WEB_BASE=https://dev.ohmywind.fr` on the dev Space. Unset, it
# stays on production, so an unconfigured deployment behaves as before rather
# than emitting links to nowhere.
WEB_BASE_ENV_VAR = "OHMYWIND_WEB_BASE"


def _resolve_web_base() -> str:
    """Read and sanity-check the configured web base, else fall back.

    A malformed value would be baked into every deep-link we hand out, so a bad
    setting degrades to production rather than shipping broken URLs quietly.
    """
    raw = (os.environ.get(WEB_BASE_ENV_VAR) or "").strip().rstrip("/")
    if not raw:
        return DEFAULT_WEB_BASE
    parts = urlsplit(raw)
    if parts.scheme not in ("http", "https") or not parts.netloc:
        _logger.warning(
            "ohmywind: ignoring %s=%r (need an absolute http(s) URL), using %s",
            WEB_BASE_ENV_VAR,
            raw,
            DEFAULT_WEB_BASE,
        )
        return DEFAULT_WEB_BASE
    return raw


WEB_BASE = _resolve_web_base()
# Bare host for display, e.g. "dev.ohmywind.fr". The widget names the site it
# is about to send you to, and naming production while linking to dev would be
# worse than not naming it at all.
WEB_HOST = urlsplit(WEB_BASE).netloc


# ``plan_passage``'s ``efficiency`` default, the tool signature reads it from
# here. The deep-link carries ``eff`` only when the call departs from it, so a
# plan at the default keeps the URL it always had.
DEFAULT_EFFICIENCY = 0.75


def _short(x: float) -> str:
    """A number as the web parser reads it: ``4``, ``5.5``, ``0.85``."""
    return f"{x:g}"


def build_ohmywind_url(
    waypoints: list[dict[str, float]],
    departure_iso: str,
    archetype: str,
    *,
    motor_threshold_kn: float | None = None,
    motor_speed_kn: float | None = None,
    efficiency: float = DEFAULT_EFFICIENCY,
) -> str:
    """Build the ``/plan`` deep-link URL for the configured web app.

    Used as the always-on fallback CTA for clients that don't render the MCP
    Apps iframe (Le Chat, Goose, terminals) — they show this URL as the
    link to adjust the route or the departure on the site.

    The plan's engine settings ride along so the site recomputes the plan the
    conversation gave, not one under the visitor's saved boat (issue #534):

    - ``motor=<threshold>,<speed>`` in knots, only when both are set and
      valid. Either alone is ignored by the engine (``validate_motor`` and
      :class:`BoatPolar`), so the link ignores it too.
    - ``eff=<efficiency>``, only when it differs from :data:`DEFAULT_EFFICIENCY`.

    Both come after the historical parameters, whose order does not change.

    Deep-links emitted before the rebrand pointed at ``openwind.fr``; those
    keep working through the 301 that fronts the old domain.
    """
    wpts = ";".join(f"{w['lat']:.3f},{w['lon']:.3f}" for w in waypoints)
    dep = quote(departure_iso, safe="")
    url = f"{WEB_BASE}/plan?wpts={wpts}&departure={dep}&archetype={archetype}"
    if motor_threshold_kn is not None and motor_speed_kn is not None:
        try:
            validate_motor(motor_threshold_kn, motor_speed_kn)
        except ValueError:
            pass
        else:
            url += f"&motor={_short(motor_threshold_kn)},{_short(motor_speed_kn)}"
    if (
        math.isfinite(efficiency)
        and 0.0 < efficiency <= 1.0
        and _short(efficiency) != _short(DEFAULT_EFFICIENCY)
    ):
        url += f"&eff={_short(efficiency)}"
    return url


def build_explore_url(lat: float, lon: float, zoom: int = 11) -> str:
    """The web app's map, centred on a point.

    For the answers that have no plan to open: a forecast or a tidal stream at
    one point. The map opens there and the user picks the spot. Same
    ``center``/``zoom`` parameters the web app already reads to carry its
    camera between pages (``web/src/utils/mapViewParams.ts``).
    """
    return f"{WEB_BASE}/?center={lat:.4f},{lon:.4f}&zoom={zoom}"
