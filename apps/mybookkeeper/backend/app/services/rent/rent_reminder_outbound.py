"""One reminder send, ready to deliver."""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class ReminderOutbound:
    """Everything delivery needs, snapshotted so no session stays open."""

    send_id: uuid.UUID
    # The row's try number, sent to httpSMS in the request id.
    attempt: int
    channel: Literal["email", "sms"]
    subject: str
    body: str
    tenant_email: str | None
    tenant_phone: str | None
    operator_email: str | None
