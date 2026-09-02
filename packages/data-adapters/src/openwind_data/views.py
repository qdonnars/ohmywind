# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""JSON-ready views of a passage, shared by the REST shell and the MCP shell.

Both shells answer the same question and both used to answer it with their own
serialiser: ``_to_json`` and an inline window loop in ``hf-space/app.py``,
``_passage_to_dict`` and ``_build_window_dict`` in ``mcp-core/server.py``. The
two had already drifted in small ways, which is what the 2026-09 audit filed
as M3, and drift here is invisible: nothing fails, the web app and the LLM
simply stop describing the same sailing.

The functions below are pure and produce plain dicts. **Key order is part of
the contract** and reproduced deliberately: the sweep table renders
``windows[]`` in the order it arrives, and the goldens in
``hf-space/tests/goldens`` and ``mcp-core/tests/goldens`` compare bytes.

Each shell keeps the fields only it has, and adds them *after* the shared ones
so the recorded order survives:

- REST adds ``forecast_updated_at`` to every envelope, ``passage`` and
  ``complexity_full`` to every sweep window, and ``eta`` on the by-ETA route;
- MCP adds ``openwind_url`` and ``disclaimer``.

Nothing here knows about HTTP, about MCP, or about the clock.
"""

from __future__ import annotations

import dataclasses
from datetime import UTC, datetime, timedelta
from typing import Any

from openwind_data.routing.passage import build_conditions_summary

# How far a window's arrival may sit from a requested ``target_eta`` and still
# be kept. Two hours is generous on purpose: the caller is picking a departure
# slot, not catching a train, and a tighter filter on a single-pass timing
# estimate would advertise a precision the engine does not have.
TARGET_ETA_TOLERANCE = timedelta(hours=2)


def to_json(obj: Any) -> Any:
    """Recursively convert dataclasses and datetimes to JSON-serializable types.

    Preferred over ``dataclasses.asdict`` (which the MCP shell used) because it
    also resolves datetimes wherever they appear, rather than requiring the
    caller to know which fields hold one. Field order is declaration order in
    both cases, so the two produce the same document.
    """
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        return {f.name: to_json(getattr(obj, f.name)) for f in dataclasses.fields(obj)}
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, (tuple, list)):
        return [to_json(v) for v in obj]
    return obj


def passage_view(report: Any) -> dict[str, Any]:
    """The full per-segment timing report: distances, times, wind, sea, motor."""
    return to_json(report)


def complexity_view(score: Any) -> dict[str, Any]:
    """The full 1-5 score: wind and sea breakdown, rationale, warnings."""
    return to_json(score)


def passage_envelope(report: Any, score: Any) -> dict[str, Any]:
    """A single passage and its score, the two keys both shells start from."""
    return {
        "passage": passage_view(report),
        "complexity": complexity_view(score),
    }


def window_view(report: Any, score: Any) -> dict[str, Any]:
    """One row of a sweep: enough to render a comparison table, no more.

    The caller appends what only it can build. The compact ``complexity``
    summary here is deliberately not ``complexity_view``: a sweep of 336
    windows carrying a full score each is megabytes, and the table renders
    four fields.
    """
    return {
        "departure": report.departure_time.isoformat(),
        "arrival": report.arrival_time.isoformat(),
        "duration_h": round(report.duration_h, 2),
        "distance_nm": round(report.distance_nm, 1),
        "complexity": {
            "level": score.level,
            "label": score.label,
            "tws_max_kn": round(score.tws_max_kn, 1),
            "rationale": score.rationale,
        },
        "conditions_summary": build_conditions_summary(report),
        "warnings": list(report.warnings) + [w.message for w in score.warnings],
    }


def sweep_view(
    *,
    earliest: datetime,
    latest: datetime,
    interval_hours: int,
    windows: list[dict[str, Any]],
    meta_warnings: list[str],
) -> dict[str, Any]:
    """The compare-windows envelope.

    ``window_count`` counts what is actually returned, so it reflects the
    ``target_eta`` filter: call this after filtering, never before.
    """
    return {
        "mode": "multi_window",
        "sweep": {
            "earliest": earliest.isoformat(),
            "latest": latest.isoformat(),
            "interval_hours": interval_hours,
            "window_count": len(windows),
        },
        "windows": windows,
        "meta_warnings": meta_warnings,
    }


def widened_interval_warning(
    effective_interval_h: int, requested_interval_h: int, n_segments: int
) -> str:
    """Say that the sweep ran coarser than asked, and why.

    The engine widens the spacing rather than refusing when windows times
    segments would blow the simulation budget. Silently returning half the
    windows would read as a forecast that ran out.
    """
    return (
        f"pas d'échantillonnage élargi à {effective_interval_h} h "
        f"(au lieu de {requested_interval_h} h) : la route compte "
        f"{n_segments} tronçons, trop pour simuler "
        f"autant de créneaux."
    )


def skipped_windows_warning(skipped_count: int, kept_count: int) -> str:
    """Say that some windows fell past the forecast horizon."""
    return (
        f"{skipped_count} fenêtre(s) ignorée(s) faute de couverture météo "
        f"(horizon dépassé) : affichage des {kept_count} restantes."
    )


def filter_windows_by_target_eta(
    windows: list[dict[str, Any]], target_eta: datetime, target_eta_label: str
) -> tuple[list[dict[str, Any]], str | None]:
    """Keep the windows arriving within tolerance of ``target_eta``.

    Returns the windows to serve and a warning to append, or ``None``. When
    nothing matches the whole set comes back rather than an empty answer: the
    caller asked to be home by a given hour and the useful reply is "not on
    this forecast, here is what there is", not silence.

    ``target_eta_label`` is echoed verbatim into that warning, so the user
    reads back the string they sent rather than a normalised rewrite of it.
    """
    target_utc = target_eta.astimezone(UTC)
    tolerance_s = TARGET_ETA_TOLERANCE.total_seconds()
    filtered = [
        w
        for w in windows
        if abs((datetime.fromisoformat(w["arrival"]) - target_utc).total_seconds()) <= tolerance_s
    ]
    if not filtered:
        return windows, (
            f"aucune fenêtre n'arrive dans ±2h de target_eta={target_eta_label} ; "
            f"toutes les {len(windows)} fenêtres retournées"
        )
    return filtered, None
