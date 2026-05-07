"""Discovery fetch service — orchestrates one fetch cycle for a saved search.

Pipeline (one HTTP call to the source, one DB transaction):

1. Look up the DiscoverySource row, verify it belongs to the caller.
2. Insert a DiscoveryFetch row with ``status='running'`` (audit trail).
3. Dispatch to the per-source adapter (today: JSearch only).
4. Bulk-upsert the normalized postings into ``discovered_jobs`` —
   idempotent on ``(user_id, source, source_external_id)``.
5. Mark the fetch row complete (success / partial / error) with counts
   + duration.
6. Update the DiscoverySource audit columns (last_fetched_at,
   last_seen_posted_at, consecutive_failures, last_error_message).

All five are committed in a single DB transaction so a partial fetch
never leaves orphan audit rows.

Source registry: ``_ADAPTERS`` maps the source enum value to the
adapter callable. Adding a new source = one entry here + one new
adapter file under ``app/services/discovery/sources/``.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any, Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discovery.discovery_source import DiscoverySource
from app.repositories.discovery import discovery_repository
from app.services.discovery.sources import jsearch

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public errors
# ---------------------------------------------------------------------------


class DiscoveryFetchError(RuntimeError):
    """Generic fetch failure — HTTP 502."""


class DiscoverySourceNotFoundError(DiscoveryFetchError):
    """Source ID doesn't exist or doesn't belong to caller — HTTP 404."""


class DiscoverySourceInactiveError(DiscoveryFetchError):
    """Source is deactivated — HTTP 409."""


class DiscoveryUnsupportedSourceError(DiscoveryFetchError):
    """No adapter registered for this source kind — HTTP 501."""


# ---------------------------------------------------------------------------
# Source registry
# ---------------------------------------------------------------------------


# Each adapter is an async callable taking the DiscoverySource.config dict
# and returning a list[RawPosting] dict. Add new entries here as adapters
# come online.
async def _run_jsearch(config: dict[str, Any]) -> list[dict]:
    base_query = (config.get("query") or "").strip()
    if not base_query:
        raise DiscoveryFetchError(
            "JSearch source missing required config.query",
        )

    # JSearch's /search endpoint takes location inside the query string
    # (e.g. "developer in Chicago"). If the operator filled the dedicated
    # location field, fold it into the query so the source-side filter
    # narrows results instead of returning the world and filtering later.
    location = (config.get("location") or "").strip()
    if location:
        # Don't double-append "in <X>" if the operator already wrote it.
        if " in " not in base_query.lower():
            query = f"{base_query} in {location}"
        else:
            query = base_query
    else:
        query = base_query

    return await jsearch.search(
        query=query,
        page=int(config.get("page", 1)),
        num_pages=int(config.get("num_pages", 1)),
        date_posted=config.get("date_posted", "all"),
        country=config.get("country", "us"),
        remote_jobs_only=bool(config.get("remote_jobs_only", False)),
        employment_types=config.get("employment_types"),
        job_requirements=config.get("job_requirements"),
    )


# ---------------------------------------------------------------------------
# Post-fetch filtering — operator preferences applied before upsert.
# ---------------------------------------------------------------------------


def _apply_post_fetch_filters(
    postings: list[dict],
    config: dict[str, Any],
) -> list[dict]:
    """Drop postings that match operator-configured exclusions.

    Two filters today, both stored on ``discovery_sources.config``:

    1. ``min_salary_usd`` (int, optional) — drop postings whose
       ``salary_min`` is set AND below the floor. Postings with no
       salary information pass through (the source didn't disclose;
       we don't punish the listing for that).

    2. ``excluded_keywords`` (list[str], optional) — case-insensitive
       substring match against title + company_name + description +
       source_publisher. One unified list lets the operator block
       specific companies ("lockheed"), industries ("defense",
       "government"), and title words ("junior", "intern") through one
       UI.
    """
    min_salary_raw = config.get("min_salary_usd")
    try:
        min_salary = float(min_salary_raw) if min_salary_raw is not None else None
    except (TypeError, ValueError):
        min_salary = None

    excluded = config.get("excluded_keywords")
    if isinstance(excluded, list):
        excluded_lower = [
            kw.strip().lower() for kw in excluded
            if isinstance(kw, str) and kw.strip()
        ]
    else:
        excluded_lower = []

    if min_salary is None and not excluded_lower:
        return postings

    kept: list[dict] = []
    for p in postings:
        # Salary floor: skip when the source disclosed a min and it's
        # below the floor. None salary = unknown = pass-through.
        if min_salary is not None:
            posting_min = p.get("salary_min")
            if posting_min is not None and posting_min < min_salary:
                continue

        # Excluded keywords: substring match in any of the visible
        # text fields. A single match is enough to drop the posting.
        if excluded_lower:
            haystack = " ".join(
                str(p.get(field) or "").lower()
                for field in ("title", "company_name", "description", "source_publisher")
            )
            if any(kw in haystack for kw in excluded_lower):
                continue

        kept.append(p)

    return kept


_ADAPTERS: dict[str, Callable[[dict[str, Any]], Awaitable[list[dict]]]] = {
    "jsearch": _run_jsearch,
}


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


async def fetch_source(
    db: AsyncSession,
    user_id: uuid.UUID,
    source_id: uuid.UUID,
) -> dict:
    """Run one fetch cycle for ``source_id`` on behalf of ``user_id``.

    Returns a dict summarizing the result::

        {
            "fetch_id": uuid,
            "status": "success" | "partial" | "error",
            "fetched_count": int,
            "new_count": int,
            "updated_count": int,
            "duration_ms": int,
            "error_message": str | None,
        }

    Raises:
        DiscoverySourceNotFoundError: ``source_id`` doesn't exist or
            doesn't belong to ``user_id``.
        DiscoverySourceInactiveError: source is deactivated.
        DiscoveryUnsupportedSourceError: no adapter for this source kind.
        DiscoveryFetchError: adapter raised an unexpected error.
    """
    source = await discovery_repository.get_source(db, source_id, user_id)
    if source is None:
        raise DiscoverySourceNotFoundError(
            f"discovery_source {source_id} not found",
        )
    if not source.is_active:
        raise DiscoverySourceInactiveError(
            f"discovery_source {source_id} is inactive",
        )

    adapter = _ADAPTERS.get(source.source)
    if adapter is None:
        raise DiscoveryUnsupportedSourceError(
            f"no adapter registered for source kind {source.source!r}",
        )

    # ---- Audit start ----
    fetch = await discovery_repository.start_fetch(
        db,
        user_id=user_id,
        discovery_source_id=source.id,
        source=source.source,
    )

    # ---- Run adapter ----
    fetched_count = 0
    new_count = 0
    updated_count = 0
    status = "success"
    error_message: str | None = None
    max_posted_at = None

    try:
        postings = await adapter(source.config or {})
    except Exception as exc:
        # Any adapter exception → mark fetch + source as failed but
        # don't propagate beyond this service. Caller gets a typed
        # error result.
        logger.warning(
            "discovery fetch failed: source=%s id=%s error=%s",
            source.source, source.id, exc,
        )
        await discovery_repository.complete_fetch(
            db, fetch, status="error", error_message=str(exc),
        )
        await discovery_repository.mark_source_fetched(
            db, source, success=False, error_message=str(exc),
        )
        await db.commit()
        raise DiscoveryFetchError(str(exc)) from exc

    fetched_count = len(postings)

    # ---- Apply operator's post-fetch filters (min salary, excluded keywords) ----
    postings = _apply_post_fetch_filters(postings, source.config or {})

    # ---- Upsert ----
    if postings:
        new_count, updated_count = await discovery_repository.upsert_postings(
            db,
            user_id=user_id,
            fetch_id=fetch.id,
            postings=postings,
        )
        # Compute the watermark candidate from the postings we just upserted.
        for p in postings:
            posted_at = p.get("posted_at")
            if posted_at is not None and (
                max_posted_at is None or posted_at > max_posted_at
            ):
                max_posted_at = posted_at

    # ---- Audit complete + source watermark ----
    await discovery_repository.complete_fetch(
        db,
        fetch,
        status=status,
        fetched_count=fetched_count,
        new_count=new_count,
        updated_count=updated_count,
    )
    await discovery_repository.mark_source_fetched(
        db,
        source,
        success=True,
        seen_posted_at=max_posted_at,
    )
    await db.commit()
    await db.refresh(fetch)

    logger.info(
        "discovery fetch ok: source=%s fetch_id=%s fetched=%d new=%d updated=%d",
        source.source, fetch.id, fetched_count, new_count, updated_count,
    )

    return {
        "fetch_id": fetch.id,
        "status": fetch.status,
        "fetched_count": fetch.fetched_count,
        "new_count": fetch.new_count,
        "updated_count": fetch.updated_count,
        "duration_ms": fetch.duration_ms,
        "error_message": fetch.error_message,
    }
