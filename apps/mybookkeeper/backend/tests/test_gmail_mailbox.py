"""Which Gmail account a connection is, and comparing claim addresses to it."""
from __future__ import annotations

import logging
from unittest.mock import MagicMock

import pytest
from googleapiclient.errors import HttpError

from app.services.email import gmail_mailbox
from app.services.email.exceptions import GmailAccountUnknownError
from app.services.email.gmail_address_match import same_gmail_address


@pytest.mark.parametrize(
    ("a", "b", "same"),
    [
        ("host@gmail.com", " Host@GMAIL.com ", True),
        ("host@gmail.com", "h.ost@gmail.com", False),
        ("host@gmail.com", "host+rent@gmail.com", False),
        ("host@gmail.com", "other@gmail.com", False),
    ],
)
def test_addresses_match_ignoring_case_and_spaces_only(a: str, b: str, same: bool) -> None:
    assert same_gmail_address(a, b) is same


def _profile_service(monkeypatch: pytest.MonkeyPatch, execute: MagicMock) -> None:
    service = MagicMock()
    service.users.return_value.getProfile.return_value.execute = execute
    monkeypatch.setattr(gmail_mailbox, "get_gmail_service", MagicMock(return_value=(service, MagicMock())))


@pytest.mark.asyncio
async def test_new_connection_address_comes_from_the_profile(monkeypatch: pytest.MonkeyPatch) -> None:
    _profile_service(monkeypatch, MagicMock(return_value={"emailAddress": " host@gmail.com "}))

    assert await gmail_mailbox.address_of_new_connection(MagicMock()) == "host@gmail.com"


@pytest.mark.asyncio
async def test_new_connection_profile_without_an_address_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    _profile_service(monkeypatch, MagicMock(return_value={"messagesTotal": 3}))

    with pytest.raises(GmailAccountUnknownError):
        await gmail_mailbox.address_of_new_connection(MagicMock())


@pytest.mark.asyncio
async def test_new_connection_profile_error_is_logged_with_its_reason(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture,
) -> None:
    error = HttpError(MagicMock(status=403, reason="Forbidden"), b'{"error": {"message": "no scope"}}')
    _profile_service(monkeypatch, MagicMock(side_effect=error))

    with caplog.at_level(logging.WARNING, logger=gmail_mailbox.__name__):
        with pytest.raises(HttpError):
            await gmail_mailbox.address_of_new_connection(MagicMock())

    assert any("status=403" in r.getMessage() for r in caplog.records)
