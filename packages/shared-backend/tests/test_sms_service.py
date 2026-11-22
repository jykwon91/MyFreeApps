"""Tests for platform_shared.services.sms_service.

Covers:
- ``is_configured()`` truth table -- all three Twilio fields must be set.
- Best-effort ``send()`` returning bool (caller continues on failure).
- Critical-path ``send_or_raise()`` raising on any failure (caller handles).
- Twilio error codes captured + embedded in SmsSendError per
  rules/check-third-party-error-codes.md.
- ValueError on empty inputs.
- Only a failure to connect is a definite "not sent"; a Twilio 5xx or any
  failure after the request may have reached Twilio is ``outcome_unknown``.
  The transport cases run through the real requests/urllib3 stack, with only
  the socket layer faked, so the classification matches what the SDK raises.
"""
from __future__ import annotations

import logging
import socket
import ssl
from unittest.mock import MagicMock, patch

import pytest
import requests
from twilio.base.exceptions import TwilioRestException
from urllib3.exceptions import (
    ConnectTimeoutError,
    MaxRetryError,
    NameResolutionError,
    NewConnectionError,
    ProtocolError,
    ReadTimeoutError,
    SSLError,
)

from platform_shared.core.sms_constants import TWILIO_HTTP_TIMEOUT_SECONDS
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

        args, kwargs = mock_cls.call_args
        assert args == (service.account_sid, service.auth_token)
        # Twilio's SDK default is no timeout; the client must carry ours.
        assert kwargs["http_client"].timeout == TWILIO_HTTP_TIMEOUT_SECONDS
        mock_client.messages.create.assert_called_once_with(
            to="+15559876543",
            from_=service.from_number,
            body="Your pizza is ready!",
        )
        assert sid == "SM-fake-sid-1234"

    def test_raises_send_error_on_twilio_rejection(self) -> None:
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
        # Not chained: Twilio's own text can quote the number (see below).
        assert exc.value.__cause__ is None
        assert exc.value.__suppress_context__ is True

    def test_raises_send_error_on_generic_exception(self) -> None:
        """Non-Twilio exceptions (network errors, timeouts, bad replies) still
        raise SmsSendError so callers have a single exception type to handle.
        One that isn't a failure to connect may have come after Twilio took
        the message, so its outcome is unknown."""
        service = _configured_service()
        underlying = RuntimeError("unexpected reply")

        mock_client = MagicMock()
        mock_client.messages.create.side_effect = underlying

        with patch("twilio.rest.Client", return_value=mock_client):
            with pytest.raises(SmsSendError) as exc:
                service.send_or_raise("+15559876543", "body")

        assert "unexpected reply" in str(exc.value)
        assert exc.value.__cause__ is underlying
        assert exc.value.outcome_unknown is True


    def test_http_timeout_is_applied_to_the_real_request(self) -> None:
        """The timeout reaches the underlying ``requests`` call, and a timeout
        surfaces as SmsSendError with the exception type in the log."""
        service = _configured_service()
        with patch(
            "requests.Session.send", side_effect=requests.exceptions.ReadTimeout("slow"),
        ) as send:
            with pytest.raises(SmsSendError) as exc:
                service.send_or_raise("+15559876543", "body")

        assert send.call_args.kwargs["timeout"] == TWILIO_HTTP_TIMEOUT_SECONDS
        assert isinstance(exc.value.__cause__, requests.exceptions.ReadTimeout)


