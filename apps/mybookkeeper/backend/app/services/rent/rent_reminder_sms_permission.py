"""Who may send rent reminders by text.

Every text goes out from the operator's own Twilio number, so only one account
may send them: the one set in ``SMS_SENDER_USER_ID``. With it unset, nobody
may. A plan's texts are sent as its owner (``plan.user_id``), which is who the
check is made for, on the scheduled tick as on Send now.
"""
from __future__ import annotations

import uuid

from app.core.config import settings
from app.core.sms_sender import parse_sms_sender_user_id


def may_send_texts(user_id: uuid.UUID) -> bool:
    sender = parse_sms_sender_user_id(settings.sms_sender_user_id)
    return sender is not None and user_id == sender
