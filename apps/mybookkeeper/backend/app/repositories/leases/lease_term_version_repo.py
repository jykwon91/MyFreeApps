"""Repository for ``lease_term_versions``.

The table records the effective term (``starts_on`` / ``ends_on``) of a
signed lease over time. The seed row (``source_attachment_id IS NULL``)
captures the original term; later rows record extension addenda, each
pointing at the rendered ``signed_lease_attachments`` row that produced it.

Soft-delete (``deleted_at``) is the 30-day extension-undo gate: a row
becomes invisible to the lease view but the audit trail (and the linked
addendum attachment) remain. Seed rows MUST NEVER be soft-deleted — the
``uq_lease_term_versions_seed_per_lease`` partial unique index enforces
exactly one live seed per lease.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.leases.lease_term_version import LeaseTermVersion


async def create(
    db: AsyncSession,
    *,
    lease_id: uuid.UUID,
    starts_on: _dt.date,
    ends_on: _dt.date,
    source_attachment_id: uuid.UUID | None,
    created_by_user_id: uuid.UUID,
    created_at: _dt.datetime,
) -> LeaseTermVersion:
    row = LeaseTermVersion(
        lease_id=lease_id,
        starts_on=starts_on,
        ends_on=ends_on,
        source_attachment_id=source_attachment_id,
        created_by_user_id=created_by_user_id,
        created_at=created_at,
    )
    db.add(row)
    await db.flush()
    return row


async def list_by_lease(
    db: AsyncSession,
    *,
    lease_id: uuid.UUID,
    include_deleted: bool = False,
) -> list[LeaseTermVersion]:
    """Return all term versions for a lease, newest first.

    Excludes soft-deleted rows by default. Newest-first ordering matches
    the "latest extension wins" semantics the service layer relies on.
    """
    stmt = select(LeaseTermVersion).where(LeaseTermVersion.lease_id == lease_id)
    if not include_deleted:
        stmt = stmt.where(LeaseTermVersion.deleted_at.is_(None))
    stmt = stmt.order_by(desc(LeaseTermVersion.created_at))
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get(
    db: AsyncSession,
    *,
    version_id: uuid.UUID,
    lease_id: uuid.UUID,
    include_deleted: bool = False,
) -> LeaseTermVersion | None:
    """Fetch a single version scoped to its lease (IDOR guard).

    Both ``version_id`` AND ``lease_id`` must match — preventing a caller
    from undoing a version that doesn't belong to the lease they own.
    """
    stmt = select(LeaseTermVersion).where(
        LeaseTermVersion.id == version_id,
        LeaseTermVersion.lease_id == lease_id,
    )
    if not include_deleted:
        stmt = stmt.where(LeaseTermVersion.deleted_at.is_(None))
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_latest_extension(
    db: AsyncSession,
    *,
    lease_id: uuid.UUID,
) -> LeaseTermVersion | None:
    """Return the most-recent non-deleted extension (seed excluded).

    Drives the Undo button's gating on the frontend: when this returns a
    row whose ``created_at`` is within the undo window, the host can roll
    back that extension. ``None`` means the lease has no live extensions
    (only the seed row).
    """
    result = await db.execute(
        select(LeaseTermVersion)
        .where(
            LeaseTermVersion.lease_id == lease_id,
            LeaseTermVersion.deleted_at.is_(None),
            LeaseTermVersion.source_attachment_id.is_not(None),
        )
        .order_by(desc(LeaseTermVersion.created_at))
        .limit(1),
    )
    return result.scalar_one_or_none()


async def soft_delete(
    db: AsyncSession,
    *,
    version: LeaseTermVersion,
    now: _dt.datetime,
) -> None:
    """Soft-delete a term version row.

    Caller MUST have verified the row is not a seed (``source_attachment_id``
    is not NULL) and is within the undo window. Soft-deleting a seed
    would violate the one-live-seed-per-lease invariant and lose the
    original term.
    """
    version.deleted_at = now
