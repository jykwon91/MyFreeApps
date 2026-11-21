"""The fetches behind discovered-recipe thumbnails, through real httpx.

``fetch_signed_image`` (the image proxy) and ``fetch_og_image`` (a page's
declared preview) both fetch attacker-influenced URLs. Each must have one
overall deadline and stop reading at its size cap, and neither may reach an
internal address. A real ``httpx.AsyncClient`` over ``MockTransport`` stands
in for the network, so streaming and timeouts run through httpx itself; DNS
is stubbed so hostnames resolve to a public address.

Kept apart from ``test_recipe_discovery.py``, whose autouse fixture replaces
``fetch_og_image`` with a stub.
"""
from __future__ import annotations

import asyncio
import gzip
import ipaddress
from collections.abc import AsyncIterator, Callable
from typing import Any

import httpx
import pytest

from platform_shared.core import url_safety
from platform_shared.core.signed_url import sign_payload
from platform_shared.core.url_safety import UnsafeURLError
from platform_shared.testing.streamed_response import streamed_response

from app.core.config import settings
from app.services.recipe import discovery_image_service as dis

_PUBLIC_STUB_IP = "93.184.216.34"

# Kept before the autouse fixture below replaces it, for the test that needs
# the real resolver's handling of a malformed name.
_REAL_RESOLVE_HOST = url_safety._resolve_host

Responder = Callable[[httpx.Request], httpx.Response]


