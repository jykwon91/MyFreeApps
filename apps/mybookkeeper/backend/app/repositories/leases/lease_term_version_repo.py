"""Repository for ``lease_term_versions``.

The table records the effective term (``starts_on`` / ``ends_on``) of a
signed lease over time. The seed row (``source_attachment_id IS NULL``)
captures the original term; later rows record extension addenda, each
pointing at the rendered ``signed_lease_attachments`` row that produced it.

Soft-delete (``deleted_at``) is reserved for the 30-day extension-undo
flow that lands in a later PR — this PR only writes; it never deletes.
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
