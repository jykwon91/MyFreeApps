"""A failed order-ready text reports fixed wording chosen by failure class.

Twilio's error text can quote the customer's number and is written for
developers, so the dashboard gets a short phrase for Twilio's documented
code and the real error is logged.
"""
from __future__ import annotations

import logging
import uuid

import pytest
from platform_shared.core.sms_constants import (
    SMS_PROVIDER_CODE_NETWORK_ERROR,
    SMS_PROVIDER_CODE_OUTCOME_UNKNOWN,
)
from platform_shared.services.sms_service import SmsNotConfiguredError, SmsSendError

from app.core.ready_text_messages import (
    READY_TEXT_NOT_CONFIGURED_REASON,
    READY_TEXT_OUTCOME_UNKNOWN_REASON,
    READY_TEXT_REASON_BY_TWILIO_CODE,
    READY_TEXT_REJECTED_REASON,
    READY_TEXT_UNREACHABLE_SERVICE_REASON,
)
from app.services.service_dashboard import order_ready_text
from app.services.service_dashboard.ready_text import ReadyText
from app.services.service_dashboard.ready_text_failure_reason import ready_text_failure_reason
from app.services.sms import sms_sender

RAW = "Twilio rejected SMS: The 'To' number +15125550199 is not a valid phone number."


@pytest.mark.parametrize("code", sorted(READY_TEXT_REASON_BY_TWILIO_CODE))
def test_documented_twilio_codes_get_their_phrase(code: int) -> None:
    assert ready_text_failure_reason(SmsSendError(RAW, code=code, status=400)) == READY_TEXT_REASON_BY_TWILIO_CODE[code]


@pytest.mark.parametrize(
    ("error", "expected"),
    [
        (SmsSendError(RAW, code=20003, status=401), READY_TEXT_REJECTED_REASON),
        (SmsSendError(RAW), READY_TEXT_REJECTED_REASON),
        (SmsSendError(RAW, provider_code=SMS_PROVIDER_CODE_NETWORK_ERROR), READY_TEXT_UNREACHABLE_SERVICE_REASON),
        (
            SmsSendError(RAW, provider_code=SMS_PROVIDER_CODE_OUTCOME_UNKNOWN, outcome_unknown=True),
            READY_TEXT_OUTCOME_UNKNOWN_REASON,
        ),
        (SmsSendError(RAW, code=21211, status=500, outcome_unknown=True), READY_TEXT_OUTCOME_UNKNOWN_REASON),
    ],
)
def test_other_failures_get_their_class_phrase(error: SmsSendError, expected: str) -> None:
    assert ready_text_failure_reason(error) == expected


def _send_raising(monkeypatch: pytest.MonkeyPatch, exc: Exception):
    def _raise(*args: object, **kwargs: object) -> None:
        raise exc

    monkeypatch.setattr(sms_sender, "send_sms_or_raise", _raise)
    return order_ready_text.send_ready_text(ReadyText(phone="+15125550199", body="Ready!"), uuid.uuid4())


def test_send_failure_reports_the_phrase_and_logs_the_real_error(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture,
) -> None:
    with caplog.at_level(logging.WARNING):
        outcome = _send_raising(monkeypatch, SmsSendError(RAW, code=21614, status=400))

    assert outcome.sent is False
    assert outcome.outcome_unknown is False
    assert outcome.error == READY_TEXT_REASON_BY_TWILIO_CODE[21614]
    assert "5550199" not in outcome.error
    assert "code=21614" in caplog.text
    assert "status=400" in caplog.text
    assert RAW in caplog.text


def test_unknown_outcome_keeps_its_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    outcome = _send_raising(
        monkeypatch, SmsSendError(RAW, provider_code=SMS_PROVIDER_CODE_OUTCOME_UNKNOWN, outcome_unknown=True),
    )

    assert outcome.outcome_unknown is True
    assert outcome.error == READY_TEXT_OUTCOME_UNKNOWN_REASON


def test_our_own_wording_still_reaches_the_dashboard(monkeypatch: pytest.MonkeyPatch) -> None:
    assert _send_raising(monkeypatch, SmsNotConfiguredError("TWILIO_ACCOUNT_SID unset")).error == (
        READY_TEXT_NOT_CONFIGURED_REASON
    )
    assert _send_raising(monkeypatch, ValueError("SMS body cannot be empty")).error == "SMS body cannot be empty"
