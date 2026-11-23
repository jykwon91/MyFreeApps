"""Tests for ``platform_shared.core.capped_fetch.fetch_capped``.

A real ``httpx.AsyncClient`` over ``httpx.MockTransport``, so streaming,
redirects and timeouts run through httpx itself. Targets are literal public
IPs, so the real SSRF guard runs with no DNS lookup.
"""
from __future__ import annotations

import asyncio
import gzip
import logging
import tracemalloc
import zlib
from collections.abc import AsyncIterator, Callable

import httpx
import pytest

from platform_shared.core.capped_fetch import fetch_capped
from platform_shared.core.capped_fetch_error import CappedFetchError
from platform_shared.core.capped_response import CappedResponse
from platform_shared.core.url_safety import UnsafeURLError
from platform_shared.testing.streamed_response import streamed_response

_URL = "http://8.8.8.8/feed.ics?token=secret-token-value"


class _Recorder:
    """A MockTransport handler that records every URL it was asked for."""

    def __init__(self, respond: Callable[[httpx.Request], httpx.Response]) -> None:
        self._respond = respond
        self.urls: list[str] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.urls.append(str(request.url))
        return self._respond(request)


def _client(handler: _Recorder) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def _endless(chunk: bytes, *, pause: float = 0.0) -> AsyncIterator[bytes]:
    while True:
        if pause:
            await asyncio.sleep(pause)
        yield chunk


async def _fetch(handler: _Recorder, *, max_redirects: int = 5) -> CappedResponse:
    async with _client(handler) as client:
        return await fetch_capped(
            client,
            _URL,
            max_bytes=1_000,
            total_timeout_seconds=2.0,
            max_redirects=max_redirects,
        )


