"""Fail rent reminders that never got an outcome, and tell the operator.

All data access goes through repositories; this module never imports SQLAlchemy.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid

from app.core.rent_reminder_constants import (
    ERROR_NO_PHONE_CONFIRMATION,
    ERROR_SEND_INTERRUPTED,
    SMS_CONFIRMATION_TIMEOUT_MINUTES,
)
from app.db.session import unit_of_work
from app.repositories.rent import rent_reminder_send_repo
from app.services.rent import rent_reminder_alert_service as alerts

logger = logging.getLogger(__name__)


def _now() -> _dt.datetime:
    return _dt.datetime.now(_dt.UTC)


async def run_watchdog(now: _dt.datetime | None = None) -> int:
    """Fail reminders that never got an outcome, and tell the operator.

    ``sent_to_phone`` with no phone confirmation in time means the phone is
    off, offline, or asleep (``no_phone_confirmation``); a ``queued`` row that
    old means the worker died mid-send (``send_interrupted``).
    """
    moment = now or _now()
    cutoff = moment - _dt.timedelta(minutes=SMS_CONFIRMATION_TIMEOUT_MINUTES)
    failed: list[tuple[uuid.UUID, int]] = []
    async with unit_of_work() as db:
        for row in await rent_reminder_send_repo.list_unconfirmed(db, older_than=cutoff):
            send_id, attempt, status = row.id, row.attempt, row.status
            code = (
                ERROR_NO_PHONE_CONFIRMATION
                if status == "sent_to_phone"
                else ERROR_SEND_INTERRUPTED
            )
            # The phone may confirm between the read and this write; then the
            # confirmation stands and nobody is alerted.
            if not await rent_reminder_send_repo.mark_failed(
                db, row=row, error_code=code, seen_status=status, seen_attempt=attempt,
            ):
                continue
            logger.warning(
                "Rent reminder unconfirmed: send_id=%s channel=%s status=%s code=%s",
                send_id, row.channel, status, code,
            )
            failed.append((send_id, attempt))
    for send_id, attempt in failed:
        try:
            await alerts.alert_operator(send_id, attempt)
        except Exception:  # one alert failing must not stop the rest
            logger.exception("Could not alert the operator about reminder %s", send_id)
    return len(failed)
