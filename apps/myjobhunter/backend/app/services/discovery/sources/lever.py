"""Lever public job-board source adapter.

Wraps the official Lever Postings API:
``GET https://api.lever.co/v0/postings/{company_slug}?mode=json``

This is a free, no-auth, officially-supported feed.  Lever explicitly
publishes this endpoint for programmatic consumption.  See:
https://hire.lever.co/developer/documentation

Key design decisions
====================

- **No authentication required** — the v0 postings endpoint is public.
  We only need the operator-supplied ``company_slug`` from the Lever URL.
- **404 = unknown slug** — treated as ``LeverInvalidSlugError`` (caller
  should pause the source and surface to the operator).
- **429 / 5xx = transient** — retried up to 3 times with exponential
  backoff via tenacity.
- **Plain-text description** — Lever returns ``descriptionPlain`` so no
  HTML stripping is needed.  We fall back to the HTML ``description``
  field (stripping tags) if ``descriptionPlain`` is absent.
- **company_name** — derived from the company_slug since the v0 postings
  endpoint doesn't return the company display name directly.  We use
  ``_humanize_slug()`` to produce a readable name (e.g. ``stripe-inc``
  → ``Stripe Inc``).  Not perfect but better than the raw slug in the
  card UI.  The operator can later link the job to a Company record which
  has the canonical name.
- **createdAt is epoch milliseconds** in Lever's v0 API.

Per ``rules/check-third-party-error-codes.md``: HTTP status + response
body excerpt are logged on every non-2xx so Sentry dashboards can surface
the failure reason without a debug endpoint.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.schemas.discovery.lever_source_config import LeverSourceConfig

logger = logging.getLogger(__name__)


LEVER_POSTINGS_BASE = "https://api.lever.co/v0/postings"

USER_AGENT = "MyJobHunter/1.0 (+https://myjobhunter.myfreeapps.org)"

# HTTP statuses that warrant exponential backoff + retry.
_TRANSIENT_STATUS = frozenset({429, 500, 502, 503, 504})

# Lightweight HTML tag stripper for the fallback ``description`` field.
_HTML_TAG_RE = re.compile(r"<[^>]+>", re.IGNORECASE)
_WHITESPACE_RE = re.compile(r"\s{2,}")

# Cap description length consistent with jsearch.py and greenhouse.py.
_MAX_DESCRIPTION_CHARS = 12_000


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class LeverError(RuntimeError):
    """Generic Lever failure."""


class LeverInvalidSlugError(LeverError):
    """404 — company_slug doesn't exist.  Fatal, do not retry."""


class LeverTransientError(LeverError):
    """429 / 5xx / network error — retry with backoff."""


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


@retry(
    retry=retry_if_exception_type(LeverTransientError),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=20),
    reraise=True,
)
async def fetch_postings(
    *,
    company_slug: str,
    config: LeverSourceConfig | None = None,
) -> list[dict]:
    """Fetch all active postings from a Lever public job board.

    Args:
        company_slug: The slug from ``jobs.lever.co/<company_slug>``.
        config: Validated LeverSourceConfig (optional — used for any future
            per-source overrides).

    Returns:
        List of normalized posting dicts whose keys map directly onto
        ``DiscoveredJob`` columns (plus ``raw_payload``).

    Raises:
        LeverInvalidSlugError: 404 — company_slug is unknown.
            Caller should deactivate the source.
        LeverTransientError: 429 / 5xx / network — retried up to 3 times.
        LeverError: Any other non-2xx status.
    """
    url = f"{LEVER_POSTINGS_BASE}/{company_slug}"
    params = {"mode": "json"}
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, params=params, headers=headers)
    except httpx.RequestError as exc:
        logger.warning(
            "Lever network error: company_slug=%s error=%s",
            company_slug,
            exc,
        )
        raise LeverTransientError(
            f"Lever network error for slug {company_slug!r}: {exc}",
        ) from exc

    if response.status_code == 404:
        logger.warning(
            "Lever invalid slug: company_slug=%s status=404 body=%s",
            company_slug,
            response.text[:300],
        )
        raise LeverInvalidSlugError(
            f"Lever company {company_slug!r} not found (404) — "
            "check that the slug is correct and postings are public",
        )

    if response.status_code in _TRANSIENT_STATUS:
        logger.warning(
            "Lever transient error: company_slug=%s status=%s body=%s",
            company_slug,
            response.status_code,
            response.text[:300],
        )
        raise LeverTransientError(
            f"Lever returned {response.status_code} for slug {company_slug!r}",
        )

    if not response.is_success:
        logger.warning(
            "Lever unexpected status: company_slug=%s status=%s body=%s",
            company_slug,
            response.status_code,
            response.text[:300],
        )
        raise LeverError(
            f"Lever returned unexpected status {response.status_code} "
            f"for slug {company_slug!r}",
        )

    try:
        body = response.json()
    except ValueError as exc:
        logger.warning(
            "Lever non-JSON response: company_slug=%s body=%s",
            company_slug,
            response.text[:300],
        )
        raise LeverError(
            f"Lever returned non-JSON body for slug {company_slug!r}: {exc}",
        ) from exc

    # The v0 endpoint returns a JSON array at the top level (mode=json).
    if not isinstance(body, list):
        logger.warning(
            "Lever unexpected response shape: company_slug=%s type=%s",
            company_slug,
            type(body).__name__,
        )
        raise LeverError(
            f"Lever response for slug {company_slug!r} is not a list: "
            f"{type(body).__name__}",
        )

    company_name = _humanize_slug(company_slug)

    normalized: list[dict] = []
    for raw in body:
        if not isinstance(raw, dict):
            continue
        if not raw.get("id"):
            continue
        normalized.append(_normalize(raw, company_name=company_name))

    logger.info(
        "Lever fetch ok: company_slug=%s returned=%d",
        company_slug,
        len(normalized),
    )
    return normalized


