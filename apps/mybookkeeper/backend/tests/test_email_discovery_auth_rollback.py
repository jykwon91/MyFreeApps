"""Discovery's auth failures survive its own rollback.

Discovery runs in one ``unit_of_work``, which rolls back when an exception
leaves it. The reauth flag and the failed sync_log row used to be written
inside it, right before the raise, so neither was ever saved: the scheduler
kept retrying a dead token and the UI never saw the failure. These tests run
on real sessions so the rollback actually happens.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from contextlib import asynccontextmanager
from unittest.mock import MagicMock

import pytest
from google.auth.exceptions import RefreshError
from googleapiclient.errors import HttpError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.core.context import RequestContext
from app.models.email.email_queue import EmailQueue
from app.models.integrations.integration import Integration
from app.models.integrations.sync_log import SyncLog
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories import email_filter_log_repo, integration_repo
from app.services.email import email_discovery_service, gmail_credentials
from app.services.email.constants import GMAIL_AUTH_EXPIRED_SYNC_LOG_ERROR
from app.services.email.exceptions import GmailAuthExpiredError


@pytest.fixture(autouse=True)
def real_sessions(monkeypatch: pytest.MonkeyPatch, _db_engine: AsyncEngine) -> None:
    @asynccontextmanager
    async def _uow():
        async with AsyncSession(bind=_db_engine, expire_on_commit=False) as session:
            async with session.begin():
                yield session

    monkeypatch.setattr(email_discovery_service, "unit_of_work", _uow)
    monkeypatch.setattr(gmail_credentials, "unit_of_work", _uow)


@pytest.fixture
def creds(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    fake = MagicMock(token="tok", expiry=None)
    monkeypatch.setattr(
        email_discovery_service, "get_gmail_service", lambda *_args: (MagicMock(), fake),
    )
    return fake


def _http_401() -> HttpError:
    resp = MagicMock()
    resp.status = 401
    return HttpError(resp=resp, content=b"Unauthorized")


async def _seed(db: AsyncSession, org: Organization, user: User) -> Integration:
    integration = Integration(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        provider="gmail",
        token_expiry=_dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(hours=1),
    )
    integration.access_token = "tok"
    integration.refresh_token = "rt"
    db.add(integration)
    await db.commit()
    return integration


def _ctx(org: Organization, user: User) -> RequestContext:
    return RequestContext(organization_id=org.id, user_id=user.id, org_role="owner")


async def _sync_logs(db: AsyncSession, org: Organization) -> list[SyncLog]:
    result = await db.execute(select(SyncLog).where(SyncLog.organization_id == org.id))
    return list(result.scalars().all())


@pytest.mark.asyncio
@pytest.mark.parametrize("error", [RefreshError("invalid_grant"), _http_401()], ids=["refresh", "401"])
async def test_listing_rejected_saves_reauth_flag_and_failed_log(
    db: AsyncSession, test_user: User, test_org: Organization,
    creds: MagicMock, monkeypatch: pytest.MonkeyPatch, error: Exception,
) -> None:
    integration = await _seed(db, test_org, test_user)

    def _reject(*_args, **_kwargs):
        raise error

    monkeypatch.setattr(email_discovery_service, "list_new_email_ids", _reject)

    with pytest.raises(GmailAuthExpiredError) as raised:
        await email_discovery_service.discover_gmail_emails(_ctx(test_org, test_user))

    assert raised.value.__cause__ is error
    await db.refresh(integration)
    assert integration.needs_reauth is True
    assert integration.last_reauth_error
    logs = await _sync_logs(db, test_org)
    assert [(log.status, log.error) for log in logs] == [("failed", GMAIL_AUTH_EXPIRED_SYNC_LOG_ERROR)]


@pytest.mark.asyncio
@pytest.mark.parametrize("error", [RefreshError("invalid_grant"), _http_401()], ids=["refresh", "401"])
async def test_rejected_mid_sync_saves_flag_and_one_failed_log(
    db: AsyncSession, test_user: User, test_org: Organization,
    creds: MagicMock, monkeypatch: pytest.MonkeyPatch, error: Exception,
) -> None:
    """The first message's queue rows and the running log roll back with the
    rest; the next sync finds that message again."""
    integration = await _seed(db, test_org, test_user)
    monkeypatch.setattr(
        email_discovery_service, "list_new_email_ids", lambda *_a, **_k: (["m1", "m2"], 2),
    )

    def _sources(_service, message_id: str):
        if message_id == "m2":
            raise error
        return {
            "subject": "Invoice",
            "from_address": "billing@example.com",
            "sources": [{"attachment_id": "a1", "filename": "invoice.pdf", "content_type": "application/pdf"}],
        }

    monkeypatch.setattr(email_discovery_service, "list_email_document_sources", _sources)

    with pytest.raises(GmailAuthExpiredError):
        await email_discovery_service.discover_gmail_emails(_ctx(test_org, test_user))

    await db.refresh(integration)
    assert integration.needs_reauth is True
    logs = await _sync_logs(db, test_org)
    assert [(log.status, log.error) for log in logs] == [("failed", GMAIL_AUTH_EXPIRED_SYNC_LOG_ERROR)]
    queued = await db.execute(select(EmailQueue).where(EmailQueue.organization_id == test_org.id))
    assert queued.scalars().all() == []


@pytest.mark.asyncio
async def test_refreshed_token_is_saved_after_discovery_commits(
    db: AsyncSession, test_user: User, test_org: Organization,
    creds: MagicMock, monkeypatch: pytest.MonkeyPatch,
) -> None:
    integration = await _seed(db, test_org, test_user)

    def _list(*_args, **_kwargs):
        creds.token = "tok-refreshed"  # google-auth refreshed it in memory
        return [], 0

    monkeypatch.setattr(email_discovery_service, "list_new_email_ids", _list)

    result = await email_discovery_service.discover_gmail_emails(_ctx(test_org, test_user))

    assert result.status == "nothing_new"
    await db.refresh(integration)
    assert integration.access_token == "tok-refreshed"
    assert integration.needs_reauth is False
    assert integration.last_synced_at is not None


@pytest.mark.asyncio
async def test_rejected_after_a_reconnect_leaves_the_new_connection_alone(
    db: AsyncSession, test_user: User, test_org: Organization, _db_engine: AsyncEngine,
    creds: MagicMock, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The user reconnected while discovery ran on the old connection: no
    reauth flag and no "auth expired" log for the healthy new one."""
    integration = await _seed(db, test_org, test_user)
    real_get_ids = email_filter_log_repo.get_message_ids

    async def _get_ids_then_reconnect(session: AsyncSession, org_id: uuid.UUID) -> set[str]:
        async with AsyncSession(bind=_db_engine, expire_on_commit=False) as other:
            await integration_repo.upsert_gmail(
                other, test_org.id, test_user.id, "tok-b", "rt-b",
                _dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(hours=1),
                gmail_address="b@gmail.com",
            )
            await other.commit()
        return await real_get_ids(session, org_id)

    def _reject(*_args, **_kwargs):
        creds.token = "tok-refreshed"
        raise RefreshError("invalid_grant")

    monkeypatch.setattr(email_discovery_service.email_filter_log_repo, "get_message_ids", _get_ids_then_reconnect)
    monkeypatch.setattr(email_discovery_service, "list_new_email_ids", _reject)

    with pytest.raises(GmailAuthExpiredError):
        await email_discovery_service.discover_gmail_emails(_ctx(test_org, test_user))

    await db.refresh(integration)
    assert integration.needs_reauth is False
    assert integration.access_token == "tok-b"
    assert await _sync_logs(db, test_org) == []