class TestSuccess:
    async def test_returns_body_and_decodes_text(self) -> None:
        handler = _Recorder(
            lambda r: streamed_response(
                200,
                content="café".encode("latin-1"),
                headers={"content-type": "text/plain; charset=latin-1"},
            )
        )
        async with _client(handler) as client:
            result = await fetch_capped(
                client, _URL, max_bytes=100, total_timeout_seconds=2.0,
            )
        assert result.content == "café".encode("latin-1")
        assert result.text == "café"
        assert result.status_code == 200
        assert result.truncated is False
        assert result.url == _URL

    @pytest.mark.parametrize("charset", ["idna", "rot13", "base64", "undefined"])
    async def test_charset_that_cannot_decode_text_falls_back_to_utf8(
        self, charset: str,
    ) -> None:
        handler = _Recorder(
            lambda r: streamed_response(
                200,
                content="café".encode("utf-8"),
                headers={"content-type": f"text/html; charset={charset}"},
            )
        )
        async with _client(handler) as client:
            result = await fetch_capped(client, _URL, max_bytes=100, total_timeout_seconds=2.0)
        assert result.text == "café"

    async def test_body_exactly_at_cap_is_accepted(self) -> None:
        handler = _Recorder(lambda r: streamed_response(200, content=b"x" * 10))
        async with _client(handler) as client:
            result = await fetch_capped(client, _URL, max_bytes=10, total_timeout_seconds=2.0)
        assert result.content == b"x" * 10

    async def test_follows_a_redirect_and_reports_final_url(self) -> None:
        def respond(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/feed.ics":
                return httpx.Response(302, headers={"location": "/moved.ics"})
            return streamed_response(200, content=b"ok")

        handler = _Recorder(respond)
        async with _client(handler) as client:
            result = await fetch_capped(client, _URL, max_bytes=10, total_timeout_seconds=2.0)
        assert result.content == b"ok"
        assert result.url == "http://8.8.8.8/moved.ics"
        assert len(handler.urls) == 2


class TestSizeCap:
    async def test_endless_body_stops_at_the_cap(self) -> None:
        # An endless body would never finish if it were buffered first. The
        # read must stop as soon as the count passes the cap.
        handler = _Recorder(lambda r: httpx.Response(200, content=_endless(b"x" * 64)))
        async with _client(handler) as client:
            with pytest.raises(CappedFetchError) as exc_info:
                await fetch_capped(client, _URL, max_bytes=1_000, total_timeout_seconds=5.0)
        assert exc_info.value.reason == "too_large"
        assert exc_info.value.host == "8.8.8.8"

    async def test_truncate_mode_returns_the_first_bytes(self) -> None:
        handler = _Recorder(lambda r: httpx.Response(200, content=_endless(b"ab")))
        async with _client(handler) as client:
            result = await fetch_capped(
                client, _URL, max_bytes=5, total_timeout_seconds=5.0, truncate_at_cap=True,
            )
        assert result.content == b"ababa"
        assert result.truncated is True


class TestOverallDeadline:
    async def test_slow_drip_body_hits_the_overall_deadline(self) -> None:
        # Each chunk arrives well inside any per-read timeout; only an overall
        # deadline stops it.
        handler = _Recorder(
            lambda r: httpx.Response(200, content=_endless(b"x", pause=0.05))
        )
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler), timeout=httpx.Timeout(10.0),
        ) as client:
            loop = asyncio.get_running_loop()
            started = loop.time()
            with pytest.raises(CappedFetchError) as exc_info:
                await fetch_capped(
                    client, _URL, max_bytes=1_000_000, total_timeout_seconds=0.3,
                )
            elapsed = loop.time() - started
        assert exc_info.value.reason == "timeout"
        assert elapsed < 2.0

    async def test_httpx_phase_timeout_is_reported_as_timeout(self) -> None:
        def respond(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectTimeout("connect timed out", request=request)

        with pytest.raises(CappedFetchError) as exc_info:
            await _fetch(_Recorder(respond))
        assert exc_info.value.reason == "timeout"


class _TrackedStream(httpx.AsyncByteStream):
    """An endless, slow body that records whether it was closed."""

    def __init__(self) -> None:
        self.closed = False

    async def __aiter__(self) -> AsyncIterator[bytes]:
        while True:
            await asyncio.sleep(0.05)
            yield b"x"

    async def aclose(self) -> None:
        self.closed = True


class _UnreadableStream(httpx.AsyncByteStream):
    """A body that fails the test if anything reads it."""

    async def __aiter__(self) -> AsyncIterator[bytes]:
        raise AssertionError("the body must not be read")
        yield b""  # pragma: no cover - makes this an async generator

    async def aclose(self) -> None:
        return None


def _deflate(data: bytes, wbits: int) -> bytes:
    compressor = zlib.compressobj(wbits=wbits)
    return compressor.compress(data) + compressor.flush()


class TestStreamCleanup:
    async def test_stream_is_closed_when_the_deadline_cancels_mid_body(self) -> None:
        stream = _TrackedStream()
        handler = _Recorder(lambda r: httpx.Response(200, stream=stream))
        async with _client(handler) as client:
            with pytest.raises(CappedFetchError) as exc_info:
                await fetch_capped(client, _URL, max_bytes=1_000, total_timeout_seconds=0.2)
        assert exc_info.value.reason == "timeout"
        assert stream.closed is True


class TestContentEncoding:
    @pytest.mark.parametrize(
        ("coding", "encoded"),
        [
            ("gzip", gzip.compress(b"hello " * 50)),
            ("x-gzip", gzip.compress(b"hello " * 50)),
            ("deflate", _deflate(b"hello " * 50, zlib.MAX_WBITS)),  # zlib-framed
            ("deflate", _deflate(b"hello " * 50, -zlib.MAX_WBITS)),  # raw deflate
            ("identity", b"hello " * 50),
        ],
    )
    async def test_supported_codings_decode(self, coding: str, encoded: bytes) -> None:
        handler = _Recorder(
            lambda r: streamed_response(200, content=encoded, headers={"content-encoding": coding})
        )
        async with _client(handler) as client:
            result = await fetch_capped(client, _URL, max_bytes=1_000, total_timeout_seconds=2.0)
        assert result.content == b"hello " * 50

    async def test_gzip_bomb_stops_at_the_decoded_cap(self) -> None:
        # 50 MB of zeros compresses to about 50 KB. httpx's own decoder would
        # inflate a whole raw chunk before any cap check.
        bomb = gzip.compress(b"\0" * 50_000_000)
        handler = _Recorder(
            lambda r: streamed_response(200, content=bomb, headers={"content-encoding": "gzip"})
        )
        tracemalloc.start()
        try:
            async with _client(handler) as client:
                with pytest.raises(CappedFetchError) as exc_info:
                    await fetch_capped(client, _URL, max_bytes=100_000, total_timeout_seconds=5.0)
            _, peak = tracemalloc.get_traced_memory()
        finally:
            tracemalloc.stop()
        assert exc_info.value.reason == "too_large"
        # Inflating the whole chunk would peak at 50 MB or more.
        assert peak < 5_000_000

    async def test_gzip_bomb_in_truncate_mode_returns_only_the_cap(self) -> None:
        bomb = gzip.compress(b"\0" * 50_000_000)
        handler = _Recorder(
            lambda r: streamed_response(200, content=bomb, headers={"content-encoding": "gzip"})
        )
        async with _client(handler) as client:
            result = await fetch_capped(
                client, _URL, max_bytes=1_000, total_timeout_seconds=5.0, truncate_at_cap=True,
            )
        assert result.content == b"\0" * 1_000
        assert result.truncated is True

    @pytest.mark.parametrize("coding", ["gzip, gzip", "gzip,deflate", "deflate, identity"])
    async def test_stacked_codings_are_refused(self, coding: str) -> None:
        handler = _Recorder(
            lambda r: httpx.Response(
                200, stream=_UnreadableStream(), headers={"content-encoding": coding},
            )
        )
        async with _client(handler) as client:
            with pytest.raises(CappedFetchError) as exc_info:
                await fetch_capped(client, _URL, max_bytes=1_000, total_timeout_seconds=2.0)
        assert exc_info.value.reason == "bad_encoding"

    @pytest.mark.parametrize("coding", ["br", "zstd", "compress", "made-up"])
    async def test_unknown_codings_are_refused(self, coding: str) -> None:
        handler = _Recorder(
            lambda r: httpx.Response(
                200, stream=_UnreadableStream(), headers={"content-encoding": coding},
            )
        )
        async with _client(handler) as client:
            with pytest.raises(CappedFetchError) as exc_info:
                await fetch_capped(client, _URL, max_bytes=1_000, total_timeout_seconds=2.0)
        assert exc_info.value.reason == "bad_encoding"

    async def test_corrupt_gzip_is_bad_encoding(self) -> None:
        handler = _Recorder(
            lambda r: streamed_response(
                200, content=b"not gzip at all", headers={"content-encoding": "gzip"},
            )
        )
        with pytest.raises(CappedFetchError) as exc_info:
            await _fetch(handler)
        assert exc_info.value.reason == "bad_encoding"

    async def test_only_decodable_codings_are_offered(self) -> None:
        seen: list[str] = []

        def respond(request: httpx.Request) -> httpx.Response:
            seen.append(request.headers.get("accept-encoding", ""))
            return streamed_response(200, content=b"ok")

        handler = _Recorder(respond)
        async with _client(handler) as client:
            await fetch_capped(
                client, _URL, max_bytes=10, total_timeout_seconds=2.0,
                headers={"Accept-Encoding": "br, zstd"},
            )
        assert seen == ["gzip, deflate"]


class TestContentTypeCheck:
    async def test_refused_content_type_is_never_read(self) -> None:
        handler = _Recorder(
            lambda r: httpx.Response(
                200, stream=_UnreadableStream(), headers={"content-type": "application/json"},
            )
        )
        async with _client(handler) as client:
            with pytest.raises(CappedFetchError) as exc_info:
                await fetch_capped(
                    client, _URL, max_bytes=1_000, total_timeout_seconds=2.0,
                    accept_content_type=lambda value: "html" in value,
                )
        assert exc_info.value.reason == "unexpected_content_type"

    async def test_accepted_content_type_is_read(self) -> None:
        handler = _Recorder(
            lambda r: streamed_response(
                200, content=b"<html>", headers={"content-type": "text/html; charset=utf-8"},
            )
        )
        async with _client(handler) as client:
            result = await fetch_capped(
                client, _URL, max_bytes=1_000, total_timeout_seconds=2.0,
                accept_content_type=lambda value: "html" in value,
            )
        assert result.content == b"<html>"


class TestFailures:
    @pytest.mark.parametrize("status", [401, 403, 404, 500, 503])
    async def test_non_2xx_raises_with_status(self, status: int) -> None:
        with pytest.raises(CappedFetchError) as exc_info:
            await _fetch(_Recorder(lambda r: httpx.Response(status)))
        assert exc_info.value.reason == "http_status"
        assert exc_info.value.status_code == status

    async def test_network_error(self) -> None:
        def respond(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("refused", request=request)

        with pytest.raises(CappedFetchError) as exc_info:
            await _fetch(_Recorder(respond))
        assert exc_info.value.reason == "network"

    async def test_redirect_loop_trips_the_cap(self) -> None:
        handler = _Recorder(
            lambda r: httpx.Response(302, headers={"location": "http://8.8.8.8/next"})
        )
        with pytest.raises(CappedFetchError) as exc_info:
            await _fetch(handler, max_redirects=3)
        assert exc_info.value.reason == "too_many_redirects"
        assert len(handler.urls) == 4

    async def test_redirect_without_location_is_final(self) -> None:
        with pytest.raises(CappedFetchError) as exc_info:
            await _fetch(_Recorder(lambda r: httpx.Response(302)))
        assert exc_info.value.reason == "http_status"
        assert exc_info.value.status_code == 302


class TestSSRF:
    @pytest.mark.parametrize(
        "url",
        [
            "http://127.0.0.1/internal",
            "http://169.254.169.254/latest/meta-data/",
            "file:///etc/passwd",
            "http://8.8.8.8:9000/service",
        ],
    )
    async def test_unsafe_first_hop_never_egresses(self, url: str) -> None:
        handler = _Recorder(lambda r: streamed_response(200, content=b"x"))
        async with _client(handler) as client:
            with pytest.raises(UnsafeURLError):
                await fetch_capped(client, url, max_bytes=10, total_timeout_seconds=2.0)
        assert handler.urls == []

    async def test_redirect_into_internal_target_is_refused(self) -> None:
        handler = _Recorder(
            lambda r: httpx.Response(302, headers={"location": "http://127.0.0.1/admin"})
        )
        with pytest.raises(UnsafeURLError):
            await _fetch(handler)
        assert handler.urls == [_URL]

    async def test_malformed_redirect_target_is_refused_without_urllib_text(self) -> None:
        # httpx accepts this Location (it escapes the bracket); urljoin raises
        # "Invalid IPv6 URL" on it.
        handler = _Recorder(lambda r: httpx.Response(302, headers={"location": "http://a]b/"}))
        with pytest.raises(UnsafeURLError) as exc_info:
            await _fetch(handler)
        assert str(exc_info.value) == "url is not well formed"
        assert handler.urls == [_URL]


class TestLogging:
    async def test_failure_logs_reason_and_host_never_the_url(
        self, caplog: pytest.LogCaptureFixture,
    ) -> None:
        caplog.set_level(logging.WARNING, logger="platform_shared.core.capped_fetch")
        with pytest.raises(CappedFetchError) as exc_info:
            await _fetch(_Recorder(lambda r: httpx.Response(503)))
        assert "reason=http_status" in caplog.text
        assert "host=8.8.8.8" in caplog.text
        assert "status=503" in caplog.text
        assert "secret-token-value" not in caplog.text
        assert "/feed.ics" not in caplog.text
        assert "secret-token-value" not in str(exc_info.value)

    async def test_httpx_request_log_names_the_host_never_the_url(
        self, caplog: pytest.LogCaptureFixture,
    ) -> None:
        def respond(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/feed.ics":
                return httpx.Response(
                    302, headers={"location": "http://8.8.4.4/next.ics?token=secret-token-value"},
                )
            return streamed_response(200, content=b"ok")

        caplog.set_level(logging.INFO, logger="httpx")
        await _fetch(_Recorder(respond))
        request_lines = [r.getMessage() for r in caplog.records if r.name == "httpx"]
        assert len(request_lines) == 2, "both hops are still logged"
        assert "GET 8.8.8.8 " in request_lines[0]
        assert "GET 8.8.4.4 " in request_lines[1]
        assert "secret-token-value" not in caplog.text
        assert ".ics" not in caplog.text

    async def test_httpx_logs_outside_a_capped_fetch_are_unchanged(
        self, caplog: pytest.LogCaptureFixture,
    ) -> None:
        await _fetch(_Recorder(lambda r: streamed_response(200, content=b"ok")))
        caplog.set_level(logging.INFO, logger="httpx")
        async with _client(_Recorder(lambda r: httpx.Response(200))) as client:
            await client.get("http://8.8.8.8/plain.txt")
        assert "GET http://8.8.8.8/plain.txt " in caplog.text

    async def test_failure_logs_the_cause_type_never_its_message(
        self, caplog: pytest.LogCaptureFixture,
    ) -> None:
        def respond(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError(f"refused connecting to {request.url}", request=request)

        caplog.set_level(logging.WARNING, logger="platform_shared.core.capped_fetch")
        with pytest.raises(CappedFetchError):
            await _fetch(_Recorder(respond))
        assert "cause=ConnectError" in caplog.text
        assert "secret-token-value" not in caplog.text
