"""JSearch (RapidAPI / Google Jobs) source adapter.

Wraps ``jsearch.p.rapidapi.com/search`` — a paid Google Jobs aggregator
that returns LinkedIn / Indeed / Glassdoor / ZipRecruiter / Dice listings
in one structured JSON endpoint. The legal posture is clean: we query
Google Jobs (not LinkedIn directly), and Google Jobs only indexes
postings whose hosts opt in via Schema.org JobPosting markup.

Pricing tiers (RapidAPI):

- Basic free:  200 req/month
- Pro:         $9.99/mo for 10k req
- Ultra:       $49.99/mo for 100k req
- Mega:        $149.99/mo for 400k req

Usage at MJH's expected volume (~750 req/mo for one user with 5 saved
searches × 5 pages × 1 fetch/day, i.e. ``DISCOVERY_JSEARCH_PAGES_PER_FETCH=5``)
fits comfortably in Pro. 10 searches × 5 pages × 2 fetches/day is 3 k req/mo —
still within Pro. See ``app.core.config.Settings.discovery_jsearch_pages_per_fetch``
to tune.

Adapter shape — pure function. Returns ``list[RawPosting]`` ready for
the worker to upsert. No DB writes here; the worker owns persistence.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.core.config import settings

logger = logging.getLogger(__name__)


JSEARCH_BASE_URL = "https://jsearch.p.rapidapi.com"
JSEARCH_HOST = "jsearch.p.rapidapi.com"

# Identifies us to Google's analytics / RapidAPI's request log per the
# global third-party-error-codes rule. Compliant scraping/feed-consumption
# always identifies.
USER_AGENT = "MyJobHunter/1.0 (+https://myjobhunter.myfreeapps.org)"

# HTTP statuses that warrant exponential backoff + retry. 429 is handled
# separately below (it distinguishes a transient throttle — which carries a
# Retry-After — from monthly-quota exhaustion, which does not).
_TRANSIENT_STATUS = frozenset({500, 502, 503, 504})

# RapidAPI returns 429 both for short-window throttling (carries a
# ``Retry-After`` header telling us when the window resets — usually
# seconds) AND for monthly-plan quota exhaustion (no ``Retry-After``;
# the plan is simply spent until the billing cycle rolls over). We honor
# the header when present and treat a header-less 429 as quota exhaustion
# so the operator gets an actionable, distinct failure reason instead of
# a generic "upstream unavailable".
_HTTP_TOO_MANY_REQUESTS = 429

# Upper bound (seconds) we are willing to block a request thread waiting
# on a Retry-After before giving up and letting tenacity's own backoff
# take over. A short-window RapidAPI throttle resets in seconds; a
# Retry-After far beyond this is effectively a quota wall and we should
# not hold the worker hostage for it.
_MAX_RETRY_AFTER_SECONDS = 30.0

# JSearch returns salary period as YEAR / MONTH / HOUR. Map to the
# discovered_jobs.salary_period CHECK constraint values.
_PERIOD_MAP: dict[str, str] = {
    "YEAR": "annual",
    "MONTH": "monthly",
    "HOUR": "hourly",
}

# Cap the description body to keep DB rows + Claude prompts predictable.
# JSearch typically returns 500-7000 chars; we keep up to 12k for headroom
# but truncate beyond that.
_MAX_DESCRIPTION_CHARS = 12_000


# ---------------------------------------------------------------------------
# Errors — caller distinguishes by class, not by string.
# ---------------------------------------------------------------------------


class JSearchError(RuntimeError):
    """Generic JSearch failure."""


class JSearchAuthError(JSearchError):
    """API key missing / invalid / unauthorized — fatal, do not retry."""


class JSearchTransientError(JSearchError):
    """Network error, short-window 429 throttle, or 5xx — retry with backoff."""


class JSearchQuotaError(JSearchError):
    """RapidAPI monthly quota exhausted — fatal until the plan resets.

    Distinct from ``JSearchTransientError`` so the fetch service can
    persist an actionable operator-facing reason ("JSearch monthly quota
    reached") rather than a generic "upstream unavailable". Not retried:
    retrying a spent plan just burns the rate-limit window without ever
    succeeding. Surfaced to the route layer as a 429.
    """


class JSearchInvalidResponseError(JSearchError):
    """Non-JSON body or unexpected envelope shape — fatal, surface to ops."""


# ---------------------------------------------------------------------------
# Internal — Retry-After parsing
# ---------------------------------------------------------------------------


def _parse_retry_after_seconds(value: str | None) -> float | None:
    """Parse an RFC 7231 ``Retry-After`` header into a delay in seconds.

    The header is either a non-negative integer count of seconds
    (``Retry-After: 12``) or an HTTP-date. RapidAPI uses the integer
    form. Returns ``None`` when the header is absent or unparseable —
    a header-less 429 is the signal we use to distinguish monthly-quota
    exhaustion from a short-window throttle.

    A negative or non-numeric value is treated as absent (``None``)
    rather than guessed at, so a malformed header degrades to the
    quota-exhaustion path rather than a bogus sleep.
    """
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    try:
        seconds = float(cleaned)
    except ValueError:
        # HTTP-date form — RapidAPI doesn't emit it; parsing dates here
        # would add a dependency for a case we don't observe. Treat as
        # absent so the caller falls through to quota-exhaustion.
        return None
    if seconds < 0:
        return None
    return seconds


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


@retry(
    retry=retry_if_exception_type(JSearchTransientError),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=20),
    reraise=True,
)
async def search(
    *,
    query: str,
    page: int = 1,
    num_pages: int = 1,
    date_posted: str = "all",
    country: str = "us",
    remote_jobs_only: bool = False,
    employment_types: str | None = None,
    job_requirements: str | None = None,
    api_key: str | None = None,
) -> list[dict]:
    """Run a JSearch query and return normalized RawPosting dicts.

    Args:
        query: Boolean / keyword search string (e.g.
            ``'"Senior Backend Engineer" Python remote'``). JSearch
            supports OR / AND / NOT and quoted phrases.
        page: 1-indexed page number.
        num_pages: How many pages to retrieve in this call (JSearch
            charges one request per page; keep at 1 unless you need
            depth and have budget).
        date_posted: One of ``all`` | ``today`` | ``3days`` | ``week`` |
            ``month``. Pre-filter at source rather than downstream.
        country: 2-letter ISO code. Defaults to ``us``.
        remote_jobs_only: When True, sets the source-side filter.
        employment_types: Comma-separated filter, e.g. ``FULLTIME,CONTRACTOR``.
        job_requirements: One or more (comma-separated) of
            ``no_experience``, ``under_3_years_experience``,
            ``more_than_3_years_experience``, ``no_degree``.
        api_key: Override for tests. Production reads ``settings.jsearch_api_key``.

    Returns:
        List of normalized posting dicts whose keys map directly onto
        ``DiscoveredJob`` columns (plus ``raw_payload`` carrying the
        whole JSearch result for any field we add later).

    Raises:
        JSearchAuthError: 401/403 or empty key. Caller should pause the
            saved-search and surface to the operator.
        JSearchQuotaError: 429 without a (short) ``Retry-After`` — the
            RapidAPI monthly plan is spent. Not retried; surfaced as a
            distinct, actionable reason.
        JSearchTransientError: 5xx / network / short-window 429 throttle —
            retried up to 3 times before propagating.
        JSearchInvalidResponseError: Non-JSON body or unexpected envelope.
        JSearchError: Any other 4xx.
    """
    key = api_key or settings.jsearch_api_key
    if not key:
        raise JSearchAuthError(
            "JSEARCH_API_KEY is not configured — "
            "discovery worker cannot fetch from JSearch",
        )

    params: dict[str, str] = {
        "query": query,
        "page": str(page),
        "num_pages": str(num_pages),
        "date_posted": date_posted,
        "country": country,
    }
    if remote_jobs_only:
        params["remote_jobs_only"] = "true"
    if employment_types:
        params["employment_types"] = employment_types
    if job_requirements:
        params["job_requirements"] = job_requirements

    headers = {
        "X-RapidAPI-Key": key,
        "X-RapidAPI-Host": JSEARCH_HOST,
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{JSEARCH_BASE_URL}/search",
                params=params,
                headers=headers,
            )
    except httpx.RequestError as exc:
        logger.warning("JSearch network error: %s", exc)
        raise JSearchTransientError(f"network error: {exc}") from exc

    if resp.status_code in (401, 403):
        logger.warning(
            "JSearch auth error: status=%s body=%s",
            resp.status_code,
            resp.text[:300],
        )
        raise JSearchAuthError(
            f"JSearch returned {resp.status_code} — check JSEARCH_API_KEY",
        )

    if resp.status_code == _HTTP_TOO_MANY_REQUESTS:
        # Capture the structured rate-limit signals per the third-party
        # error-codes rule. RapidAPI surfaces remaining quota in
        # ``x-ratelimit-requests-remaining`` and the reset window in
        # ``Retry-After``. We log both, then route on them.
        retry_after_raw = resp.headers.get("Retry-After")
        retry_after = _parse_retry_after_seconds(retry_after_raw)
        requests_remaining = resp.headers.get("x-ratelimit-requests-remaining")
        logger.warning(
            "JSearch 429: retry_after=%s requests_remaining=%s body=%s",
            retry_after_raw,
            requests_remaining,
            resp.text[:300],
        )

        # No (usable) Retry-After → treat as monthly-quota exhaustion.
        # Retrying a spent plan can't succeed; raise a distinct, fatal,
        # actionable error the fetch service persists as the source's
        # failure reason.
        if retry_after is None:
            raise JSearchQuotaError(
                "JSearch monthly quota reached — the RapidAPI plan is "
                "exhausted until it resets. Upgrade the plan tier or wait "
                "for the next billing cycle.",
            )

        # Short-window throttle with an actionable Retry-After: honor it
        # by sleeping the advised interval (bounded), then raise a
        # transient error so tenacity re-attempts the call.
        if retry_after > _MAX_RETRY_AFTER_SECONDS:
            # A Retry-After well past our bound is effectively a quota
            # wall — don't hold the worker for minutes. Surface it as
            # quota exhaustion with the advised wait so the reason is
            # actionable.
            raise JSearchQuotaError(
                "JSearch rate limit reached — the RapidAPI plan is "
                f"throttled for ~{int(retry_after)}s, beyond what a "
                "single fetch will wait. Upgrade the plan tier or retry "
                "later.",
            )
        await asyncio.sleep(retry_after)
        raise JSearchTransientError(
            f"JSearch throttled (429); honored Retry-After={retry_after}s",
        )

    if resp.status_code in _TRANSIENT_STATUS:
        logger.warning(
            "JSearch transient error: status=%s body=%s",
            resp.status_code,
            resp.text[:300],
        )
        raise JSearchTransientError(
            f"JSearch returned {resp.status_code}",
        )

    if resp.status_code != 200:
        logger.warning(
            "JSearch unexpected status: status=%s body=%s",
            resp.status_code,
            resp.text[:300],
        )
        raise JSearchError(
            f"JSearch returned unexpected status {resp.status_code}",
        )

    try:
        body = resp.json()
    except ValueError as exc:
        raise JSearchInvalidResponseError(
            f"JSearch returned non-JSON body: {exc}",
        ) from exc

    if not isinstance(body, dict) or body.get("status") != "OK":
        logger.warning(
            "JSearch envelope status not OK: %s",
            (body.get("status") if isinstance(body, dict) else type(body)),
        )
        raise JSearchInvalidResponseError(
            f"JSearch returned non-OK envelope: status={body.get('status') if isinstance(body, dict) else None!r}",
        )

    # The "data" field has been observed in two shapes:
    #   1. ``{"jobs": [...]}`` — documented + the shape returned by the
    #      free-tier playground we tested against during PR #405
    #   2. ``[posting, ...]`` — observed in production for some queries;
    #      the wrapper dict is dropped and data is the job list directly
    # Defensively handle both. A third hypothetical shape (data missing
    # or non-list/dict) raises so we hear about it rather than silently
    # returning zero results.
    data = body.get("data")
    if data is None:
        raw_jobs: list = []
    elif isinstance(data, list):
        raw_jobs = data
    elif isinstance(data, dict):
        raw_jobs = data.get("jobs", [])
        if not isinstance(raw_jobs, list):
            raise JSearchInvalidResponseError(
                f"JSearch data.jobs is not a list: {type(raw_jobs).__name__}",
            )
    else:
        raise JSearchInvalidResponseError(
            f"JSearch data field is unexpected type: {type(data).__name__}",
        )

    normalized: list[dict] = []
    for raw in raw_jobs:
        if not isinstance(raw, dict):
            continue
        if not raw.get("job_id"):
            continue
        normalized.append(_normalize(raw))

    logger.info(
        "JSearch search: query=%r country=%s date_posted=%s page=%d returned=%d",
        query,
        country,
        date_posted,
        page,
        len(normalized),
    )
    return normalized


# ---------------------------------------------------------------------------
# Internal — normalization mapping JSearch fields → DiscoveredJob columns
# ---------------------------------------------------------------------------


def _normalize(raw: dict[str, Any]) -> dict:
    """Map a JSearch result to the DiscoveredJob column shape."""
    description = _str_or_none(raw.get("job_description"))
    if description and len(description) > _MAX_DESCRIPTION_CHARS:
        description = description[: _MAX_DESCRIPTION_CHARS - 1] + "…"

    return {
        "source": "jsearch",
        "source_external_id": str(raw["job_id"]),
        "source_publisher": _str_or_none(raw.get("job_publisher")),
        "source_url": _str_or_none(raw.get("job_apply_link")),
        "title": (_str_or_none(raw.get("job_title")) or "Untitled role")[:300],
        "company_name": (
            _str_or_none(raw.get("employer_name")) or "Unknown company"
        )[:300],
        "location": _compose_location(raw),
        "remote_type": _remote_type(raw),
        "description": description,
        "posted_at": _parse_datetime(raw.get("job_posted_at_datetime_utc")),
        # Feed-declared expiry ("this listing closes at X"). Distinct from
        # ``expired_at``, which we set ourselves when a posting vanishes
        # upstream. JSearch surfaces it as an ISO-8601 UTC string; absent /
        # unparseable → None (the listing simply carries no declared expiry).
        "source_expires_at": _parse_datetime(
            raw.get("job_offer_expiration_datetime_utc"),
        ),
        "salary_min": _safe_float(raw.get("job_min_salary")),
        "salary_max": _safe_float(raw.get("job_max_salary")),
        "salary_currency": "USD",
        "salary_period": _PERIOD_MAP.get(
            _str_or_none(raw.get("job_salary_period")) or "",
        ),
        "raw_payload": raw,
    }


def _compose_location(raw: dict[str, Any]) -> str | None:
    explicit = _str_or_none(raw.get("job_location"))
    if explicit:
        return explicit[:300]
    city = _str_or_none(raw.get("job_city"))
    if city and city.lower() == "remote":
        return "Remote"
    parts: list[str] = []
    for value in (city, _str_or_none(raw.get("job_state")), _str_or_none(raw.get("job_country"))):
        if value:
            parts.append(value[:300])
    if not parts:
        return None
    return ", ".join(parts)


def _remote_type(raw: dict[str, Any]) -> str:
    if raw.get("job_is_remote") is True:
        return "remote"
    location_str = (raw.get("job_location") or "").lower()
    if "hybrid" in location_str or "remote" in location_str:
        return "hybrid" if "hybrid" in location_str else "remote"
    if raw.get("job_city") or raw.get("job_country"):
        return "onsite"
    return "unknown"


def _parse_datetime(value: object) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    try:
        # JSearch returns ISO 8601 with trailing Z; fromisoformat needs +00:00.
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _str_or_none(value: object) -> str | None:
    if not value or not isinstance(value, str):
        return None
    cleaned = value.strip()
    return cleaned if cleaned else None


def _safe_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        result = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    if result < 0:
        return None
    return result
