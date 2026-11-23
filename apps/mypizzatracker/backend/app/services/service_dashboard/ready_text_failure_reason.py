"""The fixed reason a failed order-ready text reports, chosen by failure class."""
from __future__ import annotations

from platform_shared.core.sms_constants import SMS_PROVIDER_CODE_NETWORK_ERROR
from platform_shared.services.sms_service import SmsSendError

from app.core.ready_text_messages import (
    READY_TEXT_OUTCOME_UNKNOWN_REASON,
    READY_TEXT_REASON_BY_TWILIO_CODE,
    READY_TEXT_REJECTED_REASON,
    READY_TEXT_UNREACHABLE_SERVICE_REASON,
)


def ready_text_failure_reason(error: SmsSendError) -> str:
    """What the dashboard says about ``error``; never its text."""
    if error.outcome_unknown:
        return READY_TEXT_OUTCOME_UNKNOWN_REASON
    if error.code is not None and error.code in READY_TEXT_REASON_BY_TWILIO_CODE:
        return READY_TEXT_REASON_BY_TWILIO_CODE[error.code]
    if error.provider_code == SMS_PROVIDER_CODE_NETWORK_ERROR:
        return READY_TEXT_UNREACHABLE_SERVICE_REASON
    return READY_TEXT_REJECTED_REASON
