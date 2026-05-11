"""Greenhouse public job-board source adapter.

Wraps the official Greenhouse Boards API:
``GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true``

This is a free, no-auth, officially-supported feed.  Greenhouse explicitly
publishes this endpoint for programmatic consumption.  See:
https://developers.greenhouse.io/job-board.html

Key design decisions
====================

- **No authentication required** — the boards API is intentionally public.
  We only need the operator-supplied ``board_token`` from the board URL.
- **404 = invalid board_token** — treated as ``GreenhouseInvalidBoardError``
  (caller should pause the source and surface to the operator).
- **429 / 5xx = transient** — retried up to 3 times with exponential
  backoff via tenacity.
- **HTML description stripping** — Greenhouse returns job content as raw
  HTML (``content`` field).  We strip tags to get plain text so Claude
  can score without noise.  A lightweight regex-based stripper is used to
  avoid a heavy BeautifulSoup dependency; it handles the common patterns
  (``<br>``, ``<p>``, ``<li>``, ``<h2>``...) Greenhouse emits.
- **company_name derivation** — the jobs feed does not include the company
  name directly.  We fetch it from the board metadata endpoint on the first
  call and cache it per-adapter-call.
- **source_publisher** — set to ``"Greenhouse"`` (the platform), not the
  company name, to be consistent with JSearch's pattern (publisher = the
  channel, not the employer).

Per ``rules/check-third-party-error-codes.md``: HTTP status + response
body excerpt are logged on every non-2xx so Sentry dashboards can show the
failure reason without needing a debug endpoint.
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

from app.schemas.discovery.greenhouse_source_config import (
    GreenhouseFetchConfig,
    GreenhouseSourceConfig,
)

logger = logging.getLogger(__name__)


GREENHOUSE_BOARDS_BASE = "https://boards-api.greenhouse.io/v1/boards"

USER_AGENT = "MyJobHunter/1.0 (+https://myjobhunter.myfreeapps.org)"

# HTTP statuses that warrant exponential backoff + retry.
_TRANSIENT_STATUS = frozenset({429, 500, 502, 503, 504})

# Greenhouse JD HTML is well-structured but may contain inline styles,
# scripts (rare), and nested tags.  This stripper handles the common
# patterns; it is intentionally minimal so we don't take on BeautifulSoup
# as a dep for a secondary concern.
_HTML_TAG_RE = re.compile(r"<[^>]+>", re.IGNORECASE)
_WHITESPACE_RE = re.compile(r"\s{2,}")

# Cap description length consistent with jsearch.py.
_MAX_DESCRIPTION_CHARS = 12_000


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class GreenhouseError(RuntimeError):
    """Generic Greenhouse failure."""


class GreenhouseInvalidBoardError(GreenhouseError):
    """404 — board_token doesn't exist or is private.  Fatal, do not retry."""


class GreenhouseTransientError(GreenhouseError):
    """429 / 5xx / network error — retry with backoff."""


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


@retry(
    retry=retry_if_exception_type(GreenhouseTransientError),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=20),
    reraise=True,
)
async def fetch_board(
    *,
    board_token: str,
    config: GreenhouseSourceConfig | None = None,
) -> tuple[list[dict], str | None]:
    """Fetch all active postings from a Greenhouse public board.

    Args:
        board_token: The slug from ``boards.greenhouse.io/<board_token>``.
        config: Validated GreenhouseSourceConfig (or GreenhouseFetchConfig
            with a cached ``resolved_company_name``).  When a cached name
            is present the metadata HTTP call is skipped, halving per-fetch
            latency.

    Returns:
        A 2-tuple ``(postings, resolved_company_name)`` where:

        - ``postings`` is a list of normalized posting dicts whose keys map
          directly onto ``DiscoveredJob`` columns (plus ``raw_payload``).
        - ``resolved_company_name`` is the company display name that was
          used for this fetch — the caller should persist it back into the
          source's ``config`` JSONB so the next fetch can skip the metadata
          call.  ``None`` if the metadata call failed (board_token used
          instead; still worth persisting to avoid retrying every time).

    Raises:
        GreenhouseInvalidBoardError: 404 — board_token is unknown.
            Caller should deactivate the source.
        GreenhouseTransientError: 429 / 5xx / network — retried up to 3
            times before propagating.
        GreenhouseError: Any other non-2xx status.
    """
    jobs_url = f"{GREENHOUSE_BOARDS_BASE}/{board_token}/jobs"
    params = {"content": "true"}
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(jobs_url, params=params, headers=headers)
    except httpx.RequestError as exc:
        logger.warning(
            "Greenhouse network error: board_token=%s error=%s",
            board_token,
            exc,
        )
        raise GreenhouseTransientError(
            f"Greenhouse network error for board {board_token!r}: {exc}",
        ) from exc

    if response.status_code == 404:
        logger.warning(
            "Greenhouse invalid board: board_token=%s status=404 body=%s",
            board_token,
            response.text[:300],
        )
        raise GreenhouseInvalidBoardError(
            f"Greenhouse board {board_token!r} not found (404) — "
            "check that the board token is correct and the board is public",
        )

    if response.status_code in _TRANSIENT_STATUS:
        logger.warning(
            "Greenhouse transient error: board_token=%s status=%s body=%s",
            board_token,
            response.status_code,
            response.text[:300],
        )
        raise GreenhouseTransientError(
            f"Greenhouse returned {response.status_code} for board {board_token!r}",
        )

    if not response.is_success:
        logger.warning(
            "Greenhouse unexpected status: board_token=%s status=%s body=%s",
            board_token,
            response.status_code,
            response.text[:300],
        )
        raise GreenhouseError(
            f"Greenhouse returned unexpected status {response.status_code} "
            f"for board {board_token!r}",
        )

    try:
        body = response.json()
    except ValueError as exc:
        logger.warning(
            "Greenhouse non-JSON response: board_token=%s body=%s",
            board_token,
            response.text[:300],
        )
        raise GreenhouseError(
            f"Greenhouse returned non-JSON body for board {board_token!r}: {exc}",
        ) from exc

    # Use cached company name when available to skip the metadata round-trip.
    # ``config`` may be a ``GreenhouseFetchConfig`` (fetched from DB) or a
    # plain ``GreenhouseSourceConfig`` (e.g. in tests).  Guard with getattr
    # so both types are accepted without isinstance coupling.
    cached_name: str | None = getattr(config, "resolved_company_name", None)
    if cached_name:
        company_name = cached_name
        resolved_company_name: str | None = cached_name
        logger.debug(
            "Greenhouse company name from cache: board_token=%s name=%r",
            board_token,
            company_name,
        )
    else:
        # First fetch for this source — call the metadata endpoint.
        company_name = await _fetch_company_name(board_token, headers)
        # Persist back if the name differs from the board_token (i.e. the
        # metadata call succeeded and returned a real display name).
        resolved_company_name = company_name if company_name != board_token else None

    raw_jobs = body.get("jobs", [])
    if not isinstance(raw_jobs, list):
        logger.warning(
            "Greenhouse unexpected jobs shape: board_token=%s type=%s",
            board_token,
            type(raw_jobs).__name__,
        )
        raise GreenhouseError(
            f"Greenhouse jobs field is not a list for board {board_token!r}: "
            f"{type(raw_jobs).__name__}",
        )

    normalized: list[dict] = []
    for raw in raw_jobs:
        if not isinstance(raw, dict):
            continue
        if not raw.get("id"):
            continue
        normalized.append(_normalize(raw, company_name=company_name))

    logger.info(
        "Greenhouse fetch ok: board_token=%s returned=%d cached_name=%s",
        board_token,
        len(normalized),
        cached_name is not None,
    )
    return normalized, resolved_company_name


