"""Repository for ``rent_reminder_sends`` — the reminder send log."""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal
from typing import Sequence

from platform_shared.repositories.audited_writes import update_rows
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
    db: AsyncSession,
    *,
    row: RentReminderSend,
    seen_attempt: int,
    seen_error_code: str | None,
    amount: Decimal,
    message_body: str,
) -> RentReminderSend:
    """Reset a failed row for a retry (the unique key forbids a new row).

    Conditional on the row still being the failed try the caller judged safe
    to retry (same try number and error code): two retries can both have read
    it as failed, and one of them may have sent it again and ended unsure
    since, so only a row nobody has touched may be sent. The try number goes
    up, so webhooks about the earlier try no longer match the row.
    """
    changed = await update_rows(
        db,
        RentReminderSend,
        RentReminderSend.id == row.id,
        RentReminderSend.status == "failed",
        RentReminderSend.attempt == seen_attempt,
        RentReminderSend.error_code.is_not_distinct_from(seen_error_code),
        values={
            "status": "queued",
            "attempt": seen_attempt + 1,
            "amount": amount,
            "message_body": message_body,
            "error_code": None,
            "provider_message_id": None,
            "sent_at": None,
            "confirmed_at": None,
            "operator_alerted_at": None,
            # The watchdog ages queued rows from here. A retry of an old row
            # must not look stuck while it is still sending.
            "created_at": _now(),
        },
    )
    if not changed:
        raise ReminderAlreadyClaimedError(str(row.id))
    return changed[0]


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


async def _update_if_unchanged(
    db: AsyncSession,
    *,
    row: RentReminderSend,
    seen_status: str,
    seen_error_code: str | None,
    seen_attempt: int,
    values: dict[str, object],
) -> bool:
    """Write ``values`` only if the row is still as the caller read it.

    Every status change reads the row (or remembers what it sent), decides,
    then writes; a webhook, the watchdog or a retry can change the row in
    between. The write is skipped (``False``) rather than overwriting that,
    and ``row`` is refreshed either way so the caller sees what is stored.
    """
    changed = await update_rows(
        db,
        RentReminderSend,
        RentReminderSend.id == row.id,
        RentReminderSend.status == seen_status,
        RentReminderSend.error_code.is_not_distinct_from(seen_error_code),
        RentReminderSend.attempt == seen_attempt,
        values=values,
    )
    if not changed:
        await db.refresh(row)
    return bool(changed)


async def confirm_if_unchanged(
    db: AsyncSession,
    *,
    row: RentReminderSend,
    status: str,
    seen_status: str,
    seen_error_code: str | None,
    seen_attempt: int,
) -> bool:
    """Record a phone-side confirmation (``sent`` or ``delivered``).

    Clears any error: a confirmation arriving after the watchdog gave up means
    the text did go out after all.
    """
    return await _update_if_unchanged(
        db,
        row=row,
        seen_status=seen_status,
        seen_error_code=seen_error_code,
        seen_attempt=seen_attempt,
        values={"status": status, "error_code": None, "confirmed_at": _now()},
    )


async def fail_if_unchanged(
    db: AsyncSession,
    *,
    row: RentReminderSend,
    error_code: str,
    seen_status: str,
    seen_error_code: str | None,
    seen_attempt: int,
) -> bool:
    """Record a failure the phone reported.

    A row already failed (we gave up without knowing) was alerted about as
    "may already have gone out"; clearing ``operator_alerted_at`` lets the
    follow-up "it definitely didn't" alert go out, once.
    """
    values: dict[str, object] = {
        "status": "failed", "error_code": error_code[:MAX_ERROR_CODE_LENGTH],
    }
    if seen_status == "failed":
        values["operator_alerted_at"] = None
    return await _update_if_unchanged(
        db,
        row=row,
        seen_status=seen_status,
        seen_error_code=seen_error_code,
        seen_attempt=seen_attempt,
        values=values,
    )


async def mark_sent(db: AsyncSession, *, row: RentReminderSend, attempt: int) -> bool:
    """Record that this try's email went out, if the try is still queued."""
    return await _update_if_unchanged(
        db,
        row=row,
        seen_status="queued",
        seen_error_code=None,
        seen_attempt=attempt,
        values={"status": "sent", "sent_at": _now()},
    )


async def mark_sent_to_phone(
    db: AsyncSession, *, row: RentReminderSend, attempt: int, provider_message_id: str,
) -> bool:
    """Record that this try's text was handed to httpSMS, if still queued.

    The phone's webhook can beat this write; a row it already confirmed (or
    failed) is never stepped back to ``sent_to_phone``.
    """
    return await _update_if_unchanged(
        db,
        row=row,
        seen_status="queued",
        seen_error_code=None,
        seen_attempt=attempt,
        values={
            "status": "sent_to_phone",
            "provider_message_id": provider_message_id[:64],
            "sent_at": _now(),
        },
    )


async def mark_failed(
    db: AsyncSession,
    *,
    row: RentReminderSend,
    error_code: str,
    seen_status: str,
    seen_attempt: int,
) -> bool:
    """Record our own failure verdict on a try that has no outcome yet.

    Used by the sender and the watchdog. If the phone confirmed or failed the
    try meanwhile, or it was retried, that news is kept.
    """
    return await _update_if_unchanged(
        db,
        row=row,
        seen_status=seen_status,
        seen_error_code=None,
        seen_attempt=seen_attempt,
        values={"status": "failed", "error_code": error_code[:MAX_ERROR_CODE_LENGTH]},
    )


async def claim_operator_alert(
    db: AsyncSession, *, row: RentReminderSend, attempt: int,
) -> _dt.datetime | None:
    """Reserve the one operator alert for this failed try, before sending it.

    Returns the claim's timestamp, or ``None`` if the alert was already
    claimed, the row moved on to another try, or it no longer failed. Two
    alerts racing for the same try can't both win the update.
    """
    claimed_at = _now()
    changed = await update_rows(
        db,
        RentReminderSend,
        RentReminderSend.id == row.id,
        RentReminderSend.status == "failed",
        RentReminderSend.attempt == attempt,
        RentReminderSend.operator_alerted_at.is_(None),
        values={"operator_alerted_at": claimed_at},
    )
    if not changed:
        await db.refresh(row)
        return None
    return claimed_at


async def release_operator_alert(
    db: AsyncSession, *, row: RentReminderSend, attempt: int, claimed_at: _dt.datetime,
) -> None:
    """Give back a claimed alert whose email couldn't be sent.

    Only our own claim on that same try is cleared, never a newer one.
    """
    changed = await update_rows(
        db,
        RentReminderSend,
        RentReminderSend.id == row.id,
        RentReminderSend.attempt == attempt,
        RentReminderSend.operator_alerted_at == claimed_at,
        values={"operator_alerted_at": None},
    )
    if not changed:
        await db.refresh(row)
