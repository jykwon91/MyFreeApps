"""Fail rent reminders that never got an outcome, and tell the operator.

All data access goes through repositories; this module never imports SQLAlchemy.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid

from platform_shared.core.audit_actor import audit_actor

from app.core.rent_reminder_constants import (
    ERROR_NO_SMS_CONFIRMATION,
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

    ``sent_to_provider`` with no confirmation from Twilio in time means its
    status callbacks aren't reaching us (``no_sms_confirmation``); the text may
    still have gone out. A ``queued`` row that old means the worker died
    mid-send (``send_interrupted``).

    The sweep runs for no signed-in user, so each row's writes are audited as
    the row's owner.
    """
    moment = now or _now()
    cutoff = moment - _dt.timedelta(minutes=SMS_CONFIRMATION_TIMEOUT_MINUTES)
    failed: list[tuple[uuid.UUID, int, uuid.UUID]] = []
    async with unit_of_work() as db:
        for row in await rent_reminder_send_repo.list_unconfirmed(db, older_than=cutoff):
            send_id, attempt, status, owner_id = row.id, row.attempt, row.status, row.user_id
            code = (
                ERROR_NO_SMS_CONFIRMATION
                if status == "sent_to_provider"
                else ERROR_SEND_INTERRUPTED
            )
            # Twilio may confirm between the read and this write; then the
            # confirmation stands and nobody is alerted.
            with audit_actor(owner_id):
                recorded = await rent_reminder_send_repo.mark_failed(
                    db, row=row, error_code=code, seen_status=status, seen_attempt=attempt,
                )
            if not recorded:
                continue
            logger.warning(
                "Rent reminder unconfirmed: send_id=%s channel=%s status=%s code=%s",
                send_id, row.channel, status, code,
            )
            failed.append((send_id, attempt, owner_id))
    for send_id, attempt, owner_id in failed:
        try:
            with audit_actor(owner_id):
                await alerts.alert_operator(send_id, attempt)
        except Exception:  # one alert failing must not stop the rest
            logger.exception("Could not alert the operator about reminder %s", send_id)
    return len(failed)
