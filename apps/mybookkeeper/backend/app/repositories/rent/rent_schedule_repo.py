"""Repository for ``rent_schedules``."""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.rent.rent_schedule import RentSchedule


async def create(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    applicant_id: uuid.UUID,
    amount: Decimal,
    cadence: str,
    start_date: _dt.date,
    property_id: uuid.UUID | None = None,
    end_date: _dt.date | None = None,
    grace_days: int | None = None,
    notes: str | None = None,
) -> RentSchedule:
    schedule = RentSchedule(
        user_id=user_id,
        organization_id=organization_id,
        applicant_id=applicant_id,
        property_id=property_id,
        amount=amount,
        cadence=cadence,
        start_date=start_date,
        end_date=end_date,
        grace_days=grace_days,
        notes=notes,
    )
    db.add(schedule)
    await db.flush()
    await db.refresh(schedule)
    return schedule


async def get(
    db: AsyncSession, *, organization_id: uuid.UUID, schedule_id: uuid.UUID,
) -> RentSchedule | None:
    result = await db.execute(
        select(RentSchedule).where(
            RentSchedule.id == schedule_id,
            RentSchedule.organization_id == organization_id,
            RentSchedule.deleted_at.is_(None),
        ),
    )
    return result.scalar_one_or_none()


async def list_for_applicant(
    db: AsyncSession, *, organization_id: uuid.UUID, applicant_id: uuid.UUID,
) -> Sequence[RentSchedule]:
    """Every live schedule for one tenant, oldest first.

    More than one is normal — a rent increase closes the current schedule and
    opens a new one the next day.
    """
    result = await db.execute(
        select(RentSchedule)
        .where(
            RentSchedule.organization_id == organization_id,
            RentSchedule.applicant_id == applicant_id,
            RentSchedule.deleted_at.is_(None),
        )
        .order_by(RentSchedule.start_date, RentSchedule.created_at),
    )
    return result.scalars().all()


async def list_for_org(
    db: AsyncSession, *, organization_id: uuid.UUID,
) -> Sequence[RentSchedule]:
    result = await db.execute(
        select(RentSchedule)
        .where(
            RentSchedule.organization_id == organization_id,
            RentSchedule.deleted_at.is_(None),
        )
        .order_by(RentSchedule.start_date, RentSchedule.created_at),
    )
    return result.scalars().all()


async def update_terms(
    db: AsyncSession,
    *,
    schedule: RentSchedule,
    fields: dict[str, object],
) -> RentSchedule:
    """Apply the editable subset of a schedule's terms.

    ``fields`` carries only the keys the caller actually touched, so clearing a
    value (``end_date=None``) is distinguishable from leaving it alone. Amount
    and cadence are absent by design: changing them would silently rewrite the
    charges already generated under the old terms, so the UI ends the schedule
    and starts a new one instead.
    """
    allowed = {"end_date", "grace_days", "notes"}
    unknown = set(fields) - allowed
    if unknown:
        raise ValueError(f"unsupported schedule fields: {sorted(unknown)}")
    for key, value in fields.items():
        setattr(schedule, key, value)
    await db.flush()
    await db.refresh(schedule)
    return schedule


async def soft_delete(db: AsyncSession, *, schedule: RentSchedule) -> None:
    schedule.deleted_at = _dt.datetime.now(_dt.timezone.utc)
    await db.flush()
