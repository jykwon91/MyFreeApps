"""Every way a reminder send can fail is stored as exactly one short code."""
import pytest
from platform_shared.services.email_service import EmailNotConfiguredError, EmailSendError
from platform_shared.services.sms_service import SmsNotConfiguredError, SmsSendError

from app.core.rent_reminder_constants import (
    ERROR_EMAIL_NOT_CONFIGURED,
    ERROR_EMAIL_OUTCOME_UNKNOWN,
    ERROR_EMAIL_SEND_FAILED,
    ERROR_INVALID_PHONE,
    ERROR_SMS_NOT_CONFIGURED,
    ERROR_SMS_OUTCOME_UNKNOWN,
    ERROR_UNEXPECTED,
)
from app.services.rent.rent_reminder_failure_code import ReminderUndeliverable, failure_code


@pytest.mark.parametrize(
    ("exc", "code"),
    [
        (ReminderUndeliverable(ERROR_INVALID_PHONE), ERROR_INVALID_PHONE),
        (SmsSendError("no answer", provider_code="outcome_unknown", outcome_unknown=True), ERROR_SMS_OUTCOME_UNKNOWN),
        (SmsSendError("not a mobile number", code=21614, status=400), "sms_21614"),
        (SmsSendError("couldn't reach Twilio", provider_code="network_error"), "sms_network_error"),
        (SmsSendError("rejected"), "sms_send_failed"),
        (SmsNotConfiguredError("Twilio isn't set up"), ERROR_SMS_NOT_CONFIGURED),
        (EmailNotConfiguredError("SMTP isn't set up"), ERROR_EMAIL_NOT_CONFIGURED),
        (EmailSendError("550 mailbox unavailable", kind="recipient_rejected", smtp_code=550), ERROR_EMAIL_SEND_FAILED),
        (EmailSendError("timed out after the hand-over", kind="transient"), ERROR_EMAIL_OUTCOME_UNKNOWN),
        (RuntimeError("boom"), ERROR_UNEXPECTED),
    ],
    ids=[
        "undeliverable", "sms_outcome_unknown", "twilio_error_number", "provider_code",
        "sms_without_a_code", "sms_not_configured", "email_not_configured", "email_send_failed",
        "email_outcome_unknown",
        "anything_else",
    ],
)
def test_failure_code(exc: Exception, code: str) -> None:
    assert failure_code(exc) == code


def test_an_unknown_outcome_wins_over_a_twilio_error_number() -> None:
    """The text may still arrive, so it must never be treated as a plain failure."""
    exc = SmsSendError("timed out", code=20500, status=500, outcome_unknown=True)
    assert failure_code(exc) == ERROR_SMS_OUTCOME_UNKNOWN
