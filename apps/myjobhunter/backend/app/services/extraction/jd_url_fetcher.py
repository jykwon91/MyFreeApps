"""HTTP-level primitives for fetching job-posting URLs.

Responsibilities:
- URL validation (scheme/host check)
- Auth-walled domain short-circuit (LinkedIn, Glassdoor, etc.)
- Fetch through ``platform_shared.core.capped_fetch`` (SSRF guard on every
  hop, one overall deadline, a streamed size cap), with a browser User-Agent
- Raise typed errors so callers never see raw httpx exceptions

Errors raised
=============
- ``JDFetchAuthRequiredError`` — auth-walled domain or 401/403 from upstream.
- ``JDFetchTimeoutError`` — the fetch passed its deadline.
- ``JDFetchError`` — non-2xx response, network error, or oversized body.
- ``ValueError`` — URL is malformed (no scheme / no host).
"""
from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

import httpx

from platform_shared.core.capped_fetch import fetch_capped
from platform_shared.core.capped_fetch_error import CappedFetchError
from platform_shared.core.loggable_url import loggable_url

from app.core.job_page_fetch_constants import (
    JOB_PAGE_MAX_BYTES,
    JOB_PAGE_MAX_REDIRECTS,
    JOB_PAGE_PHASE_TIMEOUT_SECONDS,
    JOB_PAGE_TOTAL_TIMEOUT_SECONDS,
)


# ---------------------------------------------------------------------------
# Tunables
# ---------------------------------------------------------------------------

# A realistic User-Agent so the request looks like a desktop browser.
# Career sites rarely care about UA, but a Python-default UA gets
# blanket-rejected by some CDNs.
_USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 "
    "MyJobHunter/1.0 (+https://myjobhunter.app)"
)

# Hard-coded auth-walled domains.  Ordered so the most-common cases match
# first — substring match on ``netloc + path`` keeps the table readable.
_AUTH_WALLED_DOMAINS: tuple[str, ...] = (
    "linkedin.com/jobs",
    "linkedin.com/job/",
    "glassdoor.com/job-listing",
    "glassdoor.com/Job/",
    # ``ziprecruiter.com`` posts can be read anonymously today; if that
    # changes add it here.
)


# ---------------------------------------------------------------------------
# Error types
# ---------------------------------------------------------------------------


class JDFetchError(RuntimeError):
    """The fetch failed in a way that should surface as HTTP 502.

    Wraps upstream HTTP errors (non-2xx, parse failures) and network
    errors.  The route handler stringifies this for the response detail.
    """


class JDFetchTimeoutError(JDFetchError):
    """The upstream fetch passed ``JOB_PAGE_TOTAL_TIMEOUT_SECONDS`` — HTTP 504."""


class JDFetchAuthRequiredError(JDFetchError):
    """The URL points at an auth-walled domain or upstream returned 401/403.

    HTTP 422.  The frontend surfaces "couldn't reach — paste the text
    instead" and switches to the paste-text tab.
    """


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def validate_url(url: str) -> Any:
    """Parse ``url`` and ensure scheme/netloc are present.

    Returns the ``urllib.parse.ParseResult`` on success.

    Raises:
        ValueError: URL is not a valid absolute http(s) URL.
    """
    if not isinstance(url, str) or not url.strip():
        raise ValueError("url must be a non-empty string")
    try:
        parsed = urlparse(url.strip())
    except ValueError as exc:
        # urllib's own text for a malformed bracketed host
        # (``http://[zz]/``) quotes the input; this is what the caller sees.
        raise ValueError("url is not well formed") from exc
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"url scheme must be http or https, got {parsed.scheme!r}")
    if not parsed.netloc:
        raise ValueError("url must include a host (netloc)")
    return parsed


def is_auth_walled(netloc_and_path: str) -> bool:
    """Return True if the URL path matches a known auth-walled domain."""
    haystack = netloc_and_path.lower()
    return any(domain in haystack for domain in _AUTH_WALLED_DOMAINS)


async def fetch_html(url: str) -> str:
    """Fetch ``url`` and return the response body as a decoded string.

    Args:
        url: Absolute http(s) URL to fetch.

    Returns:
        The response body text.

    Raises:
        UnsafeURLError: the URL (or a redirect hop) resolves to a non-public
            address — an SSRF attempt. Subclasses ``ValueError`` so callers
            map it to ``400`` alongside other malformed-URL rejections.
        JDFetchTimeoutError: the fetch passed its overall deadline.
        JDFetchAuthRequiredError: upstream returned 401 or 403.
        JDFetchError: non-2xx response, network error, too many redirects,
            or body exceeds ``JOB_PAGE_MAX_BYTES``.
    """
    headers = {
        "User-Agent": _USER_AGENT,
        # Request HTML preferentially — some sites content-negotiate to
        # JSON when the Accept header is too generic.
        "Accept": (
            "text/html,application/xhtml+xml,application/xml;q=0.9,"
            "*/*;q=0.8"
        ),
        "Accept-Language": "en-US,en;q=0.9",
    }
    try:
        async with httpx.AsyncClient(
            follow_redirects=False,
            timeout=httpx.Timeout(JOB_PAGE_PHASE_TIMEOUT_SECONDS),
            headers=headers,
        ) as client:
            resp = await fetch_capped(
                client,
                url,
                max_bytes=JOB_PAGE_MAX_BYTES,
                total_timeout_seconds=JOB_PAGE_TOTAL_TIMEOUT_SECONDS,
                max_redirects=JOB_PAGE_MAX_REDIRECTS,
            )
    except CappedFetchError as exc:
        # UnsafeURLError propagates unchanged: a ValueError the route maps to 400.
        raise _jd_fetch_error(exc, url) from exc

    return resp.text


def _jd_fetch_error(exc: CappedFetchError, url: str) -> JDFetchError:
    """The typed error the route maps to a status for this failure.

    Messages name the URL without its query string or login: they are logged,
    sent to Sentry and shown to the user, and job links carry tracking tokens.
    """
    url = loggable_url(url)
    if exc.reason == "timeout":
        return JDFetchTimeoutError(f"Timed out fetching {url}")
    if exc.reason == "http_status" and exc.status_code in (401, 403):
        return JDFetchAuthRequiredError(
            f"Page returned {exc.status_code} — paste the description text instead.",
        )
    if exc.reason == "http_status":
        return JDFetchError(f"Upstream returned HTTP {exc.status_code} for {url}")
    if exc.reason == "too_large":
        return JDFetchError(
            f"Page body exceeds {JOB_PAGE_MAX_BYTES} bytes — refusing to parse",
        )
    if exc.reason == "too_many_redirects":
        return JDFetchError(f"Exceeded {JOB_PAGE_MAX_REDIRECTS} redirects fetching {url}")
    if exc.reason == "bad_encoding":
        return JDFetchError(f"Page at {url} used a compression we don't accept")
    return JDFetchError(f"Network error fetching {url}")
