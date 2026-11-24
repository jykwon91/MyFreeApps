"""Only the account set in SMS_SENDER_USER_ID may send rent reminders by text."""
import uuid
from unittest.mock import patch

import pytest

from app.core.config import settings
from app.services.rent.rent_reminder_sms_permission import may_send_texts

SENDER = uuid.uuid4()


@pytest.mark.parametrize(
    ("configured", "user_id", "allowed"),
    [
        (str(SENDER), SENDER, True),
        (str(SENDER).upper(), SENDER, True),
        (f"  {SENDER}  ", SENDER, True),
        (str(SENDER), uuid.uuid4(), False),
        ("", SENDER, False),
        ("not-a-uuid", SENDER, False),
    ],
    ids=["the_sender", "upper_case_id", "padded_id", "another_account", "unset", "invalid"],
)
def test_may_send_texts(configured: str, user_id: uuid.UUID, allowed: bool) -> None:
    with patch.object(settings, "sms_sender_user_id", configured):
        assert may_send_texts(user_id) is allowed
