"""Fetch a user-supplied URL with an overall deadline and a streamed size cap.

Every feature that fetches a URL a user chose (an iCal feed, a job posting, a
recipe picture) has the same two exposures beyond SSRF:

- **Time.** ``httpx.Timeout(n)`` bounds each phase (connect, each read, ...)
  separately, not the request. A server that sends one byte every ``n - 1``
  seconds holds the request open indefinitely. :func:`fetch_capped` wraps the
  whole fetch, redirects and body included, in one ``asyncio.timeout``.
- **Size.** ``client.get()`` buffers the entire body before the caller can
  look at its length, so a cap checked afterwards bounds nothing. The body is
  streamed here and the read stops as soon as it passes the cap.
- **Compression.** httpx's decoders inflate each raw chunk in full before
  handing it over, so a gzip bomb passes any cap checked on decoded chunks.
  The body is read raw and decoded here with a bound on every step (see
  :class:`~platform_shared.core.capped_body_decoder.CappedBodyDecoder`); an
  unknown coding, or several stacked, is refused, and ``Accept-Encoding``
  only offers what can be decoded.

The SSRF guard from :mod:`platform_shared.core.url_safety` runs before every
hop: redirects are walked by hand (the client must not follow them itself),
so a public URL that ``302``s to an internal one is refused before egress.

Failures are logged once, here, with the reason, the host and the type of any
underlying exception. The full URL is never logged: some of these URLs are
secrets. httpx's own per-request log line is reduced to the host too, by
:class:`~platform_shared.core.host_only_request_log_filter.HostOnlyRequestLogFilter`.
"""
from __future__ import annotations

import asyncio
import logging
import zlib
from collections.abc import Callable, Mapping
from urllib.parse import urljoin

import httpx

from platform_shared.core.capped_body_decoder import CappedBodyDecoder
from platform_shared.core.capped_fetch_constants import (
    ACCEPT_ENCODING,
    DEFAULT_MAX_REDIRECTS,
    REDIRECT_STATUSES,
)
from platform_shared.core.capped_fetch_error import CappedFetchError
from platform_shared.core.capped_fetch_failure_reason import CappedFetchFailureReason
from platform_shared.core.capped_response import CappedResponse
from platform_shared.core.content_coding import single_content_coding
from platform_shared.core.host_only_request_log_filter import hide_request_urls
from platform_shared.core.url_host import url_host
from platform_shared.core.url_safety import assert_url_safe

__all__ = ["fetch_capped"]

logger = logging.getLogger(__name__)


def _fail(
    reason: CappedFetchFailureReason,
    url: str,
    *,
    status_code: int | None = None,
    cause: BaseException | None = None,
) -> CappedFetchError:
    host = url_host(url)
    # The cause's type only: an httpx message can quote the full URL.
    logger.warning(
        "Capped fetch failed: reason=%s host=%s status=%s cause=%s",
        reason, host, status_code, type(cause).__name__ if cause is not None else None,
    )
    return CappedFetchError(reason, host=host, status_code=status_code)


async def _read_capped(
    response: httpx.Response,
    *,
    max_bytes: int,
    truncate_at_cap: bool,
    url: str,
) -> tuple[bytes, bool]:
    coding = single_content_coding(response.headers.get("content-encoding", ""))
    if coding is None:
        raise _fail("bad_encoding", url)
    decoder = CappedBodyDecoder(coding)
    body = bytearray()
    raw_read = 0
    try:
        async for raw in response.aiter_raw():
            # The raw count is capped too: for every supported coding a body
            # is never smaller than its compressed form in practice, and it
            # stops a stream of bytes after the end of a gzip member.
            raw_read += len(raw)
            body.extend(decoder.decode(raw, max_length=max_bytes - len(body) + 1))
            if len(body) > max_bytes or raw_read > max_bytes:
                if truncate_at_cap:
                    return bytes(body[:max_bytes]), True
                raise _fail("too_large", url)
        body.extend(decoder.flush())
    except zlib.error as exc:
        raise _fail("bad_encoding", url, cause=exc) from exc
    if len(body) > max_bytes:
        if truncate_at_cap:
            return bytes(body[:max_bytes]), True
        raise _fail("too_large", url)
    return bytes(body), False


