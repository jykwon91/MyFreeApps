"""Tests for platform_shared.services.twilio_webhook.

Signatures are computed with the Twilio SDK's own ``RequestValidator`` (the
same code Twilio documents), so a valid request here is byte-for-byte what
Twilio would send.
"""
from __future__ import annotations

import pytest
from twilio.request_validator import RequestValidator

from platform_shared.services.twilio_webhook import (
    TwilioWebhookAuthError,
    check_twilio_callback_headers,
    parse_twilio_status_callback,
    verify_twilio_signature,
)

_TOKEN = "test-auth-token"
_URL = "https://app.example/api/rent-reminders/sms/webhook?request_id=abc%3A2"
_PARAMS = {
    "MessageSid": "SM0123456789abcdef0123456789abcdef",
    "MessageStatus": "delivered",
    "AccountSid": "ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
}


def _sign(url: str = _URL, params: dict[str, str] | None = None, token: str = _TOKEN) -> str:
    return RequestValidator(token).compute_signature(url, params if params is not None else _PARAMS)


class TestCheckTwilioCallbackHeaders:
    @pytest.mark.parametrize(
        "content_type",
        [
            "application/x-www-form-urlencoded",
            "application/x-www-form-urlencoded; charset=utf-8",
            "Application/X-WWW-Form-Urlencoded",
        ],
    )
    def test_a_signed_form_passes(self, content_type: str) -> None:
        check_twilio_callback_headers(signature="sig", content_type=content_type)

    @pytest.mark.parametrize("signature", [None, ""])
    def test_an_unsigned_request_is_rejected(self, signature: str | None) -> None:
        with pytest.raises(TwilioWebhookAuthError, match="missing"):
            check_twilio_callback_headers(
                signature=signature, content_type="application/x-www-form-urlencoded",
            )

    @pytest.mark.parametrize(
        "content_type",
        [None, "", "application/json", "multipart/form-data; boundary=x", "text/plain"],
    )
    def test_any_other_body_is_rejected(self, content_type: str | None) -> None:
        with pytest.raises(TwilioWebhookAuthError, match="not form-encoded"):
            check_twilio_callback_headers(signature="sig", content_type=content_type)


class TestVerifyTwilioSignature:
    def test_valid_signature_passes(self) -> None:
        verify_twilio_signature(auth_token=_TOKEN, url=_URL, params=_PARAMS, signature=_sign())

    def test_missing_signature_is_rejected(self) -> None:
        with pytest.raises(TwilioWebhookAuthError, match="missing"):
            verify_twilio_signature(auth_token=_TOKEN, url=_URL, params=_PARAMS, signature=None)

    def test_empty_signature_is_rejected(self) -> None:
        with pytest.raises(TwilioWebhookAuthError, match="missing"):
            verify_twilio_signature(auth_token=_TOKEN, url=_URL, params=_PARAMS, signature="")

    def test_signature_from_another_token_is_rejected(self) -> None:
        with pytest.raises(TwilioWebhookAuthError, match="invalid"):
            verify_twilio_signature(
                auth_token=_TOKEN, url=_URL, params=_PARAMS, signature=_sign(token="other"),
            )

    def test_tampered_params_are_rejected(self) -> None:
        tampered = {**_PARAMS, "MessageStatus": "failed"}
        with pytest.raises(TwilioWebhookAuthError, match="invalid"):
            verify_twilio_signature(auth_token=_TOKEN, url=_URL, params=tampered, signature=_sign())

    def test_a_different_request_id_is_rejected(self) -> None:
        """The query string is signed, so a callback can't be replayed onto another try."""
        other = _URL.replace("abc%3A2", "abc%3A1")
        with pytest.raises(TwilioWebhookAuthError, match="invalid"):
            verify_twilio_signature(auth_token=_TOKEN, url=other, params=_PARAMS, signature=_sign())

    def test_no_auth_token_rejects_everything(self) -> None:
        with pytest.raises(TwilioWebhookAuthError, match="not configured"):
            verify_twilio_signature(
                auth_token="", url=_URL, params=_PARAMS, signature=_sign(token=""),
            )


class TestParseTwilioStatusCallback:
    def test_reads_sid_status_and_error_code(self) -> None:
        event = parse_twilio_status_callback(
            {"MessageSid": "SM1", "MessageStatus": "undelivered", "ErrorCode": "30007"},
        )
        assert (event.message_sid, event.status, event.error_code) == ("SM1", "undelivered", "30007")

    def test_falls_back_to_the_deprecated_names(self) -> None:
        event = parse_twilio_status_callback({"SmsSid": "SM2", "SmsStatus": "sent"})
        assert (event.message_sid, event.status, event.error_code) == ("SM2", "sent", None)

    def test_missing_fields_are_none(self) -> None:
        event = parse_twilio_status_callback({})
        assert (event.message_sid, event.status, event.error_code) == (None, "", None)