def _resolve_for_tests(
    host: str, port: int
) -> list[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    try:
        return [ipaddress.ip_address(host)]  # literal IP: classified for real
    except ValueError:
        return [ipaddress.ip_address(_PUBLIC_STUB_IP)]


@pytest.fixture(autouse=True)
def _stub_dns(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "platform_shared.core.url_safety._resolve_host", _resolve_for_tests,
    )


class _Network:
    """Every ``httpx.AsyncClient`` the service builds goes through ``respond``."""

    def __init__(self, monkeypatch: pytest.MonkeyPatch, respond: Responder) -> None:
        self.urls: list[str] = []
        real_client = httpx.AsyncClient

        def handle(request: httpx.Request) -> httpx.Response:
            self.urls.append(str(request.url))
            return respond(request)

        def build(**kwargs: Any) -> httpx.AsyncClient:
            return real_client(transport=httpx.MockTransport(handle), **kwargs)

        monkeypatch.setattr(dis.httpx, "AsyncClient", build)


async def _endless(chunk: bytes, *, pause: float = 0.0) -> AsyncIterator[bytes]:
    while True:
        if pause:
            await asyncio.sleep(pause)
        yield chunk


def _signed(url: str) -> str:
    return sign_payload(url, secret=settings.secret_key, ttl_seconds=300)


class _UnreadableStream(httpx.AsyncByteStream):
    """A body that fails the test if anything reads it."""

    async def __aiter__(self) -> AsyncIterator[bytes]:
        raise AssertionError("the body must not be read")
        yield b""  # pragma: no cover - makes this an async generator

    async def aclose(self) -> None:
        return None


class TestImageProxyFetch:
    @pytest.mark.asyncio
    async def test_serves_an_image(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _Network(
            monkeypatch,
            lambda r: streamed_response(
                200, content=b"\xff\xd8jpeg", headers={"content-type": "image/jpeg"},
            ),
        )
        url = "https://cdn.example/a.jpg"
        assert await dis.fetch_signed_image(url, _signed(url)) == (b"\xff\xd8jpeg", "image/jpeg")

    @pytest.mark.asyncio
    async def test_endless_image_stops_at_the_cap(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # Buffering the whole body before checking its size never finishes.
        _Network(
            monkeypatch,
            lambda r: httpx.Response(
                200, content=_endless(b"x" * 65_536), headers={"content-type": "image/jpeg"},
            ),
        )
        url = "https://cdn.example/huge.jpg"
        with pytest.raises(dis.ImageFetchError, match="too_large"):
            await asyncio.wait_for(dis.fetch_signed_image(url, _signed(url)), timeout=10)

    @pytest.mark.asyncio
    async def test_slow_drip_image_hits_the_overall_deadline(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(dis, "IMAGE_TOTAL_TIMEOUT_SECONDS", 0.3)
        _Network(
            monkeypatch,
            lambda r: httpx.Response(
                200, content=_endless(b"x", pause=0.05), headers={"content-type": "image/jpeg"},
            ),
        )
        url = "https://cdn.example/slow.jpg"
        with pytest.raises(dis.ImageFetchError, match="timeout"):
            await asyncio.wait_for(dis.fetch_signed_image(url, _signed(url)), timeout=5)

    @pytest.mark.asyncio
    async def test_non_image_is_refused_unread(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _Network(
            monkeypatch,
            lambda r: httpx.Response(
                200, stream=_UnreadableStream(), headers={"content-type": "image/svg+xml"},
            ),
        )
        url = "https://cdn.example/a.svg"
        with pytest.raises(dis.ImageFetchError, match="unexpected_content_type"):
            await dis.fetch_signed_image(url, _signed(url))

    @pytest.mark.asyncio
    async def test_error_names_the_host_not_the_url(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        _Network(monkeypatch, lambda r: httpx.Response(500))
        url = "https://cdn.example/private-path.jpg?token=abc"
        with pytest.raises(dis.ImageFetchError) as exc_info:
            await dis.fetch_signed_image(url, _signed(url))
        assert "cdn.example" in str(exc_info.value)
        assert "private-path" not in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_redirect_into_internal_target_is_refused(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        network = _Network(
            monkeypatch,
            lambda r: httpx.Response(302, headers={"location": "http://169.254.169.254/"}),
        )
        url = "https://cdn.example/a.jpg"
        with pytest.raises(UnsafeURLError):
            await dis.fetch_signed_image(url, _signed(url))
        assert network.urls == [url]


class TestOgImageFetch:
    @pytest.mark.asyncio
    async def test_reads_the_declared_image(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _Network(
            monkeypatch,
            lambda r: streamed_response(
                200,
                content=b'<html><head><meta property="og:image" content="/hero.jpg">',
                headers={"content-type": "text/html"},
            ),
        )
        assert await dis.fetch_og_image("https://blog.example/flan") == (
            "https://blog.example/hero.jpg"
        )

    @pytest.mark.asyncio
    async def test_endless_page_is_read_only_up_to_the_cap(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        def respond(request: httpx.Request) -> httpx.Response:
            async def body() -> AsyncIterator[bytes]:
                yield b'<meta property="og:image" content="https://cdn.example/a.jpg">'
                async for chunk in _endless(b" " * 65_536):
                    yield chunk

            return httpx.Response(200, content=body(), headers={"content-type": "text/html"})

        _Network(monkeypatch, respond)
        result = await asyncio.wait_for(
            dis.fetch_og_image("https://blog.example/flan"), timeout=10,
        )
        assert result == "https://cdn.example/a.jpg"

    @pytest.mark.asyncio
    async def test_slow_drip_page_gives_up_at_the_deadline(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(dis, "OG_TOTAL_TIMEOUT_SECONDS", 0.3)
        _Network(
            monkeypatch,
            lambda r: httpx.Response(
                200, content=_endless(b" ", pause=0.05), headers={"content-type": "text/html"},
            ),
        )
        result = await asyncio.wait_for(
            dis.fetch_og_image("https://blog.example/slow"), timeout=5,
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_unreachable_page_is_not_an_error(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """A search must not fail because one publisher's server is down."""

        def respond(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("no route to host", request=request)

        _Network(monkeypatch, respond)
        assert await dis.fetch_og_image("https://blog.example/flan") is None

    @pytest.mark.asyncio
    async def test_internal_address_is_never_fetched(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        network = _Network(monkeypatch, lambda r: httpx.Response(200))
        assert await dis.fetch_og_image("http://169.254.169.254/") is None
        assert network.urls == []

    @pytest.mark.asyncio
    async def test_non_html_page_has_no_image(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _Network(
            monkeypatch,
            lambda r: httpx.Response(
                200, stream=_UnreadableStream(), headers={"content-type": "application/json"},
            ),
        )
        assert await dis.fetch_og_image("https://blog.example/api") is None

    @pytest.mark.asyncio
    async def test_malformed_hostname_has_no_image(
        self, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # The real resolver: IDNA rejects ``a..b`` with a UnicodeError that
        # used to escape and fail the whole search.
        monkeypatch.setattr(
            "platform_shared.core.url_safety._resolve_host", _REAL_RESOLVE_HOST,
        )
        network = _Network(monkeypatch, lambda r: httpx.Response(200))
        assert await dis.fetch_og_image("https://a..b/recipe") is None
        assert network.urls == []

    @pytest.mark.asyncio
    async def test_gzipped_page_is_decoded(self, monkeypatch: pytest.MonkeyPatch) -> None:
        page = gzip.compress(b'<meta property="og:image" content="https://cdn.example/g.jpg">')
        _Network(
            monkeypatch,
            lambda r: streamed_response(
                200,
                content=page,
                headers={"content-type": "text/html", "content-encoding": "gzip"},
            ),
        )
        assert await dis.fetch_og_image("https://blog.example/gz") == (
            "https://cdn.example/g.jpg"
        )