# ---------------------------------------------------------------------------
# Normalization
# ---------------------------------------------------------------------------


def _normalize(raw: dict, *, company_name: str) -> dict:
    """Map one Lever posting object to the DiscoveredJob column shape."""
    # Prefer the plain-text description; fall back to stripped HTML.
    description: str | None = _str_or_none(raw.get("descriptionPlain"))
    if description is None:
        html = _str_or_none(raw.get("description"))
        if html:
            description = _strip_html(html) or None

    if description and len(description) > _MAX_DESCRIPTION_CHARS:
        description = description[: _MAX_DESCRIPTION_CHARS - 1] + "…"

    # categories is a dict containing commitment, department, location, team.
    categories = raw.get("categories") or {}
    location_name: str | None = None
    if isinstance(categories, dict):
        loc = categories.get("location")
        if loc and isinstance(loc, str):
            location_name = loc.strip()[:300] or None

    remote_type = _infer_remote_type(location_name)

    return {
        "source": "lever",
        "source_external_id": str(raw["id"]),
        "source_publisher": "Lever",
        "source_url": _str_or_none(raw.get("hostedUrl")),
        "title": (_str_or_none(raw.get("text")) or "Untitled role")[:300],
        "company_name": company_name,
        "location": location_name,
        "remote_type": remote_type,
        "description": description,
        "posted_at": _parse_epoch_ms(raw.get("createdAt")),
        # The Lever v0 postings feed lists only currently-active postings and
        # carries no declared-expiry field, so there is nothing to map here.
        # Expiry for Lever is detected by disappearance from the feed (the
        # fetch service sets ``expired_at`` on rows that stop appearing).
        "source_expires_at": None,
        "salary_min": None,
        "salary_max": None,
        "salary_currency": "USD",
        "salary_period": None,
        "raw_payload": raw,
    }


def _humanize_slug(slug: str) -> str:
    """Convert a company slug to a display name.

    ``stripe-inc`` → ``Stripe Inc``
    ``openai`` → ``Openai``  (no hyphen = capitalize one word)
    ``acme-corp-ltd`` → ``Acme Corp Ltd``

    This is a best-effort cosmetic transform.  The operator can later link
    the job to a Company record that has the canonical name.
    """
    return " ".join(word.capitalize() for word in slug.split("-"))


def _strip_html(html: str) -> str:
    """Remove HTML tags and normalize whitespace to plain text."""
    text = re.sub(
        r"</?(p|br|li|h[1-6]|div|section|article)[^>]*>",
        " ",
        html,
        flags=re.IGNORECASE,
    )
    text = _HTML_TAG_RE.sub("", text)
    text = _WHITESPACE_RE.sub(" ", text)
    return text.strip()


def _infer_remote_type(location: str | None) -> str:
    if not location:
        return "unknown"
    loc_lower = location.lower()
    if "hybrid" in loc_lower:
        return "hybrid"
    if "remote" in loc_lower:
        return "remote"
    return "onsite"


def _parse_epoch_ms(value: object) -> datetime | None:
    """Parse Lever's ``createdAt`` field (Unix epoch milliseconds as int)."""
    if value is None:
        return None
    try:
        ms = int(value)  # type: ignore[arg-type]
        return datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc)
    except (TypeError, ValueError, OSError):
        return None


def _str_or_none(value: object) -> str | None:
    if not value or not isinstance(value, str):
        return None
    cleaned = value.strip()
    return cleaned if cleaned else None
