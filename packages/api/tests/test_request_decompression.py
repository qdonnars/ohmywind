# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Quentin Donnars

"""Compressed request bodies on ``POST /api/v1/*``.

The web client's ``forecast_cache`` is the reason this exists: 48 KB of clear
JSON that gzips to 1.5 KB, uploaded from a phone on a marina 4G link before a
single byte of planning can start. Responses have been compressed since PR
0.5; this is the other direction, and it is the one with teeth, because a
request body is chosen by the caller.

Three properties, in order of how much they matter:

1. **The same bytes come back.** A gzipped body and its plain twin produce
   responses that are equal byte for byte, checked against the recorded
   golden so a divergence shows up as a contract diff rather than a nuance.
2. **The ceiling holds on what the body expands to**, not on what it declares.
   ``test_a_compression_bomb_is_refused`` posts 4 GiB of zeroes as 4 MB of
   gzip and asserts the same 413 as a plain over-sized body.
3. **A body we cannot read is refused, not guessed at.** 415 for an encoding
   we do not implement, 422 for one we do and that turns out to be corrupt.
"""

from __future__ import annotations

import gzip
import json
import logging
import re
import zlib
from datetime import UTC, datetime

import pytest
from starlette.testclient import TestClient

from openwind_api import security
from openwind_api.app import create_app
from openwind_api.settings import Settings

DEPARTURE = datetime(2026, 5, 1, 6, 0, tzinfo=UTC)
MARSEILLE = [43.29, 5.37]
PORQUEROLLES = [43.00, 6.20]


@pytest.fixture
def client():
    return TestClient(create_app(Settings()))


def _body(**extra) -> dict:
    body = {
        "waypoints": [MARSEILLE, PORQUEROLLES],
        "departure": DEPARTURE.isoformat(),
        "archetype": "cruiser_30ft",
        "efficiency": 0.75,
    }
    body.update(extra)
    return body


# 256 MiB of zeroes, 64 times the body ceiling, built a megabyte at a time so
# the test process never holds what the middleware must refuse to hold either.
# gzip tops out near 1030:1, so this is a quarter of what a body the ceiling
# accepts could carry; it is sized for a fast test, not for the worst case.
BOMB_PLAIN_BYTES = 256 * 1024 * 1024