class TestOutcomeClassification:
    """Which failures mean "not sent" and which mean "may have been sent"."""

    @pytest.mark.parametrize(
        "socket_error",
        [
            socket.gaierror(-2, "Name or service not known"),
            ConnectionRefusedError(61, "Connection refused"),
            TimeoutError("timed out"),
        ],
        ids=["dns", "refused", "connect_timeout"],
    )
    def test_failure_to_connect_is_a_definite_not_sent(
        self, socket_error: OSError,
    ) -> None:
        with (
            patch("urllib3.util.connection.create_connection", side_effect=socket_error),
            pytest.raises(SmsSendError) as exc,
        ):
            _configured_service().send_or_raise("+15559876543", "body")

        assert exc.value.outcome_unknown is False
        assert exc.value.provider_code == "network_error"

    def test_tls_error_is_an_unknown_outcome(self) -> None:
        """urllib3 reports an SSLError for TLS trouble at any point, not only
        a refused handshake, so it can't prove the text never left."""
        with (
            patch("urllib3.connection.ssl_wrap_socket", side_effect=ssl.SSLError("handshake failed")),
            pytest.raises(SmsSendError) as exc,
        ):
            _configured_service().send_or_raise("+15559876543", "body")

        assert isinstance(exc.value.__cause__, requests.exceptions.SSLError)
        assert exc.value.outcome_unknown is True
        assert exc.value.provider_code == "outcome_unknown"

    @pytest.mark.parametrize(
        ("reason", "never_sent"),
        [
            (ConnectTimeoutError("connect timed out"), True),
            (NewConnectionError(None, "refused"), True),
            (NameResolutionError("api.twilio.com", None, socket.gaierror(-2, "dns")), True),
            (SSLError("bad record mac"), False),
            (ProtocolError("connection aborted"), False),
        ],
        ids=["connect_timeout", "new_connection", "name_resolution", "ssl", "protocol"],
    )
    def test_only_connect_failures_count_as_never_sent(
        self, reason: Exception, never_sent: bool,
    ) -> None:
        wrapped = requests.exceptions.ConnectionError(
            MaxRetryError(None, "/Messages", reason=reason),
        )
        with (
            patch("requests.Session.send", side_effect=wrapped),
            pytest.raises(SmsSendError) as exc,
        ):
            _configured_service().send_or_raise("+15559876543", "body")

        assert exc.value.outcome_unknown is (not never_sent)

    def test_twilio_message_quoting_the_number_never_reaches_logs_or_the_error(self, caplog) -> None:
        mock_client = MagicMock()
        mock_client.messages.create.side_effect = TwilioRestException(
            status=400, uri="/Messages", msg="Invalid 'To' Phone Number: +1 555-987-6543", code=21211,
        )
        with (
            patch("twilio.rest.Client", return_value=mock_client),
            caplog.at_level(logging.DEBUG),
            pytest.raises(SmsSendError) as exc,
        ):
            _configured_service().send_or_raise("+15559876543", "body")

        logged = " ".join(r.getMessage() for r in caplog.records)
        for shown in (logged, str(exc.value)):
            assert "6543" not in shown
            assert "+1 555" not in shown
        assert "code=21211" in logged
        assert str(exc.value) == (
            "Twilio rejected SMS (code=21211 status=400): Invalid 'To' Phone Number: [phone number]"
        )

    def test_logging_the_twilio_error_with_its_traceback_never_shows_the_number(self, caplog) -> None:
        """Callers log the error with ``exc_info`` (and Sentry captures it);
        the Twilio exception and its URI must not ride along."""
        mock_client = MagicMock()
        mock_client.messages.create.side_effect = TwilioRestException(
            status=400,
            uri="/Accounts/AC1/Messages.json?To=%2B15559876543",
            msg="Invalid 'To' Phone Number: +15559876543",
            code=21211,
        )
        with (
            patch("twilio.rest.Client", return_value=mock_client),
            caplog.at_level(logging.DEBUG),
        ):
            assert _configured_service().send("+15559876543", "body") is False

        assert "Best-effort SMS send failed" in caplog.text
        assert "Traceback" in caplog.text
        assert "5559876543" not in caplog.text
        assert "TwilioRestException" not in caplog.text

    @pytest.mark.parametrize(
        "after_connect_error",
        [
            ReadTimeoutError(None, "/Messages.json", "Read timed out."),
            ConnectionResetError(54, "Connection reset by peer"),
            ProtocolError("Connection aborted.", ConnectionResetError(54, "reset")),
        ],
        ids=["read_timeout", "reset", "aborted"],
    )
    def test_failure_after_the_request_went_out_is_outcome_unknown(
        self, after_connect_error: Exception, caplog,
    ) -> None:
        with (
            patch(
                "urllib3.connectionpool.HTTPConnectionPool._make_request",
                side_effect=after_connect_error,
            ),
            caplog.at_level(logging.WARNING),
            pytest.raises(SmsSendError) as exc,
        ):
            _configured_service().send_or_raise("+15559876543", "Pizza ready")

        assert exc.value.outcome_unknown is True
        assert exc.value.provider_code == "outcome_unknown"
        logged = " ".join(r.getMessage() for r in caplog.records)
        assert "+15559876543" not in logged
        assert "Pizza ready" not in logged

    @pytest.mark.parametrize("status,unknown", [(500, True), (503, True), (400, False), (429, False)])
    def test_twilio_server_error_is_outcome_unknown(self, status: int, unknown: bool) -> None:
        mock_client = MagicMock()
        mock_client.messages.create.side_effect = TwilioRestException(
            status=status, uri="/Messages", msg="boom", code=20500 if status >= 500 else 21211,
        )
        with (
            patch("twilio.rest.Client", return_value=mock_client),
            pytest.raises(SmsSendError) as exc,
        ):
            _configured_service().send_or_raise("+15559876543", "body")

        assert exc.value.outcome_unknown is unknown
        assert exc.value.status == status


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
