import uuid
from dataclasses import dataclass
from unittest.mock import AsyncMock, patch

import pytest

from app.core.context import RequestContext
from app.models.integrations.gmail_sync_target import GmailSyncTarget
from app.models.organization.organization_member import OrgRole
from app.workers.email_sync_worker import sync_gmail_connection


@dataclass
class FakeMembership:
    organization_id: uuid.UUID
    user_id: uuid.UUID


@dataclass
class FakeDiscoverResult:
    sync_log_id: int | None


def _target() -> GmailSyncTarget:
    return GmailSyncTarget(organization_id=uuid.uuid4(), user_id=uuid.uuid4())


@pytest.mark.asyncio
async def test_every_stage_runs_as_the_connection_and_its_org() -> None:
    target = _target()
    captured_ctxs: list[RequestContext] = []

    async def fake_discover(ctx: RequestContext) -> FakeDiscoverResult:
        captured_ctxs.append(ctx)
        return FakeDiscoverResult(sync_log_id=None)

    async def fake_drain(ctx: RequestContext, sync_log_id: int | None = None) -> None:
        captured_ctxs.append(ctx)

    with (
        patch("app.workers.email_sync_worker.AsyncSessionLocal") as mock_session_cls,
        patch("app.workers.email_sync_worker.organization_repo") as mock_org_repo,
        patch("app.workers.email_sync_worker.discover_gmail_emails", side_effect=fake_discover),
        patch("app.workers.email_sync_worker.drain_gmail_fetch", side_effect=fake_drain),
        patch("app.workers.email_sync_worker.drain_claude_extraction", side_effect=fake_drain),
    ):
        mock_db = AsyncMock()
        mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)
        mock_org_repo.get_member = AsyncMock(
            return_value=FakeMembership(organization_id=target.organization_id, user_id=target.user_id),
        )

        await sync_gmail_connection(target)

    mock_org_repo.get_member.assert_awaited_once_with(mock_db, target.organization_id, target.user_id)
    assert len(captured_ctxs) == 3
    for ctx in captured_ctxs:
        assert ctx.organization_id == target.organization_id
        assert ctx.user_id == target.user_id
        assert ctx.org_role == OrgRole.OWNER


@pytest.mark.asyncio
async def test_finalizes_the_sync_log_when_discovery_opened_one() -> None:
    target = _target()
    sync_log_id = 42

    with (
        patch("app.workers.email_sync_worker.AsyncSessionLocal") as mock_session_cls,
        patch("app.workers.email_sync_worker.organization_repo") as mock_org_repo,
        patch("app.workers.email_sync_worker.discover_gmail_emails", return_value=FakeDiscoverResult(sync_log_id=sync_log_id)),
        patch("app.workers.email_sync_worker.drain_gmail_fetch", new_callable=AsyncMock),
        patch("app.workers.email_sync_worker.drain_claude_extraction", new_callable=AsyncMock),
        patch("app.workers.email_sync_worker.finalize_sync_log", new_callable=AsyncMock) as mock_finalize,
    ):
        mock_db = AsyncMock()
        mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)
        mock_org_repo.get_member = AsyncMock(
            return_value=FakeMembership(organization_id=target.organization_id, user_id=target.user_id),
        )

        await sync_gmail_connection(target)

    mock_finalize.assert_awaited_once()
    call_args = mock_finalize.call_args
    assert call_args[0][0] == sync_log_id
    assert call_args[0][1].organization_id == target.organization_id
