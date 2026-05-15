"""Tests for platform_shared.services.sms_service.

Covers:
- ``is_configured()`` truth table -- all three Twilio fields must be set.
- Best-effort ``send()`` returning bool (caller continues on failure).
- Critical-path ``send_or_raise()`` raising on any failure (caller handles).
- Twilio error codes captured + embedded in SmsSendError per
  rules/check-third-party-error-codes.md.
- ValueError on empty inputs.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from platform_shared.services.sms_service import (
    SmsNotConfiguredError,
    SmsSendError,
    SmsService,
)


def _configured_service() -> SmsService:
    return SmsService(
        account_sid="ACfake1234567890fake1234567890abcd",
        auth_token="fake-auth-token-x" * 2,
        from_number="+15551234567",
    )


class TestIsConfigured:
    def test_all_three_fields_set_is_configured(self) -> None:
        assert _configured_service().is_configured() is True

    def test_missing_sid_is_not_configured(self) -> None:
        s = _configured_service()
        s.account_sid = ""
        assert s.is_configured() is False

    def test_missing_token_is_not_configured(self) -> None:
        s = _configured_service()
        s.auth_token = ""
        assert s.is_configured() is False

    def test_missing_from_number_is_not_configured(self) -> None:
        s = _configured_service()
        s.from_number = ""
        assert s.is_configured() is False

    def test_empty_default_is_not_configured(self) -> None:
        assert SmsService().is_configured() is False


class TestSendOrRaise:
    def test_raises_value_error_for_empty_to(self) -> None:
        service = _configured_service()
        with pytest.raises(ValueError):
            service.send_or_raise("", "body")

    def test_raises_value_error_for_empty_body(self) -> None:
        service = _configured_service()
        with pytest.raises(ValueError):
            service.send_or_raise("+15559876543", "")

    def test_raises_not_configured_when_creds_missing(self) -> None:
        service = SmsService()
        with pytest.raises(SmsNotConfiguredError):
            service.send_or_raise("+15559876543", "body")

    def test_returns_sid_on_success(self) -> None:
        service = _configured_service()
        mock_client = MagicMock()
        mock_client.messages.create.return_value = MagicMock(sid="SM-fake-sid-1234")

        with patch("twilio.rest.Client", return_value=mock_client) as mock_cls:
            sid = service.send_or_raise("+15559876543", "Your pizza is ready!")

        mock_cls.assert_called_once_with(service.account_sid, service.auth_token)
        mock_client.messages.create.assert_called_once_with(
            to="+15559876543",
            from_=service.from_number,
            body="Your pizza is ready!",
        )
        assert sid == "SM-fake-sid-1234"

    def test_raises_send_error_on_twilio_rejection(self) -> None:
        from twilio.base.exceptions import TwilioRestException

        service = _configured_service()
        underlying = TwilioRestException(
            status=400,
            uri="/Messages",
            msg="The 'To' number is not a valid mobile number.",
            code=21211,
        )

        mock_client = MagicMock()
        mock_client.messages.create.side_effect = underlying

        with patch("twilio.rest.Client", return_value=mock_client):
            with pytest.raises(SmsSendError) as exc:
                service.send_or_raise("+invalid", "body")

        # Twilio error code embedded in the message per
        # rules/check-third-party-error-codes.md so callers can route
        # without importing the Twilio SDK.
        assert "21211" in str(exc.value)
        assert exc.value.code == 21211
        assert exc.value.status == 400
        # __cause__ chain preserved for Sentry diagnostics
        assert exc.value.__cause__ is underlying

    def test_raises_send_error_on_generic_exception(self) -> None:
        """Non-Twilio exceptions (network errors, timeouts) still raise
        SmsSendError so callers have a single exception type to handle."""
        service = _configured_service()
        underlying = OSError("connection refused")

        mock_client = MagicMock()
        mock_client.messages.create.side_effect = underlying

        with patch("twilio.rest.Client", return_value=mock_client):
            with pytest.raises(SmsSendError) as exc:
                service.send_or_raise("+15559876543", "body")

        assert "connection refused" in str(exc.value)
        assert exc.value.__cause__ is underlying


class TestSend:
    def test_returns_true_on_success(self) -> None:
        service = _configured_service()
        mock_client = MagicMock()
        mock_client.messages.create.return_value = MagicMock(sid="SM-ok")

        with patch("twilio.rest.Client", return_value=mock_client):
            assert service.send("+15559876543", "body") is True

    def test_returns_false_when_unconfigured(self) -> None:
        assert SmsService().send("+15559876543", "body") is False

    def test_returns_false_for_empty_to(self) -> None:
        assert _configured_service().send("", "body") is False

    def test_returns_false_for_empty_body(self) -> None:
        assert _configured_service().send("+15559876543", "") is False

    def test_returns_false_on_twilio_rejection(self) -> None:
        from twilio.base.exceptions import TwilioRestException

        service = _configured_service()
        mock_client = MagicMock()
        mock_client.messages.create.side_effect = TwilioRestException(
            status=400, uri="/Messages", msg="rejected", code=21610,
        )

        with patch("twilio.rest.Client", return_value=mock_client):
            assert service.send("+15559876543", "body") is False


class TestInheritance:
    def test_not_configured_is_runtime_error(self) -> None:
        assert issubclass(SmsNotConfiguredError, RuntimeError)

    def test_send_error_is_runtime_error(self) -> None:
        assert issubclass(SmsSendError, RuntimeError)
