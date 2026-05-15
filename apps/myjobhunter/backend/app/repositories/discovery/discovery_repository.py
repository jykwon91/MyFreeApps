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

from sqlalchemy import desc, nulls_last, outerjoin, select, update
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
    name: str = "",
    config: dict | None = None,
    fetch_interval_minutes: int = 1440,
) -> DiscoverySource:
    """Create a new active saved search."""
    row = DiscoverySource(
        user_id=user_id,
        source=source,
        name=name,
        config=config or {},
        fetch_interval_minutes=fetch_interval_minutes,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def find_active_source_by_name(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    source: str,
    name: str,
) -> DiscoverySource | None:
    """Return the active source matching (user_id, source, name), if any.

    Used by the service layer for a pre-flight uniqueness check before
    inserting a new row. Returns ``None`` when no conflict exists.
    """
    stmt = select(DiscoverySource).where(
        DiscoverySource.user_id == user_id,
        DiscoverySource.source == source,
        DiscoverySource.name == name,
        DiscoverySource.is_active.is_(True),
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


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


async def update_source(
    db: AsyncSession,
    source_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    fetch_interval_minutes: int | None = None,
    name: str | None = None,
    is_active: bool | None = None,
    config: dict | None = None,
) -> DiscoverySource | None:
    """Partial-update a saved search. Returns None when not found / wrong owner.

    Only applies the fields that are explicitly provided (not None). This
    allows the PATCH route to accept a sparse body — fields omitted by
    the caller are left unchanged. Callers are responsible for committing.

    ``config`` replaces the entire JSONB blob when provided. The caller
    (service layer, dispatched from the schema validator) is responsible
    for ensuring the config is valid for the source kind before calling.
    SQLAlchemy does not detect in-place dict mutations on JSONB columns,
    so we assign a new dict object to trigger change tracking.
    """
    src = await get_source(db, source_id, user_id)
    if src is None:
        return None
    if fetch_interval_minutes is not None:
        src.fetch_interval_minutes = fetch_interval_minutes
    if name is not None:
        src.name = name
    if is_active is not None:
        src.is_active = is_active
    if config is not None:
        # Assign a new dict to ensure SQLAlchemy detects the change.
        # In-place mutation of a JSONB dict is silently ignored by the
        # ORM because the identity hasn't changed.
        src.config = dict(config)
    await db.flush()
    await db.refresh(src)
    return src


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


async def reap_stale_fetches(
    db: AsyncSession,
    *,
    cutoff: datetime,
) -> int:
    """Bulk-update discovery_fetches stuck in 'running' before ``cutoff`` to 'error'.

    Called at startup to clean up zombie rows left by a crashed backend.
    Returns the number of rows updated so the caller can log it.
    """
    stmt = (
        update(DiscoveryFetch)
        .where(
            DiscoveryFetch.status == "running",
            DiscoveryFetch.started_at < cutoff,
        )
        .values(
            status="error",
            error_message="reaped: server restart or stuck >30min",
        )
    )
    result = await db.execute(stmt)
    await db.flush()
    return result.rowcount or 0


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
    source_id: uuid.UUID | None = None,
) -> list[DiscoveredJob]:
    """List discovered jobs scoped to user.

    state:
      - "inbox": not dismissed, not saved, not promoted (the triage view)
      - "saved": saved_at IS NOT NULL AND dismissed_at IS NULL
      - "all": every non-expired row

    source_id:
      When provided, restricts results to rows whose fetch_id points to a
      DiscoveryFetch whose discovery_source_id matches.  Uses a LEFT JOIN
      on discovery_fetches to also populate ``discovery_source_id`` on
      every returned row (no N+1).
    """
    # Always join discovery_fetches so we can populate discovery_source_id
    # on each row without a second round-trip.  LEFT JOIN keeps rows whose
    # fetch_id is NULL (legacy rows or fetch reaped after SET NULL cascade).
    stmt = (
        select(DiscoveredJob, DiscoveryFetch.discovery_source_id.label("_dsrc_id"))
        .select_from(
            outerjoin(
                DiscoveredJob,
                DiscoveryFetch,
                DiscoveredJob.fetch_id == DiscoveryFetch.id,
            )
        )
        .where(DiscoveredJob.user_id == user_id)
    )
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

    if source_id is not None:
        stmt = stmt.where(DiscoveryFetch.discovery_source_id == source_id)

    stmt = stmt.order_by(
        # Highest score first; unscored rows fall to the bottom
        # (nulls_last so an unscored row never beats a scored one).
        nulls_last(desc(DiscoveredJob.score)),
        desc(DiscoveredJob.discovered_at),
    ).limit(limit).offset(offset)

    result = await db.execute(stmt)
    rows = []
    for job, dsrc_id in result.all():
        # Attach discovery_source_id as a plain Python attribute so the
        # Pydantic schema (from_attributes=True, discovery_source_id field)
        # can read it without an ORM relationship.
        job.discovery_source_id = dsrc_id
        rows.append(job)
    return rows


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
    db: AsyncSession,
    job_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    reason: str | None = None,
) -> bool:
    """Mark a discovered job as dismissed. Idempotent.

    ``reason`` is an optional structured signal used for future scoring
    iterations. The CHECK constraint enforces the enum at the DB layer;
    callers should validate / coerce before calling.
    """
    job = await get_discovered(db, job_id, user_id)
    if job is None:
        return False
    if job.saved_at is not None:
        # The state CHECK constraint forbids both being set.
        job.saved_at = None
    if job.dismissed_at is None:
        job.dismissed_at = datetime.now(timezone.utc)
    if reason is not None:
        job.dismissed_reason = reason
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
        job.dismissed_at = None
        job.dismissed_reason = None
    if job.saved_at is None:
        job.saved_at = datetime.now(timezone.utc)
        await db.flush()
    return True


async def undo_dismiss_discovered(
    db: AsyncSession,
    job_id: uuid.UUID,
    user_id: uuid.UUID,
) -> DiscoveredJob | None:
    """Clear dismissed_at / dismissed_reason so the job returns to the inbox.

    Returns the updated row on success, or None when:
    - The job doesn't exist or belongs to a different user (tenant isolation).
    - The job is NOT currently dismissed (already active / saved / promoted).

    Idempotency decision: a job that was never dismissed returns None (404) so
    the frontend can distinguish "undo worked" from "nothing to undo". The
    caller (service layer) translates None → 404.
    """
    job = await get_discovered(db, job_id, user_id)
    if job is None:
        return None
    if job.dismissed_at is None:
        # Not currently dismissed — nothing to undo.
        return None
    job.dismissed_at = None
    job.dismissed_reason = None
    await db.flush()
    await db.refresh(job)
    return job


async def list_unscored_for_user(
    db: AsyncSession, user_id: uuid.UUID, *, limit: int = 20,
) -> list[DiscoveredJob]:
    """Return the freshest unscored postings for the user.

    Used by the Phase C scoring loop after a fetch cycle. Filters out
    rows the operator has already triaged (dismissed / saved / promoted)
    so we don't waste tokens scoring rows the operator no longer cares
    about.
    """
    stmt = (
        select(DiscoveredJob)
        .where(
            DiscoveredJob.user_id == user_id,
            DiscoveredJob.score.is_(None),
            DiscoveredJob.dismissed_at.is_(None),
            DiscoveredJob.saved_at.is_(None),
            DiscoveredJob.promoted_application_id.is_(None),
        )
        .order_by(desc(DiscoveredJob.discovered_at))
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())
