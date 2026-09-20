# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""The engine's warnings as codes, so a client can say them in its language.

Every warning the passage engine, the complexity scorer or a sweep raises is
a French sentence built here from a template, and travels with the code and
the values that filled it. The sentence is what an MCP client reads and what
an older web build shows; the code is what the web app looks up in its own
dictionary, in the reader's language, with the same values (issue #411).

The values are display strings, formatted once here (``"2.6"``, ``"26-30"``),
or plain counts. A client interpolates them as they are and never formats a
number again, so a French decimal point and an English one look the same on
both sides, which is what the goldens pin.

The codes are the contract with the web app's ``plan.notice.*`` keys: adding
a warning means adding a template here and its five translations there.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

# One French template per code. The wind and sea bands carry their level in
# the code rather than in a parameter: the label ("soutenu", "agitée") is a
# word to translate, not a value to interpolate.
FR_TEMPLATES: dict[str, str] = {
    "passage.long_route": (
        "trajet long ({route_nm} nm) : {points} points météo échantillonnés "
        "(~{spacing_nm} nm entre points) au lieu de {requested_nm} nm pour "
        "limiter les requêtes API."
    ),
    "passage.light_wind": "vent faible : vitesse mini {min_speed_kn} kn, passage très lent",
    "passage.model_fallback": (
        "modèle {model} sans données sur {fallback_count}/{total} points "
        "(probable hors zone de couverture) ; fallback automatique sur {others}"
    ),
    "currents.tidal_gap": (
        "courants de marée probablement forts ({zones}) et non résolus par nos sources : "
        "les courants annoncés viennent d'une maille de 2 à 8 km qui ne les voit pas. "
        "Nous travaillons à élargir la couverture, mais les données ne sont pas toutes "
        "en libre accès."
    ),
    "complexity.wind.3": "Vent soutenu : TWS {tws_range} kn sur {nm} nm",
    "complexity.wind.4": "Vent fort : TWS {tws_range} kn sur {nm} nm",
    "complexity.wind.5": "Vent très fort : TWS {tws_range} kn sur {nm} nm",
    "complexity.sea.3": "Mer agitée : Hs {hs_range} m sur {nm} nm",
    "complexity.sea.4": "Mer forte : Hs {hs_range} m sur {nm} nm",
    "complexity.sea.5": "Mer très forte : Hs {hs_range} m sur {nm} nm",
    "complexity.current": (
        "Vent contre courant : courant {current_range} kt opposé sur {nm} nm, mer hachée probable"
    ),
    "complexity.chop_short": (
        "Clapot court : Hs {hs_range} m à Tp {tp_range} s sur {nm} nm, mer désagréable"
    ),
    "complexity.chop_following": "Clapot suiveur : Hs {hs_range} m à Tp {tp_range} s sur {nm} nm",
    "sweep.widened_interval": (
        "pas d'échantillonnage élargi à {effective_h} h (au lieu de {requested_h} h) : "
        "la route compte {segments} tronçons, trop pour simuler autant de créneaux."
    ),
    "sweep.skipped_windows": (
        "{skipped} fenêtre(s) ignorée(s) faute de couverture météo (horizon dépassé) : "
        "affichage des {kept} restantes."
    ),
    "sweep.no_window_near_eta": (
        "aucune fenêtre n'arrive dans ±2h de target_eta={target_eta} ; "
        "toutes les {count} fenêtres retournées"
    ),
}


@dataclass(frozen=True, slots=True)
class Notice:
    """One warning: its code, the values that fill it, and the French sentence."""

    code: str
    params: dict[str, Any]
    message: str


def notice(code: str, **params: str | int) -> Notice:
    """Build the notice for ``code``, its sentence rendered from the template.

    Raises ``KeyError`` on a code without a template: a warning the web app
    could not translate is a bug here, not a runtime condition.
    """
    return Notice(code=code, params=dict(params), message=FR_TEMPLATES[code].format(**params))
