"""Repository for ``rent_reminder_plans``."""
from __future__ import annotations

import datetime as _dt
import uuid
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.rent.rent_reminder_plan import RentReminderPlan

# Columns a caller may set through ``create`` / ``update``. Everything else
# (ids, tenancy, timestamps, soft delete) is owned by this module.
EDITABLE_FIELDS: frozenset[str] = frozenset({
    "frequency",
    "due_weekday",
    "send_days_before",
    "send_time",
    "timezone",
    "email_enabled",
    "sms_enabled",
    "amount_override",
    "payment_instructions",
    "is_active",
})


def _check_fields(fields: dict[str, object]) -> None:
    unknown = set(fields) - EDITABLE_FIELDS
    if unknown:
        raise ValueError(f"unsupported reminder plan fields: {sorted(unknown)}")


async def create(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    applicant_id: uuid.UUID,
    fields: dict[str, object],
) -> RentReminderPlan:
    _check_fields(fields)
    plan = RentReminderPlan(
        user_id=user_id,
        organization_id=organization_id,
        applicant_id=applicant_id,
        **fields,
    )
    db.add(plan)
    await db.flush()
    await db.refresh(plan)
    return plan


async def get_for_applicant(
    db: AsyncSession, *, organization_id: uuid.UUID, applicant_id: uuid.UUID,
) -> RentReminderPlan | None:
    result = await db.execute(
        select(RentReminderPlan).where(
            RentReminderPlan.organization_id == organization_id,
            RentReminderPlan.applicant_id == applicant_id,
            RentReminderPlan.deleted_at.is_(None),
        ),
    )
    return result.scalar_one_or_none()


async def get_by_id(db: AsyncSession, *, plan_id: uuid.UUID) -> RentReminderPlan | None:
    """Unscoped lookup — for the scheduler, which already holds the plan id."""
    result = await db.execute(
        select(RentReminderPlan).where(
            RentReminderPlan.id == plan_id,
            RentReminderPlan.deleted_at.is_(None),
        ),
    )
    return result.scalar_one_or_none()


async def list_active(db: AsyncSession) -> Sequence[RentReminderPlan]:
    """Every live, switched-on plan across all organizations (scheduler sweep)."""
    result = await db.execute(
        select(RentReminderPlan)
        .where(
            RentReminderPlan.deleted_at.is_(None),
            RentReminderPlan.is_active.is_(True),
        )
        .order_by(RentReminderPlan.created_at),
    )
    return result.scalars().all()


async def update(
    db: AsyncSession, *, plan: RentReminderPlan, fields: dict[str, object],
) -> RentReminderPlan:
    _check_fields(fields)
    for key, value in fields.items():
        setattr(plan, key, value)
    await db.flush()
    await db.refresh(plan)
    return plan


async def soft_delete(db: AsyncSession, *, plan: RentReminderPlan) -> None:
    plan.deleted_at = _dt.datetime.now(_dt.timezone.utc)
    await db.flush()
