"""HTML parsing and structured JD extraction from a pre-fetched page.

Two strategies — schema.org fast path first, Claude HTML-text fallback
second.  Callers pass in a ``BeautifulSoup`` object (built from the raw
HTML by the orchestrator) and receive an ``ExtractedJD`` dataclass.

Tier 1 — schema.org JobPosting fast path
=========================================
Walk every ``<script type="application/ld+json">`` block, find the first
object whose ``@type`` is ``JobPosting``, and map its fields into
``ExtractedJD``.  Handles the three real-world LD+JSON shapes:
- top-level ``{...}``
- list ``[{...}, {...}]``
- ``@graph`` wrapper ``{"@graph": [{...}, ...]}``

Tier 2 — HTML-to-text → Claude fallback
========================================
Strip ``<script>``, ``<style>``, ``<noscript>``, ``<svg>`` from the soup,
collapse blank lines, and if the result is long enough hand it to
``claude_service.call_claude`` with the JD-parsing system prompt.  The
Claude dict is projected onto ``ExtractedJD``.

The minimum-visible-bytes gate lives in the orchestrator (``jd_url_extractor``),
not here, so that it can raise ``JDFetchAuthRequiredError`` before calling
into this module.

Errors raised
=============
- ``JDFetchError`` — Claude API or parse failure (re-exported from
  ``jd_url_fetcher`` so callers import only from the orchestrator).
"""
from __future__ import annotations

import json
import logging
import re
import uuid
from dataclasses import dataclass

import anthropic
from bs4 import BeautifulSoup

from app.services.extraction import claude_service
from app.services.extraction.jd_url_fetcher import JDFetchError
from app.services.extraction.prompts.jd_parsing_prompt import JD_PARSING_PROMPT

logger = logging.getLogger(__name__)

# Below this many visible-text bytes the orchestrator treats the page as
# auth-walled or JS-rendered.  Exposed here as a public constant so the
# orchestrator can import it without duplicating the magic number.
MIN_VISIBLE_BYTES = 500


# ---------------------------------------------------------------------------
# Result type
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


# ---------------------------------------------------------------------------
# schema.org JobPosting parsing (Tier 1)
# ---------------------------------------------------------------------------


def find_jobposting_schema(soup: BeautifulSoup) -> dict | None:
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


def from_schema_org(payload: dict, *, source_url: str) -> ExtractedJD:
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


# ---------------------------------------------------------------------------
# HTML → visible text (Tier 2 preprocessing)
# ---------------------------------------------------------------------------

_BLANKS = re.compile(r"\n{3,}")


def strip_visible_text(soup: BeautifulSoup) -> str:
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


# ---------------------------------------------------------------------------
# Claude fallback (Tier 2 extraction)
# ---------------------------------------------------------------------------


async def claude_fallback(
    visible_text: str,
    *,
    source_url: str,
    user_id: uuid.UUID,
) -> ExtractedJD:
    """Send stripped visible text to Claude and translate the response.

    Reuses the existing JD-parsing system prompt and ``call_claude``
    plumbing so token/cost accounting flows through ``extraction_logs``
    the same way the paste-text path does.

    Args:
        visible_text: Page text after ``strip_visible_text``.
        source_url: Original URL, written into the returned ``ExtractedJD``.
        user_id: Caller's user ID — propagated to ``claude_service`` for
            ``extraction_logs`` scoping.

    Raises:
        JDFetchError: Claude API error or unexpected response shape.
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
    # not preserved through the parse.  The form's notes / description
    # fields are filled from summary + requirements.
    return ExtractedJD(
        title=title,
        company=company,
        # Claude HTML-text fallback path doesn't reliably surface the
        # company website / logo.  Operators can still trigger the
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


# ---------------------------------------------------------------------------
# Private helpers — schema.org
# ---------------------------------------------------------------------------


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
# Private helpers — Claude fallback
# ---------------------------------------------------------------------------


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
# Private helpers — shared
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
