"""Name why a rent reminder didn't go out, as the short code stored on its row.

The code is what the operator's alert and the app's labels are keyed on, so
every way a send can fail maps to exactly one of them here: ``failure_code``
when the send itself raised, ``delivery_failure_code`` when Twilio reports
afterwards that it couldn't deliver the text.
"""
from __future__ import annotations

from platform_shared.services.email_service import EmailNotConfiguredError, EmailSendError
from platform_shared.services.sms_service import SmsNotConfiguredError, SmsSendError

from app.core.rent_reminder_constants import (
    ERROR_EMAIL_NOT_CONFIGURED,
    ERROR_EMAIL_OUTCOME_UNKNOWN,
    ERROR_EMAIL_SEND_FAILED,
    ERROR_SMS_NOT_CONFIGURED,
    ERROR_SMS_OUTCOME_UNKNOWN,
    ERROR_UNEXPECTED,
    SMS_FAILED_CODE_PREFIX,
    SMS_FAILED_UNKNOWN_DETAIL,
    SMS_REFUSED_CODE_PREFIX,
)
from app.core.twilio_error_code import is_twilio_error_code


class ReminderUndeliverable(Exception):
    """The reminder can't go out at all. ``code`` says why: no recipient, a bad number, texts off."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def failure_code(exc: Exception) -> str:
    """The ``error_code`` for a send that raised ``exc``."""
    if isinstance(exc, ReminderUndeliverable):
        return exc.code
    if isinstance(exc, SmsSendError):
        if exc.outcome_unknown:
            return ERROR_SMS_OUTCOME_UNKNOWN
        return f"{SMS_REFUSED_CODE_PREFIX}{exc.provider_code or exc.code or 'send_failed'}"
    if isinstance(exc, SmsNotConfiguredError):
        return ERROR_SMS_NOT_CONFIGURED
    if isinstance(exc, EmailNotConfiguredError):
        return ERROR_EMAIL_NOT_CONFIGURED
    if isinstance(exc, EmailSendError):
        if exc.delivery_unconfirmed:
            return ERROR_EMAIL_OUTCOME_UNKNOWN
        return ERROR_EMAIL_SEND_FAILED
    return ERROR_UNEXPECTED


def delivery_failure_code(twilio_error_code: str | None) -> str:
    """The row's code for a text Twilio couldn't deliver: ``sms_failed: 30007``."""
    detail = (twilio_error_code or "").strip()
    if not is_twilio_error_code(detail):
        detail = SMS_FAILED_UNKNOWN_DETAIL
    return f"{SMS_FAILED_CODE_PREFIX}{detail}"
