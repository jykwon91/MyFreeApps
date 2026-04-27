"""Tests for the Gmail send_message helper.

Covers:
- Builds an RFC 5322 message with the right headers
- Threads with In-Reply-To when the original message-id is provided
- 403 → GmailSendScopeError (lost / missing scope)
- 400 → GmailSendError (malformed request)
- Network error → GmailSendError
- Empty / missing message id from Gmail → GmailSendError
"""
from __future__ import annotations

import base64
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from googleapiclient.errors import HttpError

from app.services.email import gmail_service
from app.services.email.exceptions import GmailSendError, GmailSendScopeError


class _FakeIntegration:
    """Minimal Integration stand-in — only the attributes send_message reads."""

    def __init__(self, *, access_token: str = "tok", refresh_token: str | None = "rt") -> None:
        self.access_token = access_token
        self.refresh_token = refresh_token


def _make_http_error(status: int) -> HttpError:
    resp = MagicMock()
    resp.status = status
    return HttpError(resp, b"err")


def _captured_send_call(captured: dict[str, Any]) -> Any:
    """Build a fake gmail service whose .users().messages().send() captures
    its body and returns a stub response."""
    def _execute() -> dict[str, Any]:
        return {"id": "<gmail-id-123@mail.gmail.com>"}

    send_chain = MagicMock()
    send_chain.execute = _execute

    def _send(userId: str, body: dict[str, Any]) -> Any:  # noqa: N803
        captured["userId"] = userId
        captured["body"] = body
        return send_chain

    messages = MagicMock()
    messages.send = _send
    users = MagicMock()
    users.messages.return_value = messages
    fake_service = MagicMock()
    fake_service.users.return_value = users
    return fake_service


class TestSendMessageHappyPath:
    def test_builds_correct_rfc5322_message(self) -> None:
        captured: dict[str, Any] = {}
        fake = _captured_send_call(captured)
        with patch.object(gmail_service, "get_gmail_service", return_value=fake):
            sent_id = gmail_service.send_message(
                _FakeIntegration(),
                from_address="host@gmail.com",
                to_address="alice@example.com",
                subject="Re: Cozy Room",
                body="Hi Alice",
            )
        assert sent_id == "<gmail-id-123@mail.gmail.com>"
        raw = captured["body"]["raw"]
        # Decode the base64url payload and verify it's a valid RFC 5322 message.
        decoded = base64.urlsafe_b64decode(raw + "===").decode("utf-8")
        assert "From: host@gmail.com" in decoded
        assert "To: alice@example.com" in decoded
        assert "Subject: Re: Cozy Room" in decoded
        assert "Hi Alice" in decoded
        # Message-ID is auto-generated.
        assert "Message-ID:" in decoded

    def test_sets_in_reply_to_and_references_for_threading(self) -> None:
        captured: dict[str, Any] = {}
        fake = _captured_send_call(captured)
        with patch.object(gmail_service, "get_gmail_service", return_value=fake):
            gmail_service.send_message(
                _FakeIntegration(),
                from_address="h@g.com",
                to_address="a@b.com",
                subject="s",
                body="b",
                in_reply_to_message_id="<orig-123@mail.example.com>",
            )
        raw = captured["body"]["raw"]
        decoded = base64.urlsafe_b64decode(raw + "===").decode("utf-8")
        assert "In-Reply-To: <orig-123@mail.example.com>" in decoded
        assert "References: <orig-123@mail.example.com>" in decoded

    def test_no_threading_headers_when_no_original(self) -> None:
        captured: dict[str, Any] = {}
        fake = _captured_send_call(captured)
        with patch.object(gmail_service, "get_gmail_service", return_value=fake):
            gmail_service.send_message(
                _FakeIntegration(),
                from_address="h@g.com",
                to_address="a@b.com",
                subject="s",
                body="b",
                in_reply_to_message_id=None,
            )
        decoded = base64.urlsafe_b64decode(
            captured["body"]["raw"] + "===",
        ).decode("utf-8")
        assert "In-Reply-To:" not in decoded
        assert "References:" not in decoded


class TestSendMessageErrors:
    def test_403_raises_send_scope_error(self) -> None:
        fake = MagicMock()
        send_chain = MagicMock()
        send_chain.execute.side_effect = _make_http_error(403)
        fake.users.return_value.messages.return_value.send.return_value = send_chain
        with patch.object(gmail_service, "get_gmail_service", return_value=fake):
            with pytest.raises(GmailSendScopeError):
                gmail_service.send_message(
                    _FakeIntegration(),
                    from_address="h@g.com",
                    to_address="a@b.com",
                    subject="s",
                    body="b",
                )

    def test_400_raises_send_error(self) -> None:
        fake = MagicMock()
        send_chain = MagicMock()
        send_chain.execute.side_effect = _make_http_error(400)
        fake.users.return_value.messages.return_value.send.return_value = send_chain
        with patch.object(gmail_service, "get_gmail_service", return_value=fake):
            with pytest.raises(GmailSendError):
                gmail_service.send_message(
                    _FakeIntegration(),
                    from_address="h@g.com",
                    to_address="a@b.com",
                    subject="s",
                    body="b",
                )

    def test_500_raises_send_error(self) -> None:
        fake = MagicMock()
        send_chain = MagicMock()
        send_chain.execute.side_effect = _make_http_error(500)
        fake.users.return_value.messages.return_value.send.return_value = send_chain
        with patch.object(gmail_service, "get_gmail_service", return_value=fake):
            with pytest.raises(GmailSendError):
                gmail_service.send_message(
                    _FakeIntegration(),
                    from_address="h@g.com",
                    to_address="a@b.com",
                    subject="s",
                    body="b",
                )

    def test_network_error_raises_send_error(self) -> None:
        fake = MagicMock()
        send_chain = MagicMock()
        send_chain.execute.side_effect = ConnectionError("net down")
        fake.users.return_value.messages.return_value.send.return_value = send_chain
        with patch.object(gmail_service, "get_gmail_service", return_value=fake):
            with pytest.raises(GmailSendError):
                gmail_service.send_message(
                    _FakeIntegration(),
                    from_address="h@g.com",
                    to_address="a@b.com",
                    subject="s",
                    body="b",
                )

    def test_empty_response_id_raises_send_error(self) -> None:
        fake = MagicMock()
        send_chain = MagicMock()
        send_chain.execute.return_value = {"id": ""}
        fake.users.return_value.messages.return_value.send.return_value = send_chain
        with patch.object(gmail_service, "get_gmail_service", return_value=fake):
            with pytest.raises(GmailSendError):
                gmail_service.send_message(
                    _FakeIntegration(),
                    from_address="h@g.com",
                    to_address="a@b.com",
                    subject="s",
                    body="b",
                )

    def test_missing_access_token_raises_scope_error(self) -> None:
        with pytest.raises(GmailSendScopeError):
            gmail_service.send_message(
                _FakeIntegration(access_token=""),
                from_address="h@g.com",
                to_address="a@b.com",
                subject="s",
                body="b",
            )
