"""Tests for the Gmail send_message helper (inquiry replies).

Covers the RFC 5322 message it builds, threading headers, and that its
failures are the shared ``gmail_request_executor`` classes.
"""
from __future__ import annotations

import uuid

import pytest

from app.services.email import gmail_service
from app.services.email.exceptions import (
    GmailSendError,
    GmailSendOutcomeUnknownError,
    GmailSendScopeError,
)
from tests.gmail_send_fakes import fake_gmail_post, gmail_response


class _FakeIntegration:
    """Minimal Integration stand-in — only the attributes send_message reads."""

    def __init__(self, *, access_token: str = "tok", refresh_token: str | None = "rt") -> None:
        self.access_token = access_token
        self.refresh_token = refresh_token
        self.organization_id = uuid.uuid4()


async def _send(**kwargs: object) -> str:
    return await gmail_service.send_message(
        _FakeIntegration(),
        from_address="h@g.com",
        to_address="a@b.com",
        subject="s",
        body="b",
        message_id_header="<reply-1@mybookkeeper.app>",
        **kwargs,  # type: ignore[arg-type]
    )


class TestSendMessageHappyPath:
    @pytest.mark.asyncio
    async def test_builds_correct_rfc5322_message(self) -> None:
        with fake_gmail_post(gmail_response(200, {"id": "gmail-id-123"})) as gmail:
            sent_id = await gmail_service.send_message(
                _FakeIntegration(),
                from_address="host@gmail.com",
                to_address="alice@example.com",
                subject="Re: Cozy Room",
                body="Hi Alice",
                message_id_header="<reply-1@mybookkeeper.app>",
            )
        assert sent_id == "gmail-id-123"
        message = gmail.message()
        assert message["From"] == "host@gmail.com"
        assert message["To"] == "alice@example.com"
        assert message["Subject"] == "Re: Cozy Room"
        assert "Hi Alice" in message.get_payload()
        assert message["Message-ID"] == "<reply-1@mybookkeeper.app>"

    @pytest.mark.asyncio
    async def test_sets_in_reply_to_and_references_for_threading(self) -> None:
        with fake_gmail_post(gmail_response(200, {"id": "x"})) as gmail:
            await _send(in_reply_to_message_id="<orig-123@mail.example.com>")
        message = gmail.message()
        assert message["In-Reply-To"] == "<orig-123@mail.example.com>"
        assert message["References"] == "<orig-123@mail.example.com>"

    @pytest.mark.asyncio
    async def test_no_threading_headers_when_no_original(self) -> None:
        with fake_gmail_post(gmail_response(200, {"id": "x"})) as gmail:
            await _send(in_reply_to_message_id=None)
        assert gmail.message()["In-Reply-To"] is None
        assert gmail.message()["References"] is None


class TestSendMessageErrors:
    @pytest.mark.asyncio
    async def test_403_raises_send_scope_error(self) -> None:
        with fake_gmail_post(gmail_response(403, {"error": {"errors": [{"reason": "insufficientPermissions"}]}})):
            with pytest.raises(GmailSendScopeError):
                await _send()

    @pytest.mark.asyncio
    async def test_400_raises_send_error(self) -> None:
        with fake_gmail_post(gmail_response(400, {})):
            with pytest.raises(GmailSendError):
                await _send()

    @pytest.mark.asyncio
    async def test_500_outcome_unknown(self) -> None:
        with fake_gmail_post(gmail_response(500, {})):
            with pytest.raises(GmailSendOutcomeUnknownError):
                await _send()

    @pytest.mark.asyncio
    async def test_network_error_outcome_unknown(self) -> None:
        with fake_gmail_post(ConnectionError("net down")):
            with pytest.raises(GmailSendOutcomeUnknownError):
                await _send()

    @pytest.mark.asyncio
    async def test_empty_response_id_outcome_unknown(self) -> None:
        with fake_gmail_post(gmail_response(200, {"id": ""})):
            with pytest.raises(GmailSendOutcomeUnknownError):
                await _send()

    @pytest.mark.asyncio
    async def test_missing_access_token_raises_scope_error(self) -> None:
        with pytest.raises(GmailSendScopeError):
            await gmail_service.send_message(
                _FakeIntegration(access_token=""),
                from_address="h@g.com",
                to_address="a@b.com",
                subject="s",
                body="b",
                message_id_header="<reply-1@mybookkeeper.app>",
            )
