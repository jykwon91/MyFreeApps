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
from app.schemas.discovery.greenhouse_source_config import (
    GreenhouseSourceConfig,
    GreenhouseFetchConfig,
)
from app.schemas.discovery.jsearch_source_config import JSearchSourceConfig
from app.schemas.discovery.lever_source_config import LeverSourceConfig
from app.services.discovery.industry_denylists import expand_excluded_keywords
from app.services.discovery.sources import greenhouse, jsearch, lever

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
    # Validate the stored config through the typed schema. ``parse_or_default``
    # logs + returns defaults on validation failure rather than crashing
    # the worker — but at write time, ``DiscoverySourceCreate`` rejects
    # typos with a 422, so a row reaching this code with a malformed
    # config is either pre-validation (legacy) or a direct DB edit.
    typed = JSearchSourceConfig.parse_or_default(config)

    base_query = _build_jsearch_query(typed)
    if not base_query:
        raise DiscoveryFetchError(
            "JSearch source missing required config.query (or config.roles)",
        )

    # JSearch's /search endpoint takes location inside the query string
    # (e.g. "developer in Chicago"). If the operator filled the dedicated
    # location field, fold it into the query so the source-side filter
    # narrows results instead of returning the world and filtering later.
    if typed.location:
        location = typed.location.strip()
        # Don't double-append "in <X>" if the operator already wrote it.
        if location and " in " not in base_query.lower():
            query = f"{base_query} in {location}"
        else:
            query = base_query
    else:
        query = base_query

    return await jsearch.search(
        query=query,
        page=1,
        num_pages=1,
        date_posted=typed.date_posted,
        country=typed.country,
        remote_jobs_only=typed.remote_jobs_only,
        employment_types=typed.employment_type or None,
        job_requirements=typed.experience or None,
    )


def _build_jsearch_query(config: JSearchSourceConfig) -> str:
    """Assemble the JSearch query string from a typed config.

    Two shapes accepted (both fields are on the typed config):

    1. **Legacy** — caller pre-built the Boolean string in ``config.query``.
       We use it verbatim. Sources created before the structured-input
       redesign land here.
    2. **Structured** — caller supplied ``config.roles`` (list of titles)
       and/or ``config.skills`` (list of skill names). We assemble:

           ("Role 1" OR "Role 2") (Skill1 OR Skill2)

       Quoted phrases for multi-word roles, parens around the OR
       group so JSearch treats it as a single clause.

    Empty / missing → returns "" and the caller raises.
    """
    raw_query = (config.query or "").strip()
    if raw_query:
        return raw_query

    role_parts = [r.strip() for r in config.roles if r.strip()]
    skill_parts = [s.strip() for s in config.skills if s.strip()]

    parts: list[str] = []

    if role_parts:
        # Quote multi-word role titles so JSearch matches the phrase.
        quoted = [
            f'"{r}"' if " " in r else r for r in role_parts
        ]
        if len(quoted) == 1:
            parts.append(quoted[0])
        else:
            parts.append("(" + " OR ".join(quoted) + ")")

    if skill_parts:
        if len(skill_parts) == 1:
            parts.append(skill_parts[0])
        else:
            parts.append("(" + " OR ".join(skill_parts) + ")")

    return " ".join(parts).strip()


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

    # Two sources of excluded keywords merged together:
    #   - operator's custom strings on ``config.excluded_keywords``
    #   - industry chip expansions on ``config.excluded_industry_chips``
    # ``expand_excluded_keywords`` deduplicates + lowercases.
    raw_custom = config.get("excluded_keywords")
    raw_chips = config.get("excluded_industry_chips")
    excluded_lower = expand_excluded_keywords(
        chips=raw_chips if isinstance(raw_chips, list) else None,
        custom_keywords=raw_custom if isinstance(raw_custom, list) else None,
    )

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


async def _run_greenhouse(
    config: dict[str, Any],
) -> tuple[list[dict], str | None]:
    """Validate Greenhouse config and invoke the adapter.

    Unlike JSearch, there is no meaningful default config to fall back to
    if the board_token is missing — we let ``parse_or_default`` raise
    and the fetch-service error handler marks the source as errored.

    Returns a ``(postings, resolved_company_name)`` tuple.
    ``resolved_company_name`` is non-None when the fetch service should
    write it back to the source's config JSONB to skip the metadata call
    on the next fetch.
    """
    typed = GreenhouseSourceConfig.parse_or_default(config)
    return await greenhouse.fetch_board(board_token=typed.board_token, config=typed)


async def _run_lever(config: dict[str, Any]) -> list[dict]:
    """Validate Lever config and invoke the adapter.

    Same reasoning as _run_greenhouse: no meaningful default when
    company_slug is missing.
    """
    typed = LeverSourceConfig.parse_or_default(config)
    return await lever.fetch_postings(company_slug=typed.company_slug, config=typed)


_ADAPTERS: dict[str, Callable[[dict[str, Any]], Awaitable[list[dict]]]] = {
    "jsearch": _run_jsearch,
    "lever": _run_lever,
}

# Greenhouse gets a dedicated slot because its adapter returns a tuple
# ``(postings, resolved_company_name)`` — the second element lets the
# fetch service persist the company display name back to the JSONB config
# so subsequent fetches skip the metadata round-trip.
_GREENHOUSE_ADAPTER = _run_greenhouse


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

    is_greenhouse = source.source == "greenhouse"
    if is_greenhouse:
        # Greenhouse adapter returns (postings, resolved_company_name) so it
        # bypasses the generic _ADAPTERS dispatch.
        pass
    elif source.source not in _ADAPTERS:
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
    # Greenhouse: company name resolved from metadata or cache.  Non-None
    # signals the fetch service should write it back to the config JSONB.
    greenhouse_resolved_name: str | None = None

    try:
        if is_greenhouse:
            postings, greenhouse_resolved_name = await _GREENHOUSE_ADAPTER(
                source.config or {},
            )
        else:
            adapter = _ADAPTERS[source.source]
            postings = await adapter(source.config or {})
    except Exception as exc:
        # Persist the audit row + source-level failure, then re-raise
        # the ORIGINAL exception so the route layer can map typed
        # adapter errors (JSearchAuthError → 503, JSearchTransientError
        # → 502 specific) to specific HTTP statuses. The previous
        # ``raise DiscoveryFetchError(str(exc)) from exc`` pattern
        # silently downgraded every adapter failure to the generic 502
        # branch — operators got "JSearch upstream is unavailable"
        # when the real issue was a missing API key (which deserves
        # 503 + a key-config message).
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
        raise

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

    # ---- Persist Greenhouse company name cache ----
    # When the adapter resolved a company display name that differs from
    # whatever was previously cached (or it's the first fetch), write it
    # back into the source's config JSONB so the next fetch can skip the
    # metadata round-trip.  We mutate the ORM instance directly — the
    # same db.commit() below will persist the change.
    if is_greenhouse and greenhouse_resolved_name is not None:
        current_cached = (source.config or {}).get("resolved_company_name")
        if greenhouse_resolved_name != current_cached:
            # SQLAlchemy won't detect in-place dict mutation on JSONB columns;
            # replace the column reference entirely to trigger change detection.
            updated_config = dict(source.config or {})
            updated_config["resolved_company_name"] = greenhouse_resolved_name
            source.config = updated_config
            await db.flush()

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
