# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Feedback tool: lets a calling LLM log a structured note about a tool
interaction (an unclear parameter, missing data, a wrong-feeling result,
a feature request).

Cloud-agnostic by construction. The persistence target is injected as a
``FeedbackSink`` callable; ``mcp-core`` never imports ``huggingface_hub``.
The HF Spaces wrapper plugs in a ``CommitScheduler``-backed sink that
appends to a private dataset repo (see ``packages/hf-space/app.py``).

Local dev with no sink wired falls back to ``_stderr_sink``, which logs
the entry via the standard ``logging`` module — handy for inspecting
the payload shape during development without setting up a dataset.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Any, Literal, Protocol

logger = logging.getLogger(__name__)


FeedbackCategory = Literal[
    "unclear_param",
    "missing_data",
    "wrong_result",
    "feature_request",
    "other",
]
FeedbackToolName = Literal[
    "plan_passage",
    "get_marine_forecast",
    "list_boat_archetypes",
    "read_me",
    "feedback",
    "general",
]
FeedbackSeverity = Literal["low", "medium", "high"]

_MAX_MESSAGE_CHARS = 2000
_MAX_CONTEXT_CHARS = 4000


class FeedbackSink(Protocol):
    """Persists a feedback entry. MUST NOT raise — wrap your I/O.

    Implementations are expected to be cheap and non-blocking; the HF
    sink uses a ``CommitScheduler`` background thread so the tool call
    returns immediately even when the dataset push is in flight.
    """

    def __call__(self, entry: dict[str, Any]) -> None: ...


def stderr_sink(entry: dict[str, Any]) -> None:
    """Default sink: log to stderr at INFO level."""
    logger.info("ohmywind.feedback %s", entry)


def build_feedback_entry(
    *,
    category: str,
    tool_name: str,
    severity: str,
    message: str,
    context_json: dict[str, Any] | None = None,
    client_hint: str | None = None,
) -> dict[str, Any]:
    """Normalize a feedback payload into the JSONL row shape.

    Truncates ``message`` and a JSON-serialised ``context_json`` so a
    runaway LLM cannot blow up the dataset row size.
    """
    if len(message) > _MAX_MESSAGE_CHARS:
        message = message[:_MAX_MESSAGE_CHARS] + " ...[truncated]"
    ctx = context_json
    if ctx is not None:
        import json as _json

        try:
            serialised = _json.dumps(ctx, ensure_ascii=False, default=str)
        except Exception:
            serialised = str(ctx)
        if len(serialised) > _MAX_CONTEXT_CHARS:
            ctx = {"_truncated": True, "preview": serialised[:_MAX_CONTEXT_CHARS]}
    return {
        "feedback_id": uuid.uuid4().hex,
        "received_at": datetime.now(UTC).isoformat(),
        "category": category,
        "tool_name": tool_name,
        "severity": severity,
        "message": message,
        "context_json": ctx,
        "client_hint": client_hint,
    }
