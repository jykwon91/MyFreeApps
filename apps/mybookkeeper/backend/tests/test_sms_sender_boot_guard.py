"""The sender boot guard: with Twilio sending, SMS_SENDER_USER_ID must name a
valid account; the console backend may leave it unset, never invalid."""
from __future__ import annotations

import uuid

import pytest

from app.core.sms_sender_boot_guard import check_sms_sender_configured
from app.core.sms_sender_not_configured_error import SmsSenderNotConfiguredError


def test_twilio_with_a_valid_sender_boots() -> None:
    check_sms_sender_configured(sms_backend="twilio", sms_sender_user_id=str(uuid.uuid4()))


@pytest.mark.parametrize("raw", ["", "   "], ids=["empty", "blank"])
def test_twilio_with_no_sender_refuses_and_names_the_env_var(raw: str) -> None:
    with pytest.raises(SmsSenderNotConfiguredError, match="SMS_SENDER_USER_ID"):
        check_sms_sender_configured(sms_backend="twilio", sms_sender_user_id=raw)


@pytest.mark.parametrize("backend", ["twilio", "console"])
def test_an_invalid_sender_id_refuses(backend: str) -> None:
    with pytest.raises(SmsSenderNotConfiguredError, match="SMS_SENDER_USER_ID"):
        check_sms_sender_configured(sms_backend=backend, sms_sender_user_id="not-a-uuid")


def test_console_with_no_sender_boots() -> None:
    check_sms_sender_configured(sms_backend="console", sms_sender_user_id="")