async def _walk(
    client: httpx.AsyncClient,
    url: str,
    *,
    max_bytes: int,
    max_redirects: int,
    headers: Mapping[str, str],
    truncate_at_cap: bool,
    accept_content_type: Callable[[str], bool] | None,
) -> CappedResponse:
    current_url = url
    for _ in range(max_redirects + 1):
        # SSRF guard before every hop. UnsafeURLError propagates unchanged.
        await assert_url_safe(current_url)
        async with client.stream(
            "GET", current_url, headers=headers, follow_redirects=False,
        ) as response:
            if response.status_code in REDIRECT_STATUSES:
                location = response.headers.get("location")
                if location:
                    current_url = urljoin(current_url, location)
                    continue
                # A redirect status with no target is the final response.
            if not response.is_success:
                raise _fail("http_status", current_url, status_code=response.status_code)
            if accept_content_type is not None and not accept_content_type(
                response.headers.get("content-type", ""),
            ):
                raise _fail("unexpected_content_type", current_url)
            content, truncated = await _read_capped(
                response,
                max_bytes=max_bytes,
                truncate_at_cap=truncate_at_cap,
                url=current_url,
            )
            return CappedResponse(
                url=current_url,
                status_code=response.status_code,
                headers=response.headers,
                content=content,
                encoding=response.encoding or "utf-8",
                truncated=truncated,
            )
    raise _fail("too_many_redirects", current_url)


async def fetch_capped(
    client: httpx.AsyncClient,
    url: str,
    *,
    max_bytes: int,
    total_timeout_seconds: float,
    max_redirects: int = DEFAULT_MAX_REDIRECTS,
    headers: Mapping[str, str] | None = None,
    truncate_at_cap: bool = False,
    accept_content_type: Callable[[str], bool] | None = None,
) -> CappedResponse:
    """GET ``url`` within ``total_timeout_seconds``, reading at most ``max_bytes``.

    Args:
        client: The caller's client. Its own per-phase timeout still applies
            inside the overall deadline.
        url: The absolute http(s) URL, user-supplied.
        max_bytes: Largest body accepted.
        total_timeout_seconds: Deadline for the whole fetch: every SSRF
            check, every redirect hop and the body read.
        max_redirects: Hops followed before giving up.
        headers: Extra request headers, merged over the client's.
            ``Accept-Encoding`` is always set to the codings this module
            decodes.
        truncate_at_cap: Return the first ``max_bytes`` instead of failing
            when the body is longer (for callers that only need the start,
            such as a page's ``<head>``).
        accept_content_type: Called with the final response's
            ``Content-Type`` (``""`` if absent) before the body is read;
            returning False fails the fetch without reading it.

    Returns:
        The final 2xx response with its body read.

    Raises:
        UnsafeURLError: the URL or a redirect hop is not a public http(s)
            target. Nothing was sent to it.
        CappedFetchError: timeout, body over the cap, too many redirects,
            non-2xx status, a refused content type or content coding, or a
            network failure. ``reason`` says which.
    """
    request_headers = {**(headers or {}), "Accept-Encoding": ACCEPT_ENCODING}
    hide_token = hide_request_urls.set(True)
    try:
        async with asyncio.timeout(total_timeout_seconds):
            return await _walk(
                client,
                url,
                max_bytes=max_bytes,
                max_redirects=max_redirects,
                headers=request_headers,
                truncate_at_cap=truncate_at_cap,
                accept_content_type=accept_content_type,
            )
    except (TimeoutError, httpx.TimeoutException) as exc:
        raise _fail("timeout", url, cause=exc) from exc
    except httpx.HTTPError as exc:
        raise _fail("network", url, cause=exc) from exc
    finally:
        hide_request_urls.reset(hide_token)
