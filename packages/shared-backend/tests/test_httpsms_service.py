"""Tests for platform_shared.services.httpsms_service.

Covers:
- Send success returns the httpSMS message id and posts the documented body.
- Provider rejection -> SmsSendError carrying the HTTP status + provider_code,
  logged at WARNING (rules/check-third-party-error-codes.md).
- Connect-phase failure -> SmsSendError(provider_code="network_error"), a
  definite "not sent"; any failure after the request may have reached httpSMS
  (read/write error or timeout, 5xx, unreadable 2xx) -> outcome_unknown, so
  callers never resend it on their own.
- End-to-end encryption: on when a key is set, and the ciphertext matches the
  Android app's scheme (round-trips through the decryptor).
- Webhook JWT verification: valid accepted; unsigned / wrong key / wrong
  audience / expired rejected.
- CloudEvent parsing for the outbound-message event types.
"""
from __future__ import annotations

import datetime as _dt
import logging
from unittest.mock import patch

import httpx
import jwt
import pytest

from platform_shared.services.httpsms_service import (
    HTTPSMS_EVENT_PHONE_DELIVERED,
    HTTPSMS_EVENT_SEND_EXPIRED,
    HTTPSMS_EVENT_SEND_FAILED,
    HTTPSMS_WEBHOOK_ISSUER,
    HttpSmsService,
    HttpSmsWebhookAuthError,
    decrypt_httpsms_content,
    encrypt_httpsms_content,
    parse_httpsms_event,
    verify_httpsms_webhook,
)
from platform_shared.services.sms_service import SmsNotConfiguredError, SmsSendError

_URL = "https://app.example.com/api/rent-reminders/sms/webhook"
_SIGNING_KEY = "webhook-signing-key-for-tests"


def _service(**overrides: str) -> HttpSmsService:
    fields = {"api_key": "test-api-key", "from_number": "+15551230000"}
    fields.update(overrides)
    return HttpSmsService(**fields)


def _response(status: int, payload: object) -> httpx.Response:
    return httpx.Response(status, json=payload, request=httpx.Request("POST", "https://x"))


