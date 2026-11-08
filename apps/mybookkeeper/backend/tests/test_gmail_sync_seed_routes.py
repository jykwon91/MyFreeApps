"""Tests for the test-only Gmail sync seed route."""
import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.context import RequestContext
from app.models.email.email_queue import EmailQueue
from app.models.integrations.sync_log import SyncLog
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole
from app.models.user.user import User
from app.test_helpers.gmail_sync_seed import _SeedGmailSyncRequest, _SeedQueueItem, seed_gmail_sync


@pytest.fixture(autouse=True)
def _patch_session(db: AsyncSession):
    @asynccontextmanager
    async def _fake_uow():
        yield db

    with patch("app.test_helpers.gmail_sync_seed.unit_of_work", _fake_uow):
        yield


@pytest.fixture()
def test_mode():
    original = settings.allow_test_admin_promotion
    settings.allow_test_admin_promotion = True
    yield
    settings.allow_test_admin_promotion = original


def _ctx(org_id: uuid.UUID, user: User) -> RequestContext:
    return RequestContext(user_id=user.id, organization_id=org_id, org_role=OrgRole.OWNER)


class TestSeedGmailSync:
    @pytest.mark.asyncio
    async def test_adds_a_finished_session_with_its_queue_items(
        self, db: AsyncSession, test_user: User, test_org: Organization, test_mode: None,
    ) -> None:
        seeded = await seed_gmail_sync(
            _SeedGmailSyncRequest(status="partial", records_added=1, queue=[
                _SeedQueueItem(email_subject="Invoice", attachment_filename="a.pdf", status="fetched"),
                _SeedQueueItem(email_subject="Receipt", status="failed", error="boom"),
            ]),
            ctx=_ctx(test_org.id, test_user),
        )

        log = (await db.execute(select(SyncLog).where(SyncLog.id == seeded.sync_log_id))).scalar_one()
        assert (log.organization_id, log.user_id, log.provider, log.status, log.records_added) == (
            test_org.id, test_user.id, "gmail", "partial", 1,
        )
        assert log.completed_at is not None
        items = (await db.execute(
            select(EmailQueue).where(EmailQueue.id.in_(seeded.queue_item_ids)).order_by(EmailQueue.email_subject)
        )).scalars().all()
        assert [(i.email_subject, i.attachment_filename, i.status, i.error, i.sync_log_id) for i in items] == [
            ("Invoice", "a.pdf", "fetched", None, log.id),
            ("Receipt", None, "failed", "boom", log.id),
        ]
        assert {i.organization_id for i in items} == {test_org.id}
        assert len({i.message_id for i in items}) == 2

    @pytest.mark.asyncio
    async def test_a_running_session_has_not_completed(
        self, db: AsyncSession, test_user: User, test_org: Organization, test_mode: None,
    ) -> None:
        seeded = await seed_gmail_sync(_SeedGmailSyncRequest(status="running"), ctx=_ctx(test_org.id, test_user))

        log = (await db.execute(select(SyncLog).where(SyncLog.id == seeded.sync_log_id))).scalar_one()
        assert log.status == "running"
        assert log.completed_at is None
        assert seeded.queue_item_ids == []

    @pytest.mark.asyncio
    async def test_not_found_outside_test_mode(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        original = settings.allow_test_admin_promotion
        settings.allow_test_admin_promotion = False
        try:
            with pytest.raises(HTTPException) as exc_info:
                await seed_gmail_sync(_SeedGmailSyncRequest(status="success"), ctx=_ctx(test_org.id, test_user))
        finally:
            settings.allow_test_admin_promotion = original
        assert exc_info.value.status_code == 404
        assert (await db.execute(select(SyncLog))).first() is None

    def test_rejects_an_unknown_status(self) -> None:
        with pytest.raises(ValidationError):
            _SeedGmailSyncRequest(status="done")
        with pytest.raises(ValidationError):
            _SeedQueueItem(email_subject="x", status="running")
