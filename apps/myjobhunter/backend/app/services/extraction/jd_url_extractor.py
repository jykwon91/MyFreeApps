"""Fetch a job-posting URL and extract structured fields from it.

Two-tier strategy — schema.org fast path first, Claude HTML-text fallback
second. The ordering is deliberate: schema.org JobPosting is the public,
standardised contract that every modern ATS (Ashby, Greenhouse, Lever,
Workday, Indeed) server-renders into the page, and reading it costs zero
Claude tokens. Only when no JobPosting payload exists do we strip the
visible HTML to text and ship it to Claude.

Tier 1 — schema.org JobPosting fast path
========================================
- Fetch the page with httpx (15s timeout, follow redirects, send a
  realistic User-Agent so anti-bot heuristics don't outright reject us).
- Parse the response with BeautifulSoup using the lxml parser.
- Find every ``<script type="application/ld+json">`` block.
- For each block, ``json.loads`` it (handle both ``dict`` and ``list``
  shapes — some sites embed ``{"@graph": [...]}``).
- Pull the first object whose ``"@type" == "JobPosting"`` (case-insensitive)
  or whose ``"@type"`` array contains ``"JobPosting"``.
- Map ``title`` / ``hiringOrganization.name`` / ``jobLocation.address.*``
  / ``description`` / ``responsibilities`` into the ``ExtractedJD``
  shape.

Tier 2 — HTML-to-text → Claude fallback
=======================================
- BeautifulSoup ``get_text(separator='\\n')`` on the response body, with
  ``<script>``, ``<style>``, ``<noscript>``, ``<svg>`` removed first so
  noise from minified JS doesn't drown the useful copy.
- Collapse runs of blank lines to a single blank.
- If the resulting text is shorter than ``_MIN_VISIBLE_BYTES`` (500 chars),
  raise ``JDFetchAuthRequiredError`` — almost always a login wall, a CDN
  challenge page, or a JS-only renderer that gave us a placeholder.
- Otherwise hand the text to ``claude_service.call_claude`` with the
  existing JD-parsing system prompt, then translate the Claude dict
  back into the ``ExtractedJD`` shape.

Auth-walled domain shortcut
===========================
LinkedIn job pages and Glassdoor postings live behind authentication
that we can't bypass without an OAuth flow we don't have. Recognise
the URL up front and raise ``JDFetchAuthRequiredError`` BEFORE making a
network call so the operator gets clean feedback ("paste the text
instead") and we don't waste a Claude turn on an HTML page that's
mostly the navigation bar.

Tenant scoping
==============
``user_id`` is only used to scope the ``extraction_logs`` row written
by ``claude_service`` on the Tier-2 fallback. The endpoint layer
authenticates the caller; this module never persists any other rows.

Errors raised
=============
- ``JDFetchAuthRequiredError`` — the URL is auth-walled OR the page
  returned a near-empty body. Mapped to HTTP 422 ``auth_required``.
- ``JDFetchTimeoutError`` — httpx timed out. Mapped to HTTP 504.
- ``JDFetchError`` — the fetch returned a non-2xx status, the body
  could not be parsed, or the Claude fallback raised. Mapped to HTTP 502.
- ``ValueError`` — the URL string is malformed (no scheme / no host).
  Mapped to HTTP 400.
"""
from __future__ import annotations

import json
import logging
import re
import uuid
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

import anthropic
import httpx
from bs4 import BeautifulSoup

from app.services.extraction import claude_service
from app.services.extraction.prompts.jd_parsing_prompt import JD_PARSING_PROMPT

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tunables
# ---------------------------------------------------------------------------

# httpx total timeout. 15s is generous for a single-page fetch and bounds the
# operator-blocking wait. Connect timeout defaults to the same value via
# httpx.Timeout below — we don't need finer-grained control here.
_FETCH_TIMEOUT_SECONDS = 15.0

# A realistic User-Agent so our request looks like a desktop browser and
# isn't summarily blocked by anti-bot defaults. Career sites rarely care
# about UA, but a Python-default UA gets blanket-rejected by some CDNs.
_USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 "
    "MyJobHunter/1.0 (+https://myjobhunter.app)"
)

# Below this many visible-text bytes we treat the page as auth-walled or
# JS-rendered and surface "paste the text instead" rather than waste a
# Claude turn on a navbar.
_MIN_VISIBLE_BYTES = 500

# Cap the body we read to bound memory + Claude input tokens.
_MAX_FETCH_BYTES = 2_000_000  # 2 MB — every legitimate JD page fits.

# Hard-coded auth-walled domains. Ordered so the most-common cases match
# first — substring match on ``netloc`` keeps the table readable.
_AUTH_WALLED_DOMAINS: tuple[str, ...] = (
    "linkedin.com/jobs",
    "linkedin.com/job/",
    "glassdoor.com/job-listing",
    "glassdoor.com/Job/",
    # ``ziprecruiter.com`` posts can be read anonymously today; if that
    # changes add it here.
)


