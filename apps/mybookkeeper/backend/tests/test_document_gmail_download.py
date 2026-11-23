"""Downloading a document that still lives in Gmail holds no database connection.

A Gmail fetch can take seconds. Done inside the session that loaded the
document, it held a pooled connection idle in a transaction the whole time.
A token Google refreshes during the fetch is still saved, in a transaction
of its own, and not over a Gmail account reconnected meanwhile.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.models.documents.document import Document
from app.models.integrations.integration import Integration
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole
from app.models.user.user import User
from app.services.documents import document_query_service
from app.services.documents.document_source_unavailable_error import DocumentSourceUnavailableError
from app.services.email import gmail_credentials

pytestmark = pytest.mark.asyncio

_EMAIL = {
    "attachments": [
        {"filename": "bill.pdf", "content_type": "application/pdf", "data": b"%PDF-1.4 bill"},
    ],
    "body": "",
}


class _Sessions:
    """Stands in for a session factory on the test session and counts the open ones."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self.open = 0

    @asynccontextmanager
    async def __call__(self) -> AsyncIterator[AsyncSession]:
        self.open += 1
        try:
            yield self._db
            await self._db.commit()
        finally:
            self.open -= 1


@pytest.fixture
async def emailed_document(db: AsyncSession, test_org: Organization, test_user: User) -> Document:
    integration = Integration(organization_id=test_org.id, user_id=test_user.id, provider="gmail", metadata_={})
    integration.access_token = "old-access"
    integration.refresh_token = "refresh"
    doc = Document(
        id=uuid.uuid4(),
        organization_id=test_org.id,
        user_id=test_user.id,
        status="completed",
        file_name="bill.pdf",
        file_type="pdf",
        source="email",
        email_message_id="msg-1",
    )
    db.add_all([integration, doc])
    await db.commit()
    return doc


def _ctx(test_org: Organization, test_user: User) -> RequestContext:
    return RequestContext(organization_id=test_org.id, user_id=test_user.id, org_role=OrgRole.OWNER)


async def test_gmail_is_fetched_with_no_session_open(
    db: AsyncSession, test_org: Organization, test_user: User,
    emailed_document: Document, monkeypatch: pytest.MonkeyPatch,
) -> None:
    sessions = _Sessions(db)
    monkeypatch.setattr(document_query_service, "AsyncSessionLocal", sessions)
    monkeypatch.setattr(gmail_credentials, "unit_of_work", sessions)
    open_during_fetch: list[int] = []

    def _fetch(_service: object, _message_id: str) -> dict:
        open_during_fetch.append(sessions.open)
        return _EMAIL

    with (
        patch.object(document_query_service, "get_gmail_service", return_value=(MagicMock(), MagicMock(token="t"))),
        patch.object(document_query_service, "fetch_email_by_id", side_effect=_fetch),
    ):
        result = await document_query_service.get_document_download(
            _ctx(test_org, test_user), emailed_document.id,
        )

    assert result is not None
    assert result.content == b"%PDF-1.4 bill"
    assert open_during_fetch == [0]


class _FetchFailed(Exception):
    pass


@pytest.mark.parametrize(
    ("fetched", "raises"),
    [(_EMAIL, None), (None, DocumentSourceUnavailableError), (_FetchFailed(), _FetchFailed)],
    ids=["email-found", "email-gone", "fetch-error"],
)
async def test_a_token_refreshed_during_the_fetch_is_saved(
    db: AsyncSession, test_org: Organization, test_user: User,
    emailed_document: Document, monkeypatch: pytest.MonkeyPatch,
    fetched: dict | Exception | None, raises: type[Exception] | None,
) -> None:
    """Whatever the fetch then finds, the token Google refreshed for it is kept."""
    sessions = _Sessions(db)
    monkeypatch.setattr(document_query_service, "AsyncSessionLocal", sessions)
    monkeypatch.setattr(gmail_credentials, "unit_of_work", sessions)
    creds = MagicMock(token="old-access", expiry=None)

    def _fetch(_service: object, _message_id: str) -> dict | None:
        creds.token = "new-access"
        if isinstance(fetched, Exception):
            raise fetched
        return fetched

    with (
        patch.object(document_query_service, "get_gmail_service", return_value=(MagicMock(), creds)),
        patch.object(document_query_service, "fetch_email_by_id", side_effect=_fetch),
    ):
        if raises is None:
            await document_query_service.get_document_download(_ctx(test_org, test_user), emailed_document.id)
        else:
            with pytest.raises(raises):
                await document_query_service.get_document_download(_ctx(test_org, test_user), emailed_document.id)

    db.expunge_all()
    integration = await db.get(Integration, await _integration_id(db, test_org))
    assert integration is not None
    assert integration.access_token == "new-access"


async def test_a_token_refreshed_during_the_fetch_is_not_saved_over_a_reconnect(
    db: AsyncSession, test_org: Organization, test_user: User,
    emailed_document: Document, monkeypatch: pytest.MonkeyPatch,
) -> None:
    sessions = _Sessions(db)
    monkeypatch.setattr(document_query_service, "AsyncSessionLocal", sessions)
    integration_id = await _integration_id(db, test_org)

    @asynccontextmanager
    async def _save_after_a_reconnect() -> AsyncIterator[AsyncSession]:
        """The user reconnected Gmail while the fetch ran, before the token is saved."""
        row = await db.get(Integration, integration_id)
        assert row is not None
        row.access_token = "reconnected-access"
        row.refresh_token = "reconnected-refresh"
        await db.commit()
        async with sessions() as session:
            yield session

    monkeypatch.setattr(gmail_credentials, "unit_of_work", _save_after_a_reconnect)
    creds = MagicMock(token="old-access", expiry=None)

    def _fetch(_service: object, _message_id: str) -> dict:
        creds.token = "new-access"
        return _EMAIL

    with (
        patch.object(document_query_service, "get_gmail_service", return_value=(MagicMock(), creds)),
        patch.object(document_query_service, "fetch_email_by_id", side_effect=_fetch),
    ):
        await document_query_service.get_document_download(_ctx(test_org, test_user), emailed_document.id)

    db.expunge_all()
    row = await db.get(Integration, integration_id)
    assert row is not None
    assert row.access_token == "reconnected-access"


async def _integration_id(db: AsyncSession, test_org: Organization) -> uuid.UUID:
    return (await db.execute(
        select(Integration.id).where(Integration.organization_id == test_org.id),
    )).scalar_one()