async def _fetch_company_name(board_token: str, headers: dict) -> str:
    """Fetch the company name from the Greenhouse board metadata.

    Best-effort — falls back to board_token on any failure.  The board
    metadata endpoint (no query params) returns a JSON object with a
    ``name`` field containing the company's display name.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{GREENHOUSE_BOARDS_BASE}/{board_token}",
                headers=headers,
            )
        if resp.is_success:
            data = resp.json()
            name = data.get("name")
            if name and isinstance(name, str):
                return name.strip()[:300]
    except Exception as exc:  # noqa: BLE001 — best-effort, swallow anything
        logger.debug(
            "Greenhouse company name fetch failed (using board_token): %s", exc,
        )
    return board_token


# ---------------------------------------------------------------------------
# Normalization
# ---------------------------------------------------------------------------


def _normalize(raw: dict, *, company_name: str) -> dict:
    """Map one Greenhouse job object to the DiscoveredJob column shape."""
    description_html = raw.get("content") or ""
    description = _strip_html(description_html)
    if len(description) > _MAX_DESCRIPTION_CHARS:
        description = description[: _MAX_DESCRIPTION_CHARS - 1] + "…"
    description = description or None

    location_raw = raw.get("location") or {}
    location_name: str | None = None
    if isinstance(location_raw, dict):
        loc = location_raw.get("name")
        if loc and isinstance(loc, str):
            location_name = loc.strip()[:300] or None
    elif isinstance(location_raw, str):
        location_name = location_raw.strip()[:300] or None

    # Derive remote_type from location string since Greenhouse doesn't
    # have a dedicated remote field.
    remote_type = _infer_remote_type(location_name)

    return {
        "source": "greenhouse",
        "source_external_id": str(raw["id"]),
        "source_publisher": "Greenhouse",
        "source_url": _str_or_none(raw.get("absolute_url")),
        "title": (_str_or_none(raw.get("title")) or "Untitled role")[:300],
        "company_name": company_name,
        "location": location_name,
        "remote_type": remote_type,
        "description": description,
        "posted_at": _parse_updated_at(raw.get("updated_at")),
        "salary_min": None,
        "salary_max": None,
        "salary_currency": "USD",
        "salary_period": None,
        "raw_payload": raw,
    }


def _strip_html(html: str) -> str:
    """Remove HTML tags and normalize whitespace to plain text."""
    # Replace block-level closing tags with newlines so paragraphs
    # become separate lines of plain text.
    text = re.sub(r"</?(p|br|li|h[1-6]|div|section|article)[^>]*>",
                  " ", html, flags=re.IGNORECASE)
    # Remove remaining tags.
    text = _HTML_TAG_RE.sub("", text)
    # Collapse multiple whitespace characters.
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


def _parse_updated_at(value: object) -> datetime | None:
    """Parse Greenhouse's ``updated_at`` field.

    Greenhouse returns ISO 8601 timestamps in the form
    ``2024-02-14T10:04:02-05:00``.  Python's fromisoformat handles this
    natively in 3.11+; for 3.7-3.10 compat we do a light normalisation.
    """
    if not value or not isinstance(value, str):
        return None
    try:
        # Python 3.11+ handles Z and ±HH:MM offsets natively.
        # For 3.10 compat we normalise the trailing Z.
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _str_or_none(value: object) -> str | None:
    if not value or not isinstance(value, str):
        return None
    cleaned = value.strip()
    return cleaned if cleaned else None