@pytest.mark.asyncio
async def test_failed_discovery_does_not_save_a_refreshed_token(
    db: AsyncSession, test_user: User, test_org: Organization,
    creds: MagicMock, monkeypatch: pytest.MonkeyPatch,
) -> None:
    integration = await _seed(db, test_org, test_user)

    def _refresh_then_reject(*_args, **_kwargs):
        creds.token = "tok-refreshed"
        raise _http_401()

    monkeypatch.setattr(email_discovery_service, "list_new_email_ids", _refresh_then_reject)

    with pytest.raises(GmailAuthExpiredError):
        await email_discovery_service.discover_gmail_emails(_ctx(test_org, test_user))

    await db.refresh(integration)
    assert integration.access_token == "tok"


@pytest.mark.asyncio
async def test_non_auth_error_while_listing_writes_no_flag_and_no_log(
    db: AsyncSession, test_user: User, test_org: Organization,
    creds: MagicMock, monkeypatch: pytest.MonkeyPatch,
) -> None:
    integration = await _seed(db, test_org, test_user)
    resp = MagicMock()
    resp.status = 500
    server_error = HttpError(resp=resp, content=b"Backend Error")

    def _fail(*_args, **_kwargs):
        raise server_error

    monkeypatch.setattr(email_discovery_service, "list_new_email_ids", _fail)

    with pytest.raises(HttpError):
        await email_discovery_service.discover_gmail_emails(_ctx(test_org, test_user))

    await db.refresh(integration)
    assert integration.needs_reauth is False
    assert await _sync_logs(db, test_org) == []