# ---------------------------------------------------------------------------
# Result + error types
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class ExtractedJD:
    """Fields extracted from a job-posting URL.

    See ``app/schemas/application/jd_url_extract_response.py`` for the
    Pydantic mirror of this shape.
    """

    title: str | None
    company: str | None
    company_website: str | None
    company_logo_url: str | None
    location: str | None
    description_html: str | None
    requirements_text: str | None
    summary: str | None
    source_url: str


class JDFetchError(RuntimeError):
    """The fetch or parse failed in a way that should surface as HTTP 502.

    Wraps both upstream HTTP errors (non-2xx, parse failures) and the
    Claude fallback when it raises. The route handler stringifies this
    for the response detail.
    """


class JDFetchTimeoutError(JDFetchError):
    """The upstream fetch exceeded ``_FETCH_TIMEOUT_SECONDS`` — HTTP 504."""


class JDFetchAuthRequiredError(JDFetchError):
    """The URL points at an auth-walled domain or the fetched body is
    empty enough that we infer auth is required. HTTP 422.

    The frontend surfaces a "couldn't reach — paste the text instead"
    affordance and switches to the paste-text tab.
    """


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


async def extract_from_url(url: str, *, user_id: uuid.UUID) -> ExtractedJD:
    """Fetch ``url`` and extract structured JD fields.

    Args:
        url: Absolute http(s) URL of a job posting.
        user_id: Caller's user ID — propagated to ``claude_service`` for
            ``extraction_logs`` scoping on the Tier-2 fallback path.

    Returns:
        A populated :class:`ExtractedJD`. Field-level missingness is
        signalled with ``None`` — callers should never see a ``""``.

    Raises:
        ValueError: ``url`` is not a valid absolute http(s) URL.
        JDFetchAuthRequiredError: auth-walled domain or empty body.
        JDFetchTimeoutError: upstream fetch timed out.
        JDFetchError: any other fetch / parse / Claude failure.
    """
    parsed = _validate_url(url)

    if _is_auth_walled(parsed.netloc + parsed.path):
        logger.info("JD URL is auth-walled domain — short-circuiting: %s", url)
        raise JDFetchAuthRequiredError(
            "This site requires sign-in — paste the description text instead.",
        )

    html = await _fetch_html(url)
    soup = BeautifulSoup(html, "lxml")

    # Tier 1 — schema.org JobPosting fast path
    schema_payload = _find_jobposting_schema(soup)
    if schema_payload is not None:
        logger.info("JD URL extracted via schema.org JobPosting: %s", url)
        return _from_schema_org(schema_payload, source_url=url)

    # Tier 2 — strip visible HTML and pass to Claude
    visible_text = _strip_visible_text(soup)
    if len(visible_text) < _MIN_VISIBLE_BYTES:
        logger.info(
            "JD URL produced %d visible bytes (<%d) — auth-walled or JS-only: %s",
            len(visible_text),
            _MIN_VISIBLE_BYTES,
            url,
        )
        raise JDFetchAuthRequiredError(
            "Couldn't read enough text from this page — paste the description text instead.",
        )

    return await _claude_fallback(visible_text, source_url=url, user_id=user_id)


# ---------------------------------------------------------------------------
# URL validation + auth-walled detection
# ---------------------------------------------------------------------------


def _validate_url(url: str) -> Any:
    """Parse ``url`` and ensure scheme/netloc are present.

    Raises ValueError on anything we wouldn't want to feed to httpx —
    relative URLs, ``file://``, ``data:``, missing host, etc.
    """
    if not isinstance(url, str) or not url.strip():
        raise ValueError("url must be a non-empty string")
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"url scheme must be http or https, got {parsed.scheme!r}")
    if not parsed.netloc:
        raise ValueError("url must include a host (netloc)")
    return parsed


def _is_auth_walled(needle: str) -> bool:
    """Substring match the URL path against the auth-walled domain table."""
    haystack = needle.lower()
    return any(domain in haystack for domain in _AUTH_WALLED_DOMAINS)


# ---------------------------------------------------------------------------
# httpx fetch
# ---------------------------------------------------------------------------


