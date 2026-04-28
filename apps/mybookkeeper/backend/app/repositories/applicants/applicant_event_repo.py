"""Repository for ``applicant_events`` — append-only.

No update or delete methods by design — events are immutable timeline
records that power funnel analytics. Mutating the timeline would invalidate
metrics (RENTALS_PLAN.md §7.1).

Tenant scoping: rows have no ``organization_id`` or ``user_id`` — they're
scoped through their parent ``Applicant`` via the FK.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import asc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicants.applicant import Applicant
from app.models.applicants.applicant_event import ApplicantEvent


async def append(
    db: AsyncSession,
    *,
    applicant_id: uuid.UUID,
    event_type: str,
    actor: str,
    occurred_at: _dt.datetime,
    notes: str | None = None,
) -> ApplicantEvent:
    """Append an event to an applicant's timeline.

    Caller is responsible for proving the applicant belongs to the calling
    tenant via ``applicant_repo.get()`` BEFORE calling this — repos do not
    double-check tenancy on creates.
    """
    event = ApplicantEvent(
        applicant_id=applicant_id,
        event_type=event_type,
        actor=actor,
        notes=notes,
        occurred_at=occurred_at,
    )
    db.add(event)
    await db.flush()
    return event


async def list_for_applicant(
    db: AsyncSession,
    *,
    applicant_id: uuid.UUID,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
) -> list[ApplicantEvent]:
    """Return events for an applicant in chronological (occurred_at asc) order.

    Tenant-scoped through Applicant — returns [] if the applicant doesn't
    belong to (organization_id, user_id).
    """
    result = await db.execute(
        select(ApplicantEvent)
        .join(Applicant, Applicant.id == ApplicantEvent.applicant_id)
        .where(
            ApplicantEvent.applicant_id == applicant_id,
            Applicant.organization_id == organization_id,
            Applicant.user_id == user_id,
        )
        .order_by(asc(ApplicantEvent.occurred_at))
    )
    return list(result.scalars().all())
