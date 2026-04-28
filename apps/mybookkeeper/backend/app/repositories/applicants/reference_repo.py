"""Repository for ``applicant_references``.

Tenant scoping: ``Reference`` rows have no ``organization_id`` or
``user_id`` of their own — they're scoped through their parent ``Applicant``.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import asc, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.applicants.reference import Reference


async def create(
    db: AsyncSession,
    *,
    applicant_id: uuid.UUID,
    relationship: str,
    reference_name: str,
    reference_contact: str,
    notes: str | None = None,
) -> Reference:
    """Create a reference row. PII args are plaintext — encryption is automatic.

    Caller is responsible for proving the applicant belongs to the calling
    tenant via ``applicant_repo.get()`` BEFORE calling this.
    """
    ref = Reference(
        applicant_id=applicant_id,
        relationship=relationship,
        reference_name=reference_name,
        reference_contact=reference_contact,
        notes=notes,
    )
    db.add(ref)
    await db.flush()
    return ref


async def list_for_applicant(
    db: AsyncSession,
    *,
    applicant_id: uuid.UUID,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
) -> list[Reference]:
    """List references for an applicant, scoped through the parent's tenancy.

    Returns [] if the applicant doesn't belong to (organization_id, user_id).
    Stable order: oldest-created first (mirrors when the host added them).
    """
    result = await db.execute(
        select(Reference)
        .join(Applicant, Applicant.id == Reference.applicant_id)
        .where(
            Reference.applicant_id == applicant_id,
            Applicant.organization_id == organization_id,
            Applicant.user_id == user_id,
        )
        .order_by(asc(Reference.created_at))
    )
    return list(result.scalars().all())


async def mark_contacted(
    db: AsyncSession,
    *,
    reference_id: uuid.UUID,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    contacted_at: _dt.datetime | None = None,
    notes: str | None = None,
) -> Reference | None:
    """Mark a reference as contacted. Tenant-scoped through Applicant."""
    found = await db.execute(
        select(Reference)
        .join(Applicant, Applicant.id == Reference.applicant_id)
        .where(
            Reference.id == reference_id,
            Applicant.organization_id == organization_id,
            Applicant.user_id == user_id,
        )
    )
    ref = found.scalar_one_or_none()
    if ref is None:
        return None

    when = contacted_at if contacted_at is not None else _dt.datetime.now(_dt.timezone.utc)
    values: dict[str, object] = {"contacted_at": when}
    if notes is not None:
        values["notes"] = notes

    await db.execute(
        update(Reference)
        .where(Reference.id == reference_id)
        .values(**values)
    )
    await db.flush()
    await db.refresh(ref)
    return ref
