"""Repository for the discovery domain — sources, fetches, and discovered jobs.

Per the layered-architecture rule (apps/myjobhunter/CLAUDE.md): routes
never touch the ORM, services orchestrate, repositories return ORM rows.
Every public function takes ``user_id`` and filters by it — tenant
scoping is mandatory.

Three logical sections (sources / fetches / discovered_jobs) live in
one module because they share a domain and are typically used together
by the fetch service. Splitting into three files would add navigation
overhead with no benefit.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import desc, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discovery.discovered_job import DiscoveredJob
from app.models.discovery.discovery_fetch import DiscoveryFetch
from app.models.discovery.discovery_source import DiscoverySource


# ===========================================================================
# discovery_sources
# ===========================================================================


async def create_source(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    source: str,
    config: dict | None = None,
    fetch_interval_minutes: int = 1440,
) -> DiscoverySource:
    """Create a new active saved search."""
    row = DiscoverySource(
        user_id=user_id,
        source=source,
        config=config or {},
        fetch_interval_minutes=fetch_interval_minutes,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def get_source(
    db: AsyncSession, source_id: uuid.UUID, user_id: uuid.UUID,
) -> DiscoverySource | None:
    stmt = select(DiscoverySource).where(
        DiscoverySource.id == source_id,
        DiscoverySource.user_id == user_id,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_sources(
    db: AsyncSession, user_id: uuid.UUID, *, active_only: bool = True,
) -> list[DiscoverySource]:
    stmt = select(DiscoverySource).where(DiscoverySource.user_id == user_id)
    if active_only:
        stmt = stmt.where(DiscoverySource.is_active.is_(True))
    stmt = stmt.order_by(DiscoverySource.created_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def deactivate_source(
    db: AsyncSession, source_id: uuid.UUID, user_id: uuid.UUID,
) -> bool:
    """Soft-deactivate a saved search. Idempotent."""
    src = await get_source(db, source_id, user_id)
    if src is None:
        return False
    src.is_active = False
    await db.flush()
    return True


async def mark_source_fetched(
    db: AsyncSession,
    source: DiscoverySource,
    *,
    success: bool,
    error_message: str | None = None,
    seen_posted_at: datetime | None = None,
) -> None:
    """Update the source's audit columns after a fetch attempt."""
    now = datetime.now(timezone.utc)
    source.last_fetched_at = now
    if success:
        source.last_success_at = now
        source.consecutive_failures = 0
        source.last_error_at = None
        source.last_error_message = None
        if seen_posted_at is not None and (
            source.last_seen_posted_at is None
            or seen_posted_at > source.last_seen_posted_at
        ):
            source.last_seen_posted_at = seen_posted_at
    else:
        source.consecutive_failures = (source.consecutive_failures or 0) + 1
        source.last_error_at = now
        source.last_error_message = (error_message or "")[:500]
    await db.flush()


# ===========================================================================
# discovery_fetches
# ===========================================================================


