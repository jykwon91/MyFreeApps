"""What has happened so far to one reminder (one plan, one due date)."""
from __future__ import annotations

import datetime as _dt
import uuid

from app.core.rent_reminder_channel import RentReminderChannel
from app.core.rent_reminder_constants import MAY_STILL_ARRIVE_ERRORS
from app.core.rent_reminder_enums import (
    RENT_REMINDER_CHANNEL_EMAIL,
    RENT_REMINDER_CHANNEL_SMS,
    RENT_REMINDER_CHANNELS,
)
from app.models.rent.rent_reminder_plan import RentReminderPlan
from app.models.rent.rent_reminder_send import RentReminderSend
from app.repositories.rent import rent_reminder_send_repo
from app.schemas.rent.rent_reminder_possibly_sent import RentReminderPossiblySent


def enabled_channels(plan: RentReminderPlan) -> list[RentReminderChannel]:
    switches = (
        (RENT_REMINDER_CHANNEL_EMAIL, plan.email_enabled),
        (RENT_REMINDER_CHANNEL_SMS, plan.sms_enabled),
    )
    return [channel for channel, enabled in switches if enabled]


async def existing_rows(
    db, *, plan_id: uuid.UUID, due_date: _dt.date,
) -> dict[RentReminderChannel, RentReminderSend]:
    """Send rows already recorded for this due date, keyed by channel."""
    rows: dict[RentReminderChannel, RentReminderSend] = {}
    for channel in RENT_REMINDER_CHANNELS:
        row = await rent_reminder_send_repo.get_by_key(
            db, plan_id=plan_id, due_date=due_date, channel=channel,
        )
        if row is not None:
            rows[channel] = row
    return rows


def possibly_sent(
    rows: dict[RentReminderChannel, RentReminderSend], channels: list[RentReminderChannel],
) -> list[RentReminderPossiblySent]:
    """Enabled channels whose failed try may still have reached the tenant.

    A switched-off channel isn't resent by Send now, so it isn't warned about
    or asked to be confirmed either. The preview and Send now's check both
    come from here, so they always agree.
    """
    return [
        RentReminderPossiblySent(channel=channel, attempt=rows[channel].attempt)
        for channel in RENT_REMINDER_CHANNELS
        if channel in channels
        and channel in rows
        and rows[channel].status == "failed"
        and rows[channel].error_code in MAY_STILL_ARRIVE_ERRORS
    ]
