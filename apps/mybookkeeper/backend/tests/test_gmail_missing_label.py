"""A Gmail connection limited to a label the mailbox doesn't have syncs nothing.

Before, a missing label was logged and the sync went ahead with no label
filter, pulling every email in the mailbox into the books. Each test runs the
real discovery code against the database with only the Gmail client faked.
"""
from collections.abc import Iterator
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.integrations import sync_gmail
from app.core.context import RequestContext
from app.models.integrations.gmail_sync_target import GmailSyncTarget
from app.models.integrations.integration import Integration
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole
from app.models.user.user import User
from app.repositories import email_queue_repo, sync_log_repo
from app.services.email import email_discovery_service
from app.services.email.constants import GMAIL_LABEL_NOT_FOUND_MESSAGE
from app.services.email.email_discovery_service import discover_gmail_emails
from app.services.email.exceptions import GmailLabelNotFoundError
from app.services.integrations import integration_service
from app.workers import email_sync_worker
from app.workers.email_sync_worker import sync_gmail_connection

_MISSING = "Receipts"


def _gmail_with_labels(*names: str) -> MagicMock:
    service = MagicMock()
    service.users.return_value.labels.return_value.list.return_value.execute.return_value = {
        "labels": [{"id": f"Label_{i}", "name": name} for i, name in enumerate(names)],
    }
    service.users.return_value.messages.return_value.list.return_value.execute.return_value = {
        "messages": [{"id": "msg-1"}],
    }
    return service


@pytest.fixture
def gmail() -> MagicMock:
    return _gmail_with_labels("INBOX", "Bills")


@pytest.fixture(autouse=True)
def _wire(db: AsyncSession, gmail: MagicMock) -> Iterator[None]:
    @asynccontextmanager
    async def _session():
        yield db

    with (
        patch.object(email_discovery_service, "unit_of_work", _session),
        patch.object(integration_service, "AsyncSessionLocal", _session),
        patch.object(email_sync_worker, "AsyncSessionLocal", _session),
        patch.object(email_discovery_service, "get_gmail_service", return_value=(gmail, MagicMock(token="t"))),
    ):
        yield


@pytest.fixture
async def connection(db: AsyncSession, test_org: Organization, test_user: User) -> Integration:
    integration = Integration(
        organization_id=test_org.id,
        user_id=test_user.id,
        provider="gmail",
        metadata_={"scopes": [], "gmail_label": _MISSING},
    )
    integration.access_token = "access"
    integration.refresh_token = "refresh"
    db.add(integration)
    await db.commit()
    return integration


def _ctx(org: Organization, user: User) -> RequestContext:
    return RequestContext(organization_id=org.id, user_id=user.id, org_role=OrgRole.OWNER)


async def _assert_failed_and_nothing_synced(db: AsyncSession, org: Organization, gmail: MagicMock) -> None:
    logs = await sync_log_repo.list_recent(db, org.id, "gmail")
    assert [(log.status, log.error) for log in logs] == [
        ("failed", GMAIL_LABEL_NOT_FOUND_MESSAGE.format(label=_MISSING)),
    ]
    assert await email_queue_repo.get_message_ids(db, org.id) == set()
    gmail.users.return_value.messages.return_value.list.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.usefixtures("connection")
async def test_discovery_stops_and_records_why(
    db: AsyncSession, test_org: Organization, test_user: User, gmail: MagicMock,
) -> None:
    with pytest.raises(GmailLabelNotFoundError) as caught:
        await discover_gmail_emails(_ctx(test_org, test_user))

    assert caught.value.label == _MISSING
    await _assert_failed_and_nothing_synced(db, test_org, gmail)


@pytest.mark.asyncio
@pytest.mark.usefixtures("connection")
async def test_sync_button_gets_a_422_naming_the_label(
    db: AsyncSession, test_org: Organization, test_user: User, gmail: MagicMock,
) -> None:
    with pytest.raises(HTTPException) as caught:
        await sync_gmail(ctx=_ctx(test_org, test_user))

    assert caught.value.status_code == 422
    assert caught.value.detail == GMAIL_LABEL_NOT_FOUND_MESSAGE.format(label=_MISSING)
    await _assert_failed_and_nothing_synced(db, test_org, gmail)


@pytest.mark.asyncio
@pytest.mark.usefixtures("connection")
async def test_scheduled_sync_stops_without_fetching_or_extracting(
    db: AsyncSession, test_org: Organization, test_user: User, gmail: MagicMock,
) -> None:
    with (
        patch.object(email_sync_worker, "drain_gmail_fetch", new=AsyncMock()) as fetch,
        patch.object(email_sync_worker, "drain_claude_extraction", new=AsyncMock()) as extract,
    ):
        await sync_gmail_connection(GmailSyncTarget(organization_id=test_org.id, user_id=test_user.id))

    fetch.assert_not_awaited()
    extract.assert_not_awaited()
    await _assert_failed_and_nothing_synced(db, test_org, gmail)


@pytest.mark.asyncio
@pytest.mark.parametrize("label_case", [_MISSING, _MISSING.upper()])
async def test_an_existing_label_filters_the_search(
    db: AsyncSession, connection: Integration, test_org: Organization, test_user: User, label_case: str,
) -> None:
    gmail = _gmail_with_labels("INBOX", label_case)
    with patch.object(email_discovery_service, "get_gmail_service", return_value=(gmail, MagicMock(token="t"))):
        await discover_gmail_emails(_ctx(test_org, test_user))

    list_kwargs = gmail.users.return_value.messages.return_value.list.call_args.kwargs
    assert list_kwargs["labelIds"] == ["Label_1"]
    logs = await sync_log_repo.list_recent(db, test_org.id, "gmail")
    assert all(log.status != "failed" for log in logs)


@pytest.mark.asyncio
async def test_a_failed_label_lookup_fails_the_sync_instead_of_dropping_the_filter(
    connection: Integration, test_org: Organization, test_user: User, gmail: MagicMock,
) -> None:
    gmail.users.return_value.labels.return_value.list.return_value.execute.side_effect = RuntimeError("timeout")

    with pytest.raises(RuntimeError, match="timeout"):
        await discover_gmail_emails(_ctx(test_org, test_user))

    gmail.users.return_value.messages.return_value.list.assert_not_called()
