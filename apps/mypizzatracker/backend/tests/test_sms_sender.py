"""Unit tests for the MPT app-level SMS routing wrapper.

The shared SmsService is exercised in
packages/shared-backend/tests/test_sms_service.py; here we cover the
console-vs-twilio routing layer that the rest of the app uses.
"""
from __future__ import annotations

import logging
from unittest.mock import patch

import pytest

from app.core.config import settings
from app.services.sms import sms_sender
from app.services.sms.sms_sender import send_sms, send_sms_or_raise
from platform_shared.services.sms_service import SmsNotConfiguredError


class TestConsoleBackend:
    """When sms_backend == 'console', sends log to stdout and return success."""

    def test_send_logs_and_returns_true(self, caplog) -> None:
        caplog.set_level(logging.INFO, logger=sms_sender.__name__)
        with patch.object(settings, "sms_backend", "console"):
            ok = send_sms("+15559876543", "Your pizza is ready!")
        assert ok is True
        joined = " ".join(r.getMessage() for r in caplog.records)
        assert "[sms:console]" in joined
        assert "+15559876543" in joined

    def test_send_or_raise_returns_none(self) -> None:
        with patch.object(settings, "sms_backend", "console"):
            sid = send_sms_or_raise("+15559876543", "Your pizza is ready!")
        assert sid is None

    def test_send_empty_to_returns_false(self) -> None:
        with patch.object(settings, "sms_backend", "console"):
            assert send_sms("", "body") is False

    def test_send_or_raise_empty_to_raises(self) -> None:
        with patch.object(settings, "sms_backend", "console"):
            with pytest.raises(ValueError):
                send_sms_or_raise("", "body")


class TestTwilioBackend:
    """When sms_backend == 'twilio', sends delegate to SmsService."""

    def test_send_calls_twilio_service(self) -> None:
        with patch.object(settings, "sms_backend", "twilio"), \
             patch.object(settings, "twilio_account_sid", "AC1"), \
             patch.object(settings, "twilio_auth_token", "tok"), \
             patch.object(settings, "twilio_from_number", "+15551234567"), \
             patch(
                 "platform_shared.services.sms_service.SmsService.send",
                 return_value=True,
             ) as mock_send:
            ok = send_sms("+15559876543", "body")
        assert ok is True
        mock_send.assert_called_once_with("+15559876543", "body")

    def test_send_or_raise_propagates_not_configured(self) -> None:
        with patch.object(settings, "sms_backend", "twilio"), \
             patch.object(settings, "twilio_account_sid", ""), \
             patch.object(settings, "twilio_auth_token", ""), \
             patch.object(settings, "twilio_from_number", ""):
            with pytest.raises(SmsNotConfiguredError):
                send_sms_or_raise("+15559876543", "body")
