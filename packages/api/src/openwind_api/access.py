# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""One log line per request, and an id to follow it by.

Until now the deployment logged nothing of its own. uvicorn printed a method,
a path and a status; there was no duration, no response size, no way to tell a
plan served from the browser's own sampling apart from one that went upstream,
and no identifier a user could quote when reporting that "the plan failed
around eleven". The 2026-09 audit filed that as Mo1, and it is the reason
several of its own findings had to be measured by reading the source rather
than by reading production.

## Format

logfmt: ``key=value`` pairs, space separated, values quoted only when they
need it. One format, chosen once, and the reasons are worth writing down
because the obvious alternative is JSON:

- the logs are read in Hugging Face's plain-text web console, where a JSON
  line wraps into an unreadable block and a logfmt line stays one line;
- there is no log collector to parse JSON *for* anyone, so the audience is a
  human with a browser and, at best, ``grep``;
- every value here is a scalar, so JSON's one real advantage (structure) buys
  nothing.

If a collector ever appears, this is the single place to change.

## Fields

``id`` request id, echoed in the ``X-Request-Id`` response header.
``method`` ``path`` what was asked.
``status`` what was answered, including a 429 from the limiter or a 413 from
    the body ceiling: this middleware is the outermost one, so it sees the
    real answer rather than the one the handler would have given.
``dur_ms`` wall time for the whole stack, compression included.
``bytes`` response body bytes as they went on the wire, so *after* gzip.
``cache`` whether the request carried a ``forecast_cache``, i.e. whether the
    browser sampled the corridor itself. The single most useful field here:
    it separates the requests that cost us an upstream fan-out from the ones
    that cost us only CPU.
``bucket`` the rate-limit bucket's fingerprint, ``sha256(ip)[:8]``.

## Addresses

Never logged. Not the client address, not ``X-Forwarded-For``, not a
"truncated" address. ``bucket`` is a one-way hash and is enough for the
question these logs exist to answer (is one caller responsible for this
traffic?), while an address in a log file is personal data we would then have
to hold, protect and expire. The privacy policy says the deployment keeps no
identifying logs; this module is where that stays true.
"""

from __future__ import annotations

import logging
import re
import secrets
import time

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from openwind_api.security import bucket_id

_logger = logging.getLogger("openwind_api.access")

REQUEST_ID_HEADER = "x-request-id"

# A caller-supplied id is untrusted text on its way into a log line. Anything
# outside this alphabet, or longer than this, gets a generated id instead:
# a newline in the middle of a request id forges log entries, and that is a
# real technique, not a theoretical one.
_SAFE_REQUEST_ID = re.compile(r"^[A-Za-z0-9._:-]{1,64}$")

# logfmt needs quoting only when a value could break the "key=value key=value"
# reading. Paths are the realistic source of one.
_NEEDS_QUOTING = re.compile(r'[\s"=]')


def _field(value: object) -> str:
    text = str(value)
    if not text:
        return '""'
    if _NEEDS_QUOTING.search(text):
        return '"' + text.replace("\\", "\\\\").replace('"', '\\"') + '"'
    return text


def request_id_of(scope: Scope) -> str:
    """This request's id: the caller's if it is safe to echo, else a fresh one.

    Honouring the caller's id is what lets the edge proxy, the web app and the
    Space agree on one identifier for one user action. Sixteen hex characters
    when we generate it: enough that two ids never collide inside a log
    window, short enough to read aloud over the phone.
    """
    for name, value in scope.get("headers", ()):
        if name == REQUEST_ID_HEADER.encode():
            candidate = value.decode("latin-1")
            if _SAFE_REQUEST_ID.match(candidate):
                return candidate
            break
    return secrets.token_hex(8)


class AccessLogMiddleware:
    """Time every request, log one line, and stamp it with its id.

    Outermost in the stack on purpose: it must see the status the client
    actually receives (a 429 never reaches a handler) and the bytes that
    actually leave (compression happens inside it).

    The id is written onto ``scope["state"]`` as well as onto the response, so
    a handler can put it in an error body or carry it into its own logging
    without re-reading a header.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = request_id_of(scope)
        state = scope.setdefault("state", {})
        state["request_id"] = request_id

        started = time.perf_counter()
        status = 0
        body_bytes = 0

        async def send_wrapper(message: Message) -> None:
            nonlocal status, body_bytes
            if message["type"] == "http.response.start":
                status = message["status"]
                MutableHeaders(scope=message)[REQUEST_ID_HEADER] = request_id
            elif message["type"] == "http.response.body":
                body_bytes += len(message.get("body", b""))
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except BaseException:
            # A handler that raised still gets a line, with the 500 the server
            # is about to send. Losing the slow, failing requests is losing
            # exactly the ones worth seeing.
            self._log(scope, request_id, 500, started, body_bytes)
            raise
        self._log(scope, request_id, status, started, body_bytes)

    def _log(
        self, scope: Scope, request_id: str, status: int, started: float, body_bytes: int
    ) -> None:
        duration_ms = (time.perf_counter() - started) * 1000
        cached = scope.get("state", {}).get("forecast_cache")
        _logger.info(
            "id=%s method=%s path=%s status=%d dur_ms=%.1f bytes=%d cache=%s bucket=%s",
            _field(request_id),
            _field(scope.get("method", "-")),
            _field(scope.get("path", "-")),
            status,
            duration_ms,
            body_bytes,
            "-" if cached is None else ("yes" if cached else "no"),
            _field(bucket_id(scope)),
        )
