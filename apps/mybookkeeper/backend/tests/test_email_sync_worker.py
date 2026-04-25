import uuid
from dataclasses import dataclass
from unittest.mock import AsyncMock, patch

import pytest

from app.core.context import RequestContext
from app.models.organization.organization_member import OrgRole


@dataclass
class FakeMembership:
    organization_id: uuid.UUID
    user_id: uuid.UUID


@dataclass
class FakeDiscoverResult:
    sync_log_id: int | None


@pytest.mark.asyncio
async def test_sync_gmail_builds_context_from_org_membership() -> None:
    """Worker derives org context from user's org membership."""
    user_id = uuid.uuid4()
    org_id = uuid.uuid4()
    membership = FakeMembership(organization_id=org_id, user_id=user_id)

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
        mock_org_repo.list_for_user = AsyncMock(return_value=[membership])

        from app.workers.email_sync_worker import sync_gmail_for_user

        await sync_gmail_for_user(str(user_id))

    mock_org_repo.list_for_user.assert_awaited_once_with(mock_db, user_id)
    assert len(captured_ctxs) == 3
    for ctx in captured_ctxs:
        assert ctx.organization_id == org_id
        assert ctx.user_id == user_id
        assert ctx.org_role == OrgRole.OWNER


@pytest.mark.asyncio
async def test_sync_gmail_skips_user_without_org() -> None:
    """Worker skips sync when user has no org memberships."""
    user_id = uuid.uuid4()

    with (
        patch("app.workers.email_sync_worker.AsyncSessionLocal") as mock_session_cls,
        patch("app.workers.email_sync_worker.organization_repo") as mock_org_repo,
        patch("app.workers.email_sync_worker.discover_gmail_emails") as mock_discover,
    ):
        mock_db = AsyncMock()
        mock_session_cls.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_session_cls.return_value.__aexit__ = AsyncMock(return_value=False)
        mock_org_repo.list_for_user = AsyncMock(return_value=[])

        from app.workers.email_sync_worker import sync_gmail_for_user

        await sync_gmail_for_user(str(user_id))

    mock_discover.assert_not_awaited()


@pytest.mark.asyncio
async def test_sync_gmail_finalizes_sync_log_when_present() -> None:
    """Worker calls finalize_sync_log when discover returns a sync_log_id."""
    user_id = uuid.uuid4()
    org_id = uuid.uuid4()
    membership = FakeMembership(organization_id=org_id, user_id=user_id)
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
        mock_org_repo.list_for_user = AsyncMock(return_value=[membership])

        from app.workers.email_sync_worker import sync_gmail_for_user

        await sync_gmail_for_user(str(user_id))

    mock_finalize.assert_awaited_once()
    call_args = mock_finalize.call_args
    assert call_args[0][0] == sync_log_id
    assert call_args[0][1].organization_id == org_id
