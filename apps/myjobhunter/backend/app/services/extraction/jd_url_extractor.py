"""Orchestrator: fetch a job-posting URL and extract structured fields.

This module is intentionally thin — it wires the HTTP layer
(``jd_url_fetcher``) to the parsing layer (``jd_url_parser``) and
re-exports every public symbol that callers imported from here before the
split, so no import sites need to change.

Two-tier strategy (details in each sub-module):
  Tier 1 — schema.org JobPosting fast path   → ``jd_url_parser``
  Tier 2 — HTML-to-text → Claude fallback    → ``jd_url_parser``

Re-exported for callers
=======================
- ``ExtractedJD``
- ``JDFetchError``
- ``JDFetchTimeoutError``
- ``JDFetchAuthRequiredError``
"""
from __future__ import annotations

import logging
import uuid

from bs4 import BeautifulSoup

from app.services.extraction.jd_url_fetcher import (
    JDFetchAuthRequiredError,
    JDFetchError,
    JDFetchTimeoutError,
    fetch_html,
    is_auth_walled,
    validate_url,
)
from app.services.extraction.jd_url_parser import (
    MIN_VISIBLE_BYTES,
    ExtractedJD,
    claude_fallback,
    find_jobposting_schema,
    from_schema_org,
    strip_visible_text,
)

# Re-export everything callers previously imported from this module.
__all__ = [
    "ExtractedJD",
    "JDFetchAuthRequiredError",
    "JDFetchError",
    "JDFetchTimeoutError",
    "extract_from_url",
]

logger = logging.getLogger(__name__)


async def extract_from_url(url: str, *, user_id: uuid.UUID) -> ExtractedJD:
    """Fetch ``url`` and extract structured JD fields.

    Args:
        url: Absolute http(s) URL of a job posting.
        user_id: Caller's user ID — propagated to ``claude_service`` for
            ``extraction_logs`` scoping on the Tier-2 fallback path.

    Returns:
        A populated :class:`ExtractedJD`.  Field-level missingness is
        signalled with ``None`` — callers should never see a ``""``.

    Raises:
        ValueError: ``url`` is not a valid absolute http(s) URL.
        JDFetchAuthRequiredError: auth-walled domain or empty body.
        JDFetchTimeoutError: upstream fetch timed out.
        JDFetchError: any other fetch / parse / Claude failure.
    """
    parsed = validate_url(url)

    if is_auth_walled(parsed.netloc + parsed.path):
        logger.info("JD URL is auth-walled domain — short-circuiting: %s", url)
        raise JDFetchAuthRequiredError(
            "This site requires sign-in — paste the description text instead.",
        )

    html = await fetch_html(url)
    soup = BeautifulSoup(html, "lxml")

    # Tier 1 — schema.org JobPosting fast path
    schema_payload = find_jobposting_schema(soup)
    if schema_payload is not None:
        logger.info("JD URL extracted via schema.org JobPosting: %s", url)
        return from_schema_org(schema_payload, source_url=url)

    # Tier 2 — strip visible HTML and pass to Claude
    visible_text = strip_visible_text(soup)
    if len(visible_text) < MIN_VISIBLE_BYTES:
        logger.info(
            "JD URL produced %d visible bytes (<%d) — auth-walled or JS-only: %s",
            len(visible_text),
            MIN_VISIBLE_BYTES,
            url,
        )
        raise JDFetchAuthRequiredError(
            "Couldn't read enough text from this page — paste the description text instead.",
        )

    return await claude_fallback(visible_text, source_url=url, user_id=user_id)
