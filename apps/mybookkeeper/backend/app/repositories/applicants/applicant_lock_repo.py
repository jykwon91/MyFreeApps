"""Row-locking reads for applicants.

Kept apart from ``applicant_repo`` (already over the file-size budget). Use
these when a read-then-write must be serialised against concurrent requests.
"""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.applicants.applicant import Applicant


async def get_for_update(
    db: AsyncSession,
    *,
    applicant_id: uuid.UUID,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Applicant | None:
    """Return the non-deleted applicant owned by (organization_id, user_id),
    row-locked (``SELECT ... FOR UPDATE``) until the transaction ends.

    A concurrent caller blocks here until the first commits, then reads the
    fresh row.
    """
    stmt = (
        select(Applicant)
        .where(
            Applicant.id == applicant_id,
            Applicant.organization_id == organization_id,
            Applicant.user_id == user_id,
            Applicant.deleted_at.is_(None),
        )
        .options(selectinload(Applicant.signed_leases))
        .with_for_update(of=Applicant)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()