class TestSendOrRaise:
    def test_success_returns_message_id_and_posts_documented_body(self) -> None:
        ok = _response(200, {"status": "success", "data": {"id": "msg-123"}})
        with patch("platform_shared.services.httpsms_service.httpx.post", return_value=ok) as post:
            message_id = _service().send_or_raise("+15559876543", "Rent due", request_id="req-1")

        assert message_id == "msg-123"
        kwargs = post.call_args.kwargs
        assert post.call_args.args[0] == "https://api.httpsms.com/v1/messages/send"
        assert kwargs["headers"]["x-api-key"] == "test-api-key"
        assert kwargs["json"] == {
            "from": "+15551230000",
            "to": "+15559876543",
            "content": "Rent due",
            "encrypted": False,
            "request_id": "req-1",
        }

    def test_provider_error_raises_with_status_and_code(self, caplog) -> None:
        rejected = _response(
            422,
            {"status": "error", "message": "validation errors", "data": {"from": ["not your phone"]}},
        )
        with patch("platform_shared.services.httpsms_service.httpx.post", return_value=rejected):
            with caplog.at_level(logging.WARNING):
                with pytest.raises(SmsSendError) as exc:
                    _service().send_or_raise("+15559876543", "Rent due")

        assert exc.value.status == 422
        assert exc.value.provider_code == "http_422"
        assert "validation errors" in str(exc.value)
        assert any("http_422" in r.getMessage() for r in caplog.records)

    @pytest.mark.parametrize("status", [422, 500])
    def test_a_rejection_quoting_the_number_never_reaches_logs_or_the_error(
        self, status: int, caplog,
    ) -> None:
        rejected = _response(
            status,
            {
                "status": "error",
                "message": "cannot send to +1 555-987-6543",
                "data": {"to": ["+15559876543 is not a valid phone number"]},
            },
        )
        with (
            patch("platform_shared.services.httpsms_service.httpx.post", return_value=rejected),
            caplog.at_level(logging.DEBUG),
            pytest.raises(SmsSendError) as exc,
        ):
            _service().send_or_raise("+15559876543", "Rent due")

        logged = " ".join(r.getMessage() for r in caplog.records)
        for shown in (logged, str(exc.value)):
            assert "6543" not in shown
        assert "cannot send to [phone number]" in str(exc.value)
        assert f"http_{status}" in logged

    @pytest.mark.parametrize(
        "error",
        [
            httpx.ConnectError("[Errno -2] Name or service not known"),
            httpx.ConnectError("[Errno 61] Connection refused"),
            httpx.ConnectTimeout("timed out"),
            httpx.PoolTimeout("no connection available"),
        ],
        ids=lambda e: type(e).__name__,
    )
    def test_connect_failure_is_a_definite_not_sent(self, error: httpx.HTTPError) -> None:
        with (
            patch("platform_shared.services.httpsms_service.httpx.post", side_effect=error),
            pytest.raises(SmsSendError) as exc,
        ):
            _service().send_or_raise("+15559876543", "Rent due")
        assert exc.value.provider_code == "network_error"
        assert exc.value.outcome_unknown is False

    @pytest.mark.parametrize(
        "error",
        [
            httpx.ReadTimeout("timed out"),
            httpx.WriteTimeout("timed out"),
            httpx.ReadError("connection reset by peer"),
            httpx.WriteError("broken pipe"),
            httpx.RemoteProtocolError("server disconnected without sending a response"),
            httpx.CloseError("close failed"),
            httpx.DecodingError("bad gzip"),
        ],
        ids=lambda e: type(e).__name__,
    )
    def test_failure_after_the_request_went_out_is_outcome_unknown(
        self, error: httpx.HTTPError, caplog,
    ) -> None:
        with (
            patch("platform_shared.services.httpsms_service.httpx.post", side_effect=error),
            caplog.at_level(logging.WARNING),
            pytest.raises(SmsSendError) as exc,
        ):
            _service().send_or_raise("+15559876543", "Rent due", request_id="req-7")
        assert exc.value.provider_code == "outcome_unknown"
        assert exc.value.outcome_unknown is True
        logged = " ".join(r.getMessage() for r in caplog.records)
        assert "req-7" in logged
        assert "+15559876543" not in logged
        assert "Rent due" not in logged

    @pytest.mark.parametrize("status", [500, 502, 503, 504])
    def test_server_error_is_outcome_unknown(self, status: int) -> None:
        failed = _response(status, {"status": "error", "message": "internal error"})
        with (
            patch("platform_shared.services.httpsms_service.httpx.post", return_value=failed),
            pytest.raises(SmsSendError) as exc,
        ):
            _service().send_or_raise("+15559876543", "Rent due")
        assert exc.value.status == status
        assert exc.value.provider_code == f"http_{status}"
        assert exc.value.outcome_unknown is True

    @pytest.mark.parametrize("status", [400, 401, 422, 429])
    def test_client_error_is_a_definite_rejection(self, status: int) -> None:
        rejected = _response(status, {"status": "error", "message": "no"})
        with (
            patch("platform_shared.services.httpsms_service.httpx.post", return_value=rejected),
            pytest.raises(SmsSendError) as exc,
        ):
            _service().send_or_raise("+15559876543", "Rent due")
        assert exc.value.outcome_unknown is False

    def test_accepted_request_with_no_message_id_is_outcome_unknown(self) -> None:
        accepted = _response(200, {"status": "success", "data": {}})
        with (
            patch("platform_shared.services.httpsms_service.httpx.post", return_value=accepted),
            pytest.raises(SmsSendError) as exc,
        ):
            _service().send_or_raise("+15559876543", "Rent due")
        assert exc.value.provider_code == "malformed_response"
        assert exc.value.outcome_unknown is True

    def test_unconfigured_raises_not_configured(self) -> None:
        with pytest.raises(SmsNotConfiguredError):
            HttpSmsService().send_or_raise("+15559876543", "Rent due")

    def test_empty_body_is_a_value_error(self) -> None:
        with pytest.raises(ValueError):
            _service().send_or_raise("+15559876543", "")

    def test_encrypts_when_key_is_set(self) -> None:
        ok = _response(200, {"status": "success", "data": {"id": "msg-9"}})
        with patch("platform_shared.services.httpsms_service.httpx.post", return_value=ok) as post:
            _service(encryption_key="phone-passphrase").send_or_raise("+15559876543", "Rent due")

        sent = post.call_args.kwargs["json"]
        assert sent["encrypted"] is True
        assert sent["content"] != "Rent due"
        assert decrypt_httpsms_content("phone-passphrase", sent["content"]) == "Rent due"

    def test_best_effort_send_returns_false_on_failure(self) -> None:
        with patch(
            "platform_shared.services.httpsms_service.httpx.post",
            return_value=_response(401, {"status": "error", "message": "no"}),
        ):
            assert _service().send("+15559876543", "Rent due") is False


