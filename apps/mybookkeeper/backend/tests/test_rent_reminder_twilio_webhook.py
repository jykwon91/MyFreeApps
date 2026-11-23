"""Unit tests for the Twilio side of rent reminder texts.

The callback URL a text is sent with, the signature check against that same
URL, and how a Twilio status and error code become the row's status and code.
The row-level behaviour (forward-only statuses, earlier tries, races) is
covered in ``test_rent_reminder_dispatch``.
"""
from __future__ import annotations

import uuid
from contextlib import ExitStack
from unittest.mock import patch
from urllib.parse import urlsplit

import pytest
from platform_shared.services.twilio_webhook import TwilioWebhookAuthError
from twilio.request_validator import RequestValidator

from app.core.config import settings
from app.core.rent_reminder_request_id import parse_reminder_request_id
from app.services.rent import rent_reminder_webhook_service as webhook
from app.services.system import sms_service

_AUTH_TOKEN = "test-twilio-auth-token-0123456789"
_PARAMS = {"MessageSid": "SM" + "1" * 32, "MessageStatus": "delivered"}


@pytest.fixture()
def twilio_configured():
    with ExitStack() as stack:
        for name, value in (
            ("sms_backend", "twilio"),
            ("twilio_account_sid", "AC" + "f" * 32),
            ("twilio_auth_token", _AUTH_TOKEN),
            ("twilio_from_number", "+18885550100"),
            ("frontend_url", "https://mybookkeeper.example/"),
        ):
            stack.enter_context(patch.object(settings, name, value))
        yield


class TestStatusCallbackUrl:
    def test_points_at_the_public_webhook_with_the_try(self, twilio_configured) -> None:
        send_id = uuid.uuid4()
        url = sms_service.status_callback_url(f"{send_id}:2")

        parts = urlsplit(url)
        assert f"{parts.scheme}://{parts.netloc}{parts.path}" == (
            "https://mybookkeeper.example/api/rent-reminders/sms/webhook"
        )
        assert parts.query == f"request_id={send_id}%3A2"

    def test_a_signature_over_the_callback_url_verifies(self, twilio_configured) -> None:
        """What Twilio signs (the URL we gave it) is what the webhook checks."""
        url = sms_service.status_callback_url(f"{uuid.uuid4()}:1")
        signature = RequestValidator(_AUTH_TOKEN).compute_signature(url, _PARAMS)

        sms_service.verify_status_callback(
            query_string=urlsplit(url).query, params=_PARAMS, signature=signature,
        )

    def test_nothing_verifies_when_twilio_isnt_configured(self, twilio_configured) -> None:
        url = sms_service.status_callback_url(f"{uuid.uuid4()}:1")
        signature = RequestValidator(_AUTH_TOKEN).compute_signature(url, _PARAMS)

        with patch.object(settings, "sms_backend", "console"), pytest.raises(TwilioWebhookAuthError):
            sms_service.verify_status_callback(
                query_string=urlsplit(url).query, params=_PARAMS, signature=signature,
            )

    def test_the_request_id_round_trips(self, twilio_configured) -> None:
        send_id = uuid.uuid4()
        url = sms_service.status_callback_url(f"{send_id}:3")
        [(name, value)] = [pair.split("=") for pair in [urlsplit(url).query]]
        assert name == "request_id"
        assert parse_reminder_request_id(value.replace("%3A", ":")) == (send_id, 3)


class TestFailureCode:
    @pytest.mark.parametrize(
        ("twilio_error_code", "expected"),
        [
            ("30007", "sms_failed: 30007"),
            (" 21610 ", "sms_failed: 21610"),
            (None, "sms_failed: unknown"),
            ("", "sms_failed: unknown"),
            ("cannot send to +17135550100", "sms_failed: unknown"),
            ("３０００７", "sms_failed: unknown"),
            ("123456789", "sms_failed: unknown"),
            ("123456", "sms_failed: unknown"),
            ("1234", "sms_failed: unknown"),
        ],
        ids=[
            "number", "padded", "missing", "empty", "text", "non_ascii_digits", "too_long",
            "six_digits", "four_digits",
        ],
    )
    def test_only_a_twilio_error_number_is_kept(
        self, twilio_error_code: str | None, expected: str,
    ) -> None:
        assert webhook.failure_code(twilio_error_code) == expected


class TestIgnoredStatuses:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("status", ["queued", "sending", "accepted", "scheduled", "read", ""])
    async def test_statuses_before_the_carrier_change_nothing(self, status: str) -> None:
        with patch.object(
            webhook, "unit_of_work", side_effect=AssertionError("must not touch the database"),
        ):
            assert not await webhook.handle_event(
                {"MessageSid": "SM" + "1" * 32, "MessageStatus": status},
                request_id=f"{uuid.uuid4()}:1",
            )
