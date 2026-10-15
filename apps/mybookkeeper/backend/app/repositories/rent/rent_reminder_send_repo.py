"""Repository for ``rent_reminder_sends`` — the reminder send log."""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal
from typing import Sequence

from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rent_reminder_constants import MAX_ERROR_CODE_LENGTH
from app.models.rent.rent_reminder_send import RentReminderSend


class ReminderAlreadyClaimedError(LookupError):
    """A row for this (plan, due date, channel) already exists."""


def _now() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc)


async def get_by_key(
    db: AsyncSession, *, plan_id: uuid.UUID, due_date: _dt.date, channel: str,
) -> RentReminderSend | None:
    result = await db.execute(
        select(RentReminderSend).where(
            RentReminderSend.plan_id == plan_id,
            RentReminderSend.due_date == due_date,
            RentReminderSend.channel == channel,
        ),
    )
    return result.scalar_one_or_none()


async def claim(
    db: AsyncSession,
    *,
    plan_id: uuid.UUID,
    applicant_id: uuid.UUID,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    due_date: _dt.date,
    channel: str,
    amount: Decimal,
    message_body: str,
) -> RentReminderSend:
    """Insert a ``queued`` row for this reminder, or raise if one exists.

    The read catches the ordinary rerun; the unique constraint catches a true
    race (two writers between the read and the insert). Either way the caller
    gets ``ReminderAlreadyClaimedError`` and must not send. The caller runs the
    claim in its own transaction, so a constraint violation only rolls back the
    claim itself.
    """
    if await get_by_key(db, plan_id=plan_id, due_date=due_date, channel=channel):
        raise ReminderAlreadyClaimedError(f"{plan_id}/{due_date}/{channel}")
    row = RentReminderSend(
        plan_id=plan_id,
        applicant_id=applicant_id,
        organization_id=organization_id,
        user_id=user_id,
        due_date=due_date,
        channel=channel,
        status="queued",
        amount=amount,
        message_body=message_body,
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise ReminderAlreadyClaimedError(f"{plan_id}/{due_date}/{channel}") from exc
    await db.refresh(row)
    return row


async def requeue(
    db: AsyncSession, *, row: RentReminderSend, amount: Decimal, message_body: str,
) -> RentReminderSend:
    """Reset a failed row for a manual retry (the unique key forbids a new row)."""
    row.status = "queued"
    row.amount = amount
    row.message_body = message_body
    row.error_code = None
    row.provider_message_id = None
    row.sent_at = None
    row.confirmed_at = None
    row.operator_alerted_at = None
    await db.flush()
    return row


async def get(db: AsyncSession, *, send_id: uuid.UUID) -> RentReminderSend | None:
    result = await db.execute(select(RentReminderSend).where(RentReminderSend.id == send_id))
    return result.scalar_one_or_none()


async def get_by_provider_message_id(
    db: AsyncSession, *, provider_message_id: str,
) -> RentReminderSend | None:
    result = await db.execute(
        select(RentReminderSend).where(
            RentReminderSend.provider_message_id == provider_message_id,
        ),
    )
    return result.scalar_one_or_none()


async def list_for_applicant(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    applicant_id: uuid.UUID,
    limit: int,
) -> Sequence[RentReminderSend]:
    result = await db.execute(
        select(RentReminderSend)
        .where(
            RentReminderSend.organization_id == organization_id,
            RentReminderSend.applicant_id == applicant_id,
        )
        .order_by(RentReminderSend.created_at.desc(), RentReminderSend.id)
        .limit(limit),
    )
    return result.scalars().all()


async def list_unconfirmed(
    db: AsyncSession, *, older_than: _dt.datetime,
) -> Sequence[RentReminderSend]:
    """Rows still owed an outcome whose deadline has passed.

    A ``queued`` row is late once it was claimed before ``older_than`` (the
    send never completed); a ``sent_to_phone`` row once it was handed to the
    phone before ``older_than`` with no confirmation since.
    """
    result = await db.execute(
        select(RentReminderSend)
        .where(
            or_(
                and_(
                    RentReminderSend.status == "queued",
                    RentReminderSend.created_at < older_than,
                ),
                and_(
                    RentReminderSend.status == "sent_to_phone",
                    RentReminderSend.sent_at < older_than,
                ),
            ),
        )
        .order_by(RentReminderSend.created_at),
    )
    return result.scalars().all()


async def mark_sent(db: AsyncSession, *, row: RentReminderSend) -> None:
    row.status = "sent"
    row.sent_at = _now()
    await db.flush()


async def mark_sent_to_phone(
    db: AsyncSession, *, row: RentReminderSend, provider_message_id: str,
) -> None:
    row.status = "sent_to_phone"
    row.provider_message_id = provider_message_id[:64]
    row.sent_at = _now()
    await db.flush()


async def mark_confirmed(db: AsyncSession, *, row: RentReminderSend, status: str) -> None:
    """Record a phone-side confirmation (``sent`` or ``delivered``).

    Clears any error: a confirmation arriving after the watchdog gave up means
    the text did go out after all.
    """
    row.status = status
    row.error_code = None
    row.confirmed_at = _now()
    await db.flush()


async def mark_failed(db: AsyncSession, *, row: RentReminderSend, error_code: str) -> None:
    row.status = "failed"
    row.error_code = error_code[:MAX_ERROR_CODE_LENGTH]
    await db.flush()


async def mark_operator_alerted(db: AsyncSession, *, row: RentReminderSend) -> None:
    row.operator_alerted_at = _now()
    await db.flush()