class TestEncryption:
    def test_round_trip_with_fresh_iv_each_time(self) -> None:
        a = encrypt_httpsms_content("k", "Hi Sonu")
        b = encrypt_httpsms_content("k", "Hi Sonu")
        assert a != b  # random IV
        assert decrypt_httpsms_content("k", a) == "Hi Sonu"
        assert decrypt_httpsms_content("k", b) == "Hi Sonu"


def _token(*, key: str = _SIGNING_KEY, audience: str = _URL, expires_in: int = 600) -> str:
    now = _dt.datetime.now(_dt.timezone.utc)
    return jwt.encode(
        {
            "iss": HTTPSMS_WEBHOOK_ISSUER,
            "aud": [audience],
            "iat": now,
            "nbf": now - _dt.timedelta(minutes=10),
            "exp": now + _dt.timedelta(seconds=expires_in),
        },
        key,
        algorithm="HS256",
    )


class TestVerifyWebhook:
    def test_valid_token_is_accepted(self) -> None:
        verify_httpsms_webhook(
            f"Bearer {_token()}", signing_key=_SIGNING_KEY, audience=_URL,
        )

    @pytest.mark.parametrize(
        "header",
        [
            None,
            "",
            "Basic abc",
            f"Bearer {_token(key='someone-else')}",
            f"Bearer {_token(audience='https://evil.example.com/hook')}",
            f"Bearer {_token(expires_in=-3600)}",
        ],
        ids=["missing", "empty", "not-bearer", "wrong-key", "wrong-audience", "expired"],
    )
    def test_bad_tokens_are_rejected(self, header: str | None) -> None:
        with pytest.raises(HttpSmsWebhookAuthError):
            verify_httpsms_webhook(header, signing_key=_SIGNING_KEY, audience=_URL)

    def test_no_signing_key_configured_rejects_everything(self) -> None:
        with pytest.raises(HttpSmsWebhookAuthError):
            verify_httpsms_webhook(f"Bearer {_token()}", signing_key="", audience=_URL)


class TestParseEvent:
    def test_delivered(self) -> None:
        event = parse_httpsms_event(
            {"type": HTTPSMS_EVENT_PHONE_DELIVERED, "data": {"id": "m1", "request_id": "r1"}},
            event_type_header=None,
        )
        assert (event.event_type, event.message_id, event.request_id) == (
            HTTPSMS_EVENT_PHONE_DELIVERED, "m1", "r1",
        )

    def test_failed_carries_error_message(self) -> None:
        event = parse_httpsms_event(
            {"type": HTTPSMS_EVENT_SEND_FAILED, "data": {"id": "m1", "error_message": "NO_SERVICE"}},
            event_type_header=None,
        )
        assert event.error_message == "NO_SERVICE"

    def test_expired_uses_message_id_and_is_final_flag(self) -> None:
        event = parse_httpsms_event(
            {"data": {"message_id": "m2", "is_final": False}},
            event_type_header=HTTPSMS_EVENT_SEND_EXPIRED,
        )
        assert event.event_type == HTTPSMS_EVENT_SEND_EXPIRED
        assert event.message_id == "m2"
        assert event.is_final is False