async def _fetch_html(url: str) -> str:
    """Fetch ``url`` and return the response body as a string.

    Raises:
        JDFetchTimeoutError: on httpx timeout.
        JDFetchAuthRequiredError: on 401/403 (most ATSes use these for
            authenticated sections — the public posting URL won't 401
            unless we hit an auth-walled section).
        JDFetchError: on any other non-2xx, network error, or oversized body.
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
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=timeout,
            headers=headers,
        ) as client:
            resp = await client.get(url)
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

    # Cap body size to bound memory. ``resp.content`` is bytes — we encode
    # the limit there since multi-byte characters can blow past a char limit.
    if len(resp.content) > _MAX_FETCH_BYTES:
        raise JDFetchError(
            f"Page body exceeds {_MAX_FETCH_BYTES} bytes — refusing to parse",
        )

    return resp.text


# ---------------------------------------------------------------------------
# schema.org JobPosting parsing
# ---------------------------------------------------------------------------


def _find_jobposting_schema(soup: BeautifulSoup) -> dict | None:
    """Walk all ``<script type="application/ld+json">`` blocks and return
    the first JobPosting payload found, or ``None`` if no block matches.

    Handles three real-world shapes:
    - A single JobPosting dict at the top level
    - A list of objects (multiple types on one page)
    - An ``@graph`` wrapper holding a list of typed objects

    Type matching is case-insensitive and handles both ``"@type": "JobPosting"``
    and ``"@type": ["JobPosting", ...]`` forms.
    """
    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        raw = script.string or script.get_text() or ""
        if not raw.strip():
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            # Some sites have multiple concatenated JSON blocks. Skip the
            # block silently — Tier 2 (Claude) will catch the content.
            continue

        candidates = _flatten_ld_candidates(data)
        for obj in candidates:
            if _is_jobposting(obj):
                return obj
    return None


def _flatten_ld_candidates(data: object) -> list[dict]:
    """Yield every dict-like object from a JSON-LD blob.

    JSON-LD payloads can be:
    - ``{...}``                    — single object
    - ``[{...}, {...}]``           — list of objects
    - ``{"@graph": [{...}, ...]}`` — graph wrapper
    """
    out: list[dict] = []
    if isinstance(data, dict):
        out.append(data)
        graph = data.get("@graph")
        if isinstance(graph, list):
            out.extend(item for item in graph if isinstance(item, dict))
    elif isinstance(data, list):
        out.extend(item for item in data if isinstance(item, dict))
    return out


def _is_jobposting(obj: dict) -> bool:
    """Return True if ``@type`` indicates a JobPosting (case-insensitive)."""
    type_field = obj.get("@type")
    if isinstance(type_field, str):
        return type_field.lower() == "jobposting"
    if isinstance(type_field, list):
        return any(
            isinstance(t, str) and t.lower() == "jobposting" for t in type_field
        )
    return False


def _from_schema_org(payload: dict, *, source_url: str) -> ExtractedJD:
    """Map a JobPosting JSON-LD dict into an :class:`ExtractedJD`."""
    title = _str_or_none(payload.get("title"))

    # ``hiringOrganization`` may be a string or a nested Organization object.
    # When it's an object, schema.org also defines ``sameAs`` (canonical
    # company website) and ``logo`` — we pull both so the auto-create
    # flow on the frontend can populate ``primary_domain`` and
    # ``logo_url`` instead of just ``name``.
    company = None
    company_website: str | None = None
    company_logo_url: str | None = None
    org = payload.get("hiringOrganization")
    if isinstance(org, dict):
        company = _str_or_none(org.get("name"))
        company_website = _str_or_none(org.get("sameAs"))
        # ``logo`` may be a plain URL string OR an ImageObject
        logo = org.get("logo")
        if isinstance(logo, str):
            company_logo_url = _str_or_none(logo)
        elif isinstance(logo, dict):
            company_logo_url = _str_or_none(logo.get("url"))
    elif isinstance(org, str):
        company = _str_or_none(org)

    location = _extract_schema_location(payload)

    # ``description`` is commonly an HTML string per schema.org spec.
    description_html = _str_or_none(payload.get("description"))

    # ``responsibilities`` — schema.org allows either a plain string or
    # a list. Newline-join lists into a readable bullet block.
    requirements_text = _extract_schema_requirements(payload)

    return ExtractedJD(
        title=title,
        company=company,
        company_website=company_website,
        company_logo_url=company_logo_url,
        location=location,
        description_html=description_html,
        requirements_text=requirements_text,
        # No summary — JobPosting payloads don't expose a short summary.
        summary=None,
        source_url=source_url,
    )


def _extract_schema_location(payload: dict) -> str | None:
    """Pull a human-readable location string from schema.org JobPosting.

    ``jobLocation`` may be a single Place, a list of Places, or absent.
    Each Place has an ``address`` (PostalAddress) with addressLocality /
    addressRegion / addressCountry. We join the parts that exist.
    """
    locations = payload.get("jobLocation")
    if isinstance(locations, dict):
        return _format_postal_address(locations.get("address"))
    if isinstance(locations, list):
        for loc in locations:
            if isinstance(loc, dict):
                formatted = _format_postal_address(loc.get("address"))
                if formatted:
                    return formatted
    # Some payloads put the address one level up.
    if "address" in payload:
        return _format_postal_address(payload.get("address"))
    return None


def _format_postal_address(address: object) -> str | None:
    """Join PostalAddress fields into ``locality, region, country``."""
    if not isinstance(address, dict):
        if isinstance(address, str):
            return _str_or_none(address)
        return None
    parts: list[str] = []
    for key in ("addressLocality", "addressRegion", "addressCountry"):
        value = address.get(key)
        # ``addressCountry`` can itself be ``{"@type": "Country", "name": "US"}``.
        if isinstance(value, dict):
            value = value.get("name")
        cleaned = _str_or_none(value)
        if cleaned and cleaned not in parts:
            parts.append(cleaned)
    return ", ".join(parts) if parts else None


def _extract_schema_requirements(payload: dict) -> str | None:
    """Newline-join JobPosting.responsibilities (string or list)."""
    raw = payload.get("responsibilities")
    if isinstance(raw, str):
        return _str_or_none(raw)
    if isinstance(raw, list):
        items = [_str_or_none(item) for item in raw]
        items = [i for i in items if i]
        return "\n".join(items) if items else None
    return None


# ---------------------------------------------------------------------------
# HTML → text + Claude fallback
# ---------------------------------------------------------------------------


_BLANKS = re.compile(r"\n{3,}")


def _strip_visible_text(soup: BeautifulSoup) -> str:
    """Return the page's visible text with noise stripped.

    Removes ``<script>``, ``<style>``, ``<noscript>``, ``<svg>`` first
    so minified JS / inline CSS doesn't pollute the corpus, then collapses
    runs of 3+ blank lines into 2.
    """
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()
    text = soup.get_text(separator="\n")
    # Collapse Windows line endings + excessive blank runs.
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _BLANKS.sub("\n\n", text)
    return text.strip()


async def _claude_fallback(
    visible_text: str,
    *,
    source_url: str,
    user_id: uuid.UUID,
) -> ExtractedJD:
    """Send the stripped visible text to Claude and translate the response.

    Reuses the existing JD-parsing system prompt and ``call_claude``
    plumbing so token/cost accounting flows through ``extraction_logs``
    the same way the paste-text path does. The Claude dict shape is
    well-known (see ``jd_parsing_prompt.py``); we project the relevant
    fields onto :class:`ExtractedJD` here and bundle the must-have +
    nice-to-have lists into ``requirements_text`` so the form pre-fill
    has something concrete to display.
    """
    try:
        parsed = await claude_service.call_claude(
            system_prompt=JD_PARSING_PROMPT,
            user_content=visible_text,
            context_type="jd_url_parse",
            user_id=user_id,
            context_id=None,
        )
    except (anthropic.APIError, ValueError) as exc:
        logger.warning("Claude JD-URL fallback failed for %s: %s", source_url, exc)
        raise JDFetchError(f"AI extraction failed: {exc}") from exc

    title = _str_or_none(parsed.get("title"))
    company = _str_or_none(parsed.get("company"))
    location = _str_or_none(parsed.get("location"))
    summary = _str_or_none(parsed.get("summary"))

    must_have = _string_list(parsed.get("must_have_requirements"))
    nice_have = _string_list(parsed.get("nice_to_have_requirements"))
    requirements_text = _format_requirements_block(must_have, nice_have)

    # No description_html — Claude returns a summary; the visible HTML is
    # not preserved through the parse. The form's notes / description
    # fields are filled from the summary + requirements.
    return ExtractedJD(
        title=title,
        company=company,
        # Claude HTML-text fallback path doesn't reliably surface the
        # company website / logo. Operators can still trigger the
        # async company-research enrichment after auto-create, which
        # uses Tavily to find the website.
        company_website=None,
        company_logo_url=None,
        location=location,
        description_html=None,
        requirements_text=requirements_text,
        summary=summary,
        source_url=source_url,
    )


def _format_requirements_block(
    must_have: list[str],
    nice_have: list[str],
) -> str | None:
    """Render two requirement lists as a Markdown-friendly bullet block."""
    if not must_have and not nice_have:
        return None
    chunks: list[str] = []
    if must_have:
        chunks.append("Must have:\n" + "\n".join(f"- {item}" for item in must_have))
    if nice_have:
        chunks.append("Nice to have:\n" + "\n".join(f"- {item}" for item in nice_have))
    return "\n\n".join(chunks)


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------


def _str_or_none(value: object) -> str | None:
    """Coerce ``value`` to a stripped string, or None if empty / wrong type."""
    if not value or not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped if stripped else None


def _string_list(value: object) -> list[str]:
    """Coerce ``value`` to a list of cleaned non-empty strings."""
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        cleaned = _str_or_none(item)
        if cleaned:
            out.append(cleaned)
    return out
