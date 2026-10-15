"""Tests for platform_shared.services.httpsms_service.

Covers:
- Send success returns the httpSMS message id and posts the documented body.
- Provider rejection -> SmsSendError carrying the HTTP status + provider_code,
  logged at WARNING (rules/check-third-party-error-codes.md).
- Network failure -> SmsSendError(provider_code="network_error").
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

    def test_network_error_raises_send_error(self) -> None:
        with patch(
            "platform_shared.services.httpsms_service.httpx.post",
            side_effect=httpx.ConnectTimeout("timed out"),
        ):
            with pytest.raises(SmsSendError) as exc:
                _service().send_or_raise("+15559876543", "Rent due")
        assert exc.value.provider_code == "network_error"

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
