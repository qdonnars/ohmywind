# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""What every MCP tool call runs inside: a deadline.

Applied at registration, so no tool body has to remember it.

**A deadline.** A tool call that never ends holds an MCP session open, a
connection through the edge, and possibly a CPU slot, for a client that has
long given up. Each call gets ``tool_timeout_s`` (``OPENWIND_MCP_TOOL_TIMEOUT_S``,
90 s by default); past it the call is cancelled and the model reads an
explicit error saying what happened and what to try, instead of a transport
timeout it cannot interpret.

Cloud-agnostic: asyncio, nothing about where it runs.
"""

from __future__ import annotations

import asyncio
import functools
import logging
import os
from collections.abc import Callable, Coroutine
from typing import Any

_logger = logging.getLogger(__name__)

DEFAULT_TOOL_TIMEOUT_S = 90.0
TOOL_TIMEOUT_ENV = "OPENWIND_MCP_TOOL_TIMEOUT_S"


def tool_timeout_from_env(environ: Any = None) -> float:
    """``OPENWIND_MCP_TOOL_TIMEOUT_S`` in seconds, the default when unset or unreadable.

    ``0`` (or a negative value) disables the deadline, for a local run that
    wants to watch a long computation finish.
    """
    env = os.environ if environ is None else environ
    raw = str(env.get(TOOL_TIMEOUT_ENV, "") or "").strip()
    if not raw:
        return DEFAULT_TOOL_TIMEOUT_S
    try:
        return float(raw)
    except ValueError:
        _logger.warning("ignoring %s=%r: not a number", TOOL_TIMEOUT_ENV, raw)
        return DEFAULT_TOOL_TIMEOUT_S


class ToolTimeoutError(RuntimeError):
    """A tool call ran past its deadline and was stopped.

    FastMCP turns any exception raised in a tool into an ``isError`` result
    carrying its message, so the message is written for the model that reads
    it: what happened, that nothing is half done, and what to do next.
    """

    def __init__(self, tool: str, timeout_s: float) -> None:
        hint = (
            " For a compare-windows plan, a shorter range of departures or a larger "
            "sweep_interval_hours answers sooner."
            if tool == "plan_passage"
            else ""
        )
        super().__init__(
            f"OhMyWind stopped this {tool} call after {timeout_s:g} s without an answer: "
            "the server is busy or the weather service is slow. Nothing was computed. "
            f"Try the same call again in a minute.{hint}"
        )
        self.tool = tool
        self.timeout_s = timeout_s


ToolFn = Callable[..., Coroutine[Any, Any, Any]]


def guarded(fn: ToolFn, *, timeout_s: float) -> ToolFn:
    """``fn`` with a deadline.

    The wrapper keeps ``fn``'s name, docstring and signature
    (``functools.wraps``), which is all FastMCP reads to build the tool's
    schema: the tool a client lists is byte for byte the same.
    """
    name = fn.__name__

    @functools.wraps(fn)
    async def wrapper(*args: Any, **kwargs: Any) -> Any:
        if timeout_s <= 0:
            return await fn(*args, **kwargs)
        try:
            return await asyncio.wait_for(fn(*args, **kwargs), timeout_s)
        except TimeoutError:
            _logger.warning("mcp tool call timed out: tool=%s after=%gs", name, timeout_s)
            raise ToolTimeoutError(name, timeout_s) from None

    return wrapper
