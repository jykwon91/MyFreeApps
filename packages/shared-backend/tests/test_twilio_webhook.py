"""Tests for platform_shared.services.twilio_webhook.

Signatures are computed with the Twilio SDK's own ``RequestValidator`` (the
same code Twilio documents), so a valid request here is byte-for-byte what
Twilio would send.
"""
from __future__ import annotations

import pytest
from twilio.request_validator import RequestValidator
from twilio.twiml.messaging_response import MessagingResponse

from platform_shared.core.sms_constants import TWILIO_EMPTY_TWIML, TWILIO_MAX_MEDIA
from platform_shared.services.twilio_inbound_message import TwilioInboundMessage
from platform_shared.services.twilio_webhook import (
    TwilioWebhookAuthError,
    check_twilio_callback_headers,
    parse_twilio_inbound_message,
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


_INBOUND = {
    "MessageSid": "SM0123456789abcdef0123456789abcdef",
    "AccountSid": "ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "From": "+17135550100",
    "To": "+18885550100",
    "Body": "Paid, thanks!",
    "NumMedia": "0",
}


class TestParseTwilioInboundMessage:
    def test_reads_an_ordinary_text(self) -> None:
        assert parse_twilio_inbound_message(_INBOUND) == TwilioInboundMessage(
            message_sid="SM0123456789abcdef0123456789abcdef",
            account_sid="ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
            from_number="+17135550100",
            to_number="+18885550100",
            body="Paid, thanks!",
            media_content_types=(),
            opt_out_type=None,
        )

    def test_keeps_the_body_as_sent(self) -> None:
        body = "  two lines\nwith <b>markup</b> & spaces  "
        assert parse_twilio_inbound_message({**_INBOUND, "Body": body}).body == body

    def test_reads_attachment_types_but_never_their_urls(self) -> None:
        message = parse_twilio_inbound_message({
            **_INBOUND,
            "NumMedia": "2",
            "MediaContentType0": "image/jpeg",
            "MediaUrl0": "https://api.twilio.com/2010-04-01/Accounts/AC/Messages/MM/Media/ME0",
            "MediaContentType1": " Application/PDF ",
            "MediaUrl1": "https://api.twilio.com/2010-04-01/Accounts/AC/Messages/MM/Media/ME1",
        })
        assert message.media_content_types == ("image/jpeg", "application/pdf")
        assert "api.twilio.com" not in repr(message)

    # A fullwidth 3 and a superscript 2: str.isdigit() says yes to both.
    @pytest.mark.parametrize("num_media", [None, "", "abc", "-1", "1.5", "\uff13", "\u00b2"])
    def test_an_unreadable_count_means_no_attachments(self, num_media: str | None) -> None:
        params = {**_INBOUND, "MediaContentType0": "image/png"}
        if num_media is None:
            del params["NumMedia"]
        else:
            params["NumMedia"] = num_media
        assert parse_twilio_inbound_message(params).media_content_types == ()

    def test_the_count_is_capped_at_twilios_limit(self) -> None:
        message = parse_twilio_inbound_message({**_INBOUND, "NumMedia": "500"})
        assert len(message.media_content_types) == TWILIO_MAX_MEDIA

    def test_an_attachment_without_a_type_still_counts(self) -> None:
        message = parse_twilio_inbound_message({**_INBOUND, "NumMedia": "1"})
        assert message.media_content_types == ("",)

    def test_reads_the_opt_out_type_when_twilio_sends_one(self) -> None:
        message = parse_twilio_inbound_message({**_INBOUND, "Body": "stop", "OptOutType": "STOP"})
        assert message.opt_out_type == "STOP"

    def test_falls_back_to_the_deprecated_sid_name(self) -> None:
        params = {key: value for key, value in _INBOUND.items() if key != "MessageSid"}
        assert parse_twilio_inbound_message({**params, "SmsSid": "SM2"}).message_sid == "SM2"

    def test_missing_fields_are_empty(self) -> None:
        assert parse_twilio_inbound_message({}) == TwilioInboundMessage(
            message_sid=None,
            account_sid=None,
            from_number=None,
            to_number=None,
            body="",
            media_content_types=(),
            opt_out_type=None,
        )


def test_the_empty_answer_is_what_the_sdk_renders_for_no_reply() -> None:
    assert TWILIO_EMPTY_TWIML == str(MessagingResponse())
