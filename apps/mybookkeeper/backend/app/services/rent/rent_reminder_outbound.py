"""One reminder send, ready to deliver."""
from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.core.rent_reminder_channel import RentReminderChannel

from app.services.rent.rent_reminder_recipients import ReminderRecipients


@dataclass(frozen=True)
class ReminderOutbound:
    """Everything delivery needs, snapshotted so no session stays open."""

    send_id: uuid.UUID
    # The row's try number, carried on the text's status-callback URL.
    attempt: int
    channel: RentReminderChannel
    subject: str
    body: str
    recipients: ReminderRecipients
    operator_email: str | None
    # Whether the plan's owner may send texts (``rent_reminder_sms_permission``).
    owner_may_text: bool
