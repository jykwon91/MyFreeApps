"""HTTP-level primitives for fetching job-posting URLs.

Responsibilities:
- URL validation (scheme/host check)
- Auth-walled domain short-circuit (LinkedIn, Glassdoor, etc.)
- httpx fetch with timeout, User-Agent, size cap
- Raise typed errors so callers never see raw httpx exceptions

Errors raised
=============
- ``JDFetchAuthRequiredError`` — auth-walled domain or 401/403 from upstream.
- ``JDFetchTimeoutError`` — httpx timed out.
- ``JDFetchError`` — non-2xx response, network error, or oversized body.
- ``ValueError`` — URL is malformed (no scheme / no host).
"""
from __future__ import annotations

from typing import Any
from urllib.parse import urljoin, urlparse

import httpx

from platform_shared.core.url_safety import UnsafeURLError, assert_url_safe


# ---------------------------------------------------------------------------
# Tunables
# ---------------------------------------------------------------------------

# httpx total timeout for a single-page fetch.  15 s is generous and bounds
# the operator-visible wait without needing finer-grained connect timeouts.
_FETCH_TIMEOUT_SECONDS = 15.0

# A realistic User-Agent so the request looks like a desktop browser.
# Career sites rarely care about UA, but a Python-default UA gets
# blanket-rejected by some CDNs.
_USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 "
    "MyJobHunter/1.0 (+https://myjobhunter.app)"
)

# Cap the body we read to bound memory + Claude input tokens.
_MAX_FETCH_BYTES = 2_000_000  # 2 MB — every legitimate JD page fits.

# Redirect handling. We follow redirects MANUALLY (httpx auto-follow is
# disabled) so the SSRF guard can re-validate every hop — a public URL can
# 302 into an internal one. 5 hops is plenty for legitimate ATS chains
# (http→https, trailing-slash canonicalisation, vanity → real host).
_MAX_REDIRECTS = 5
_REDIRECT_STATUSES = frozenset({301, 302, 303, 307, 308})

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
    """The upstream fetch exceeded ``_FETCH_TIMEOUT_SECONDS`` — HTTP 504."""


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
    parsed = urlparse(url.strip())
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
        JDFetchTimeoutError: httpx timed out.
        JDFetchAuthRequiredError: upstream returned 401 or 403.
        JDFetchError: non-2xx response, network error, too many redirects,
            or body exceeds ``_MAX_FETCH_BYTES``.
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
    timeout = httpx.Timeout(_FETCH_TIMEOUT_SECONDS)
    # Auto-follow is OFF so the SSRF guard sees every hop. We walk redirects
    # by hand, validating the destination before each request: the original
    # URL on the first pass, every ``Location`` thereafter.
    try:
        async with httpx.AsyncClient(
            follow_redirects=False,
            timeout=timeout,
            headers=headers,
        ) as client:
            current_url = url
            for _ in range(_MAX_REDIRECTS + 1):
                # SSRF guard — never issue a request to a non-public target.
                # Raises UnsafeURLError (a ValueError) before any egress.
                await assert_url_safe(current_url)
                resp = await client.get(current_url)
                if resp.status_code in _REDIRECT_STATUSES:
                    location = resp.headers.get("location")
                    if not location:
                        break  # redirect status with no target — treat as final
                    current_url = urljoin(current_url, location)
                    continue
                break
            else:
                raise JDFetchError(
                    f"Exceeded {_MAX_REDIRECTS} redirects fetching {url}",
                )
    except UnsafeURLError:
        # Propagate unchanged — it is a ValueError the route maps to 400.
        raise
    except httpx.TimeoutException as exc:
        raise JDFetchTimeoutError(f"Timed out fetching {url}") from exc
    except httpx.HTTPError as exc:
        raise JDFetchError(f"Network error fetching {url}: {exc}") from exc

    if resp.status_code in (401, 403):
        raise JDFetchAuthRequiredError(
            f"Page returned {resp.status_code} — paste the description text instead.",
        )
    if resp.status_code >= 400:
        raise JDFetchError(
            f"Upstream returned HTTP {resp.status_code} for {url}",
        )

    # Cap body size to bound memory.  ``resp.content`` is bytes — we enforce
    # the limit there since multi-byte characters can blow past a char limit.
    if len(resp.content) > _MAX_FETCH_BYTES:
        raise JDFetchError(
            f"Page body exceeds {_MAX_FETCH_BYTES} bytes — refusing to parse",
        )

    return resp.text
