# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""One stand-in request for the handler-level tests.

Six test modules had written the same three-line class, and PR 2.3 gave the
passage handlers a second thing to read off the request (the process-wide
marine adapter, on ``app.state.services``), which would have meant editing the
same three lines six times. One copy, so the next field costs one edit.

Deliberately not a Starlette ``Request``: these tests call the handler
directly, with no app and no transport, precisely to keep the assertion on the
handler rather than on the middleware stack. The routes' behaviour through the
real stack is covered by the goldens and by ``test_api_limits``.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

from openwind_data.testing import DeterministicMarineAdapter


class FakeRequest:
    """A JSON body, the services a handler resolves its adapter from, a scope.

    ``body`` may be an ``Exception``, which ``json()`` then raises: that is how
    a malformed payload is simulated, since Starlette surfaces a decode
    failure the same way.

    The default adapter is the deterministic stub rather than a live one, so a
    test that reaches the engine by accident fails on an assertion rather than
    on a network call.

    ``scope`` is where the handler tells the access log which door the request
    came through; see ``_note_forecast_cache``. The point of having one class
    was that the next field would cost one edit, and this is the next field.
    """

    def __init__(self, body: Any, *, marine: Any = None) -> None:
        self._body = body
        self.app = SimpleNamespace(
            state=SimpleNamespace(
                services=SimpleNamespace(marine=marine or DeterministicMarineAdapter())
            )
        )
        self.scope: dict = {}

    async def json(self) -> Any:
        if isinstance(self._body, Exception):
            raise self._body
        return self._body