def _gzip_zeroes(size: int) -> bytes:
    chunk = b"\0" * (1024 * 1024)
    compressor = zlib.compressobj(wbits=zlib.MAX_WBITS | 16)
    pieces = [compressor.compress(chunk) for _ in range(size // len(chunk))]
    pieces.append(compressor.flush())
    return b"".join(pieces)


@pytest.fixture(scope="module")
def bomb() -> bytes:
    return _gzip_zeroes(BOMB_PLAIN_BYTES)


def _post(client, payload: bytes, encoding: str, path: str = "/api/v1/passage"):
    return client.post(
        path,
        content=payload,
        headers={"Content-Type": "application/json", "Content-Encoding": encoding},
    )


class TestAcceptedBodies:
    def test_a_gzipped_body_is_read_like_a_plain_one(self, client) -> None:
        plain = json.dumps(_body(departure="tomorrow-ish")).encode()
        assert (
            _post(client, gzip.compress(plain), "gzip").content
            == client.post(
                "/api/v1/passage", content=plain, headers={"Content-Type": "application/json"}
            ).content
        )

    def test_the_handler_sees_the_whole_payload(self, client) -> None:
        # Not just "it parsed": a body truncated at the first chunk boundary
        # would still be valid JSON prefix-wise and fail on a later field.
        resp = _post(client, gzip.compress(json.dumps(_body(efficiency=4.0)).encode()), "gzip")
        assert resp.status_code == 422
        assert resp.json()["code"] == "invalid_efficiency"

    def test_a_body_split_across_chunks_is_reassembled(self, client) -> None:
        """Chunked upload: the transport decides where the pieces fall.

        The decompressor is fed message by message, so a stream cut in the
        middle of a deflate block is the normal case, not the exotic one.
        """
        compressed = gzip.compress(json.dumps(_body(departure="tomorrow-ish")).encode())

        def chunks():
            for i in range(0, len(compressed), 7):
                yield compressed[i : i + 7]

        resp = client.post(
            "/api/v1/passage",
            content=chunks(),
            headers={"Content-Type": "application/json", "Content-Encoding": "gzip"},
        )
        assert resp.status_code == 422
        assert "invalid departure" in resp.json()["error"]

    @pytest.mark.parametrize("encoding", ["gzip", "GZIP", " gzip ", "x-gzip"])
    def test_the_header_is_matched_case_and_space_insensitively(self, client, encoding) -> None:
        resp = _post(client, gzip.compress(b"{}"), encoding)
        assert resp.status_code == 422
        assert resp.json()["code"] == "missing_fields"

    @pytest.mark.parametrize(
        "compress",
        [
            pytest.param(zlib.compress, id="zlib-wrapped"),
            pytest.param(
                lambda raw: (lambda c: c.compress(raw) + c.flush())(
                    zlib.compressobj(wbits=-zlib.MAX_WBITS)
                ),
                id="raw",
            ),
        ],
    )
    def test_deflate_is_accepted_in_both_shapes_the_name_means(self, client, compress) -> None:
        # RFC 1950 says zlib, a long tail of clients hears RFC 1951. Both are
        # unambiguous on the wire, so both are read.
        resp = _post(client, compress(json.dumps(_body(archetype="galleon")).encode()), "deflate")
        assert resp.status_code == 422
        assert resp.json()["code"] == "unknown_archetype"

    @pytest.mark.parametrize("encoding", ["identity", ""])
    def test_an_explicit_absence_of_encoding_is_a_pass_through(self, client, encoding) -> None:
        resp = _post(client, json.dumps(_body(efficiency=4.0)).encode(), encoding)
        assert resp.status_code == 422
        assert resp.json()["code"] == "invalid_efficiency"

    def test_the_by_eta_route_takes_it_too(self, client) -> None:
        payload = {
            "waypoints": [MARSEILLE, PORQUEROLLES],
            "target_arrival": "not-a-date",
            "archetype": "cruiser_30ft",
        }
        resp = _post(
            client, gzip.compress(json.dumps(payload).encode()), "gzip", "/api/v1/passage-by-eta"
        )
        assert resp.status_code == 422
        assert resp.json()["code"] == "invalid_datetime"


class TestCeiling:
    """The ceiling is on what the body expands to, and it holds early."""

    def test_a_compression_bomb_is_refused(self, client, bomb) -> None:
        """256 MiB of zeroes in 255 KB of gzip: the reason this is streamed.

        The declared length is a fraction of the body ceiling, so the outer
        middleware waves it through and would be right to. What refuses it is
        the budget handed to ``decompress(max_length=...)``, which never lets
        zlib allocate more than one byte past the ceiling.
        """
        assert len(bomb) < security.MAX_BODY_BYTES
        resp = _post(client, bomb, "gzip")
        assert resp.status_code == 413
        assert resp.json() == {
            "error": "request body too large (max 4 MB)",
            "code": "body_too_large",
        }

    def test_the_budget_handed_to_zlib_never_exceeds_the_ceiling(self, monkeypatch, bomb) -> None:
        """The property behind the previous test, read off the call itself.

        "Refused with a 413" would also be true of an implementation that
        inflated the whole 256 MiB first and measured afterwards, which is the
        failure this guards: what is asserted is that zlib is never allowed to
        produce more than one byte past the budget in a single call.
        """
        budgets: list[int] = []
        original = zlib.decompressobj

        class _Watched:
            """Everything the middleware reads, plus a note of every budget."""

            def __init__(self, inner):
                self._inner = inner

            def decompress(self, data, max_length=0):
                budgets.append(max_length)
                return self._inner.decompress(data, max_length=max_length)

            def __getattr__(self, name):
                return getattr(self._inner, name)

        monkeypatch.setattr(zlib, "decompressobj", lambda *a, **k: _Watched(original(*a, **k)))
        client = TestClient(create_app(Settings()))
        resp = _post(client, bomb, "gzip")

        assert resp.status_code == 413
        assert budgets, "the decompressor was never exercised"
        assert max(budgets) <= security.MAX_BODY_BYTES + 1

    def test_a_body_that_expands_to_exactly_the_ceiling_is_accepted(self, monkeypatch) -> None:
        # The boundary belongs to the caller: the ceiling is what a body may
        # be, not what it must stay under.
        monkeypatch.setattr(
            security.RequestDecompressionMiddleware,
            "__init__",
            _init_with(max_bytes=512),
        )
        client = TestClient(create_app(Settings()))
        filler = "a" * (512 - len('{"filler":""}'))
        resp = _post(client, gzip.compress(f'{{"filler":"{filler}"}}'.encode()), "gzip")
        assert resp.status_code == 422
        assert resp.json()["code"] == "missing_fields"

    def test_one_byte_past_the_ceiling_is_refused(self, monkeypatch) -> None:
        monkeypatch.setattr(
            security.RequestDecompressionMiddleware,
            "__init__",
            _init_with(max_bytes=512),
        )
        client = TestClient(create_app(Settings()))
        filler = "a" * (513 - len('{"filler":""}'))
        resp = _post(client, gzip.compress(f'{{"filler":"{filler}"}}'.encode()), "gzip")
        assert resp.status_code == 413

    def test_the_compressed_bytes_are_still_capped_by_the_outer_ceiling(self, client) -> None:
        # Incompressible payload, so the compressed body itself is over the
        # ceiling: the answer must come from BodySizeLimitMiddleware without
        # a decompressor ever being built.
        oversized = gzip.compress(b"x" * (security.MAX_BODY_BYTES + 1), compresslevel=0)
        assert len(oversized) > security.MAX_BODY_BYTES
        resp = _post(client, oversized, "gzip")
        assert resp.status_code == 413


class TestRefusedEncodings:
    @pytest.mark.parametrize("encoding", ["br", "zstd", "compress", "gzip, gzip", "utf-8"])
    def test_an_encoding_we_cannot_decode_is_a_415(self, client, encoding) -> None:
        resp = _post(client, b"whatever", encoding)
        assert resp.status_code == 415
        assert resp.json() == {
            "error": "unsupported content encoding",
            "code": "unsupported_encoding",
        }

    def test_the_415_says_what_would_have_worked(self, client) -> None:
        resp = _post(client, b"whatever", "br")
        assert "gzip" in resp.headers["accept-encoding"]

    @pytest.mark.parametrize(
        "payload",
        [
            pytest.param(b"not gzip at all", id="not-compressed"),
            pytest.param(gzip.compress(b'{"a": 1}')[:20], id="truncated"),
            pytest.param(gzip.compress(b'{"a": 1}')[:-1], id="missing-trailer"),
            pytest.param(gzip.compress(b'{"a": 1}') + b"junk", id="trailing-junk"),
            pytest.param(b"", id="empty"),
        ],
    )
    def test_a_body_that_is_not_what_it_claims_is_a_422(self, client, payload) -> None:
        resp = _post(client, payload, "gzip")
        assert resp.status_code == 422
        assert resp.json() == {"error": "invalid gzip body", "code": "invalid_body_encoding"}

    def test_a_corrupt_deflate_body_names_deflate(self, client) -> None:
        resp = _post(client, b"\x78\x9c" + b"\xff" * 40, "deflate")
        assert resp.status_code == 422
        assert resp.json() == {"error": "invalid deflate body", "code": "invalid_body_encoding"}

    def test_a_refusal_still_counts_against_the_rate_limit(self, monkeypatch) -> None:
        # Decompression is inside the limiter: shovelling bombs is not a way
        # to spend our CPU for free.
        original = security.RateLimitMiddleware.__init__

        def _one(self, app, **kwargs):
            original(self, app, **{**kwargs, "max_requests": 1})

        monkeypatch.setattr(security.RateLimitMiddleware, "__init__", _one)
        client = TestClient(create_app(Settings()))
        assert _post(client, b"not gzip at all", "gzip").status_code == 422
        assert _post(client, gzip.compress(b"{}"), "gzip").status_code == 429


class TestScope:
    def test_a_get_is_never_touched(self, client) -> None:
        # No body to decode, and a Content-Encoding on a GET describes
        # nothing. It must not turn a working request into a 415.
        resp = client.get("/api/v1/archetypes", headers={"Content-Encoding": "br"})
        assert resp.status_code == 200

    def test_the_mcp_transport_is_left_alone(self) -> None:
        """It frames its own bodies, and it is not under ``/api/v1``."""
        seen: dict[str, object] = {}

        async def _echo(scope, receive, send):
            message = await receive()
            seen["body"] = message.get("body", b"")
            seen["headers"] = dict(scope["headers"])
            from starlette.responses import PlainTextResponse

            await PlainTextResponse("ok")(scope, receive, send)

        client = TestClient(security.RequestDecompressionMiddleware(_echo))
        payload = gzip.compress(b'{"a": 1}')
        resp = client.post("/mcp", content=payload, headers={"Content-Encoding": "gzip"})
        assert resp.status_code == 200
        assert seen["body"] == payload

    def test_the_handler_sees_the_decompressed_length(self) -> None:
        """A stale, compressed Content-Length would misinform anything downstream."""
        seen: dict[str, object] = {}

        async def _echo(scope, receive, send):
            body = b""
            more = True
            while more:
                message = await receive()
                body += message.get("body", b"")
                more = message.get("more_body", False)
            seen["body"] = body
            seen["headers"] = {k.decode(): v.decode() for k, v in scope["headers"]}
            from starlette.responses import PlainTextResponse

            await PlainTextResponse("ok")(scope, receive, send)

        client = TestClient(security.RequestDecompressionMiddleware(_echo))
        plain = b'{"waypoints": []}'
        client.post(
            "/api/v1/passage",
            content=gzip.compress(plain),
            headers={"Content-Encoding": "gzip"},
        )
        assert seen["body"] == plain
        headers = seen["headers"]
        assert headers["content-length"] == str(len(plain))  # type: ignore[index]
        assert "content-encoding" not in headers  # type: ignore[operator]


class TestAccessLog:
    def test_a_compressed_request_is_logged_as_one(self, client, caplog) -> None:
        caplog.set_level(logging.INFO, logger="openwind_api.access")
        _post(client, gzip.compress(b"{}"), "gzip")
        line = [r.getMessage() for r in caplog.records if r.name == "openwind_api.access"][-1]
        assert " enc=gzip" in line

    def test_a_refused_encoding_is_logged_with_its_name(self, client, caplog) -> None:
        caplog.set_level(logging.INFO, logger="openwind_api.access")
        _post(client, b"whatever", "br")
        line = [r.getMessage() for r in caplog.records if r.name == "openwind_api.access"][-1]
        assert " enc=br" in line
        assert " status=415 " in line

    def test_a_plain_request_logs_the_line_it_always_logged(self, client, caplog) -> None:
        # The field is absent, not "-": every existing line keeps its shape.
        caplog.set_level(logging.INFO, logger="openwind_api.access")
        client.get("/api/v1/archetypes")
        line = [r.getMessage() for r in caplog.records if r.name == "openwind_api.access"][-1]
        assert "enc=" not in line
        assert re.search(r"bucket=[0-9a-f]{8}$", line)


def _init_with(**overrides):
    original = security.RequestDecompressionMiddleware.__init__

    def _init(self, app, **kwargs):
        kwargs.update(overrides)
        original(self, app, **kwargs)

    return _init