async def start_fetch(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    discovery_source_id: uuid.UUID,
    source: str,
) -> DiscoveryFetch:
    """Insert a row representing an in-flight fetch. Returns the row."""
    row = DiscoveryFetch(
        user_id=user_id,
        discovery_source_id=discovery_source_id,
        source=source,
        started_at=datetime.now(timezone.utc),
        status="running",
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def complete_fetch(
    db: AsyncSession,
    fetch: DiscoveryFetch,
    *,
    status: str,
    fetched_count: int = 0,
    new_count: int = 0,
    updated_count: int = 0,
    http_status: int | None = None,
    error_message: str | None = None,
) -> None:
    """Mark a running fetch row as complete."""
    now = datetime.now(timezone.utc)
    fetch.completed_at = now
    fetch.status = status
    fetch.fetched_count = fetched_count
    fetch.new_count = new_count
    fetch.updated_count = updated_count
    if http_status is not None:
        fetch.http_status = http_status
    if error_message is not None:
        fetch.error_message = error_message[:1000]
    if fetch.started_at is not None:
        fetch.duration_ms = int(
            (now - fetch.started_at).total_seconds() * 1000,
        )
    await db.flush()


# ===========================================================================
# discovered_jobs
# ===========================================================================


async def upsert_postings(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    fetch_id: uuid.UUID,
    postings: list[dict[str, Any]],
) -> tuple[int, int]:
    """Bulk upsert normalized postings, returning (new_count, updated_count).

    Idempotent on the ``(user_id, source, source_external_id)`` UNIQUE
    constraint — re-fetching the same posting advances ``updated_at``
    and ``raw_payload`` without resetting state columns
    (``dismissed_at``, ``saved_at``, ``score``, etc.).
    """
    if not postings:
        return (0, 0)

    new_count = 0
    updated_count = 0

    for raw in postings:
        # Build the row dict — defensive copy, override with fetch_id.
        payload = {**raw, "user_id": user_id, "fetch_id": fetch_id}

        stmt = pg_insert(DiscoveredJob.__table__).values(**payload)
        stmt = stmt.on_conflict_do_update(
            index_elements=["user_id", "source", "source_external_id"],
            set_={
                "title": stmt.excluded.title,
                "company_name": stmt.excluded.company_name,
                "location": stmt.excluded.location,
                "remote_type": stmt.excluded.remote_type,
                "description": stmt.excluded.description,
                "description_normalized": stmt.excluded.description_normalized,
                "content_hash": stmt.excluded.content_hash,
                "posted_at": stmt.excluded.posted_at,
                "salary_min": stmt.excluded.salary_min,
                "salary_max": stmt.excluded.salary_max,
                "salary_currency": stmt.excluded.salary_currency,
                "salary_period": stmt.excluded.salary_period,
                "raw_payload": stmt.excluded.raw_payload,
                "fetch_id": stmt.excluded.fetch_id,
                "updated_at": datetime.now(timezone.utc),
                # Clear expired_at — if we see a posting again, it's
                # not expired anymore.
                "expired_at": None,
            },
        ).returning(
            DiscoveredJob.__table__.c.id,
            (DiscoveredJob.__table__.c.created_at
             == DiscoveredJob.__table__.c.updated_at).label("is_new"),
        )

        result = await db.execute(stmt)
        row = result.first()
        if row is not None and row.is_new:
            new_count += 1
        else:
            updated_count += 1

    return (new_count, updated_count)


async def list_discovered(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    state: str = "inbox",
    limit: int = 50,
    offset: int = 0,
) -> list[DiscoveredJob]:
    """List discovered jobs scoped to user.

    state:
      - "inbox": not dismissed, not saved, not promoted (the triage view)
      - "saved": saved_at IS NOT NULL AND dismissed_at IS NULL
      - "all": every non-expired row
    """
    stmt = select(DiscoveredJob).where(DiscoveredJob.user_id == user_id)
    if state == "inbox":
        stmt = stmt.where(
            DiscoveredJob.dismissed_at.is_(None),
            DiscoveredJob.saved_at.is_(None),
            DiscoveredJob.promoted_application_id.is_(None),
        )
    elif state == "saved":
        stmt = stmt.where(
            DiscoveredJob.saved_at.isnot(None),
            DiscoveredJob.dismissed_at.is_(None),
        )
    # else "all": no extra filter
    stmt = (
        stmt.order_by(
            desc(DiscoveredJob.score.is_(None)),  # scored rows first
            desc(DiscoveredJob.score),
            desc(DiscoveredJob.discovered_at),
        )
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_discovered(
    db: AsyncSession, job_id: uuid.UUID, user_id: uuid.UUID,
) -> DiscoveredJob | None:
    stmt = select(DiscoveredJob).where(
        DiscoveredJob.id == job_id,
        DiscoveredJob.user_id == user_id,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def dismiss_discovered(
    db: AsyncSession, job_id: uuid.UUID, user_id: uuid.UUID,
) -> bool:
    """Mark a discovered job as dismissed. Idempotent."""
    job = await get_discovered(db, job_id, user_id)
    if job is None:
        return False
    if job.saved_at is not None:
        # The state CHECK constraint forbids both being set.
        job.saved_at = None
    if job.dismissed_at is None:
        job.dismissed_at = datetime.now(timezone.utc)
        await db.flush()
    return True


async def save_discovered(
    db: AsyncSession, job_id: uuid.UUID, user_id: uuid.UUID,
) -> bool:
    """Mark a discovered job as saved (kept for later). Idempotent."""
    job = await get_discovered(db, job_id, user_id)
    if job is None:
        return False
    if job.dismissed_at is not None:
        # Saving an already-dismissed job clears the dismissal.
        job.dismissed_at = None
    if job.saved_at is None:
        job.saved_at = datetime.now(timezone.utc)
        await db.flush()
    return True
