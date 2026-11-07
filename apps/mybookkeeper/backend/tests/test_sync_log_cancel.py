"""Cancelling a Gmail sync only ever touches the caller's organization's sessions."""
import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole
from app.models.user.user import User
from app.repositories.email import sync_log_repo
from app.services.integrations import integration_service


@pytest.fixture(autouse=True)
def _patch_session(db: AsyncSession):
    @asynccontextmanager
    async def _fake_uow():
        yield db

    with patch.object(integration_service, "unit_of_work", _fake_uow):
        yield


def _ctx(org_id: uuid.UUID, user_id: uuid.UUID) -> RequestContext:
    return RequestContext(user_id=user_id, organization_id=org_id, org_role=OrgRole.OWNER)


async def _running_sync(db: AsyncSession, org: Organization, user: User) -> int:
    log = await sync_log_repo.create(db, org.id, user.id, "gmail", "running")
    await db.commit()
    return log.id


class TestCancelRepo:
    @pytest.mark.asyncio
    async def test_cancels_my_running_sync(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        log_id = await _running_sync(db, test_org, test_user)

        assert await sync_log_repo.cancel(db, log_id, test_org.id) is True
        log = await sync_log_repo.get_by_id(db, log_id)
        assert log is not None and log.cancelled_at is not None

    @pytest.mark.asyncio
    async def test_leaves_another_organizations_sync_alone(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        log_id = await _running_sync(db, test_org, test_user)

        assert await sync_log_repo.cancel(db, log_id, uuid.uuid4()) is False
        log = await sync_log_repo.get_by_id(db, log_id)
        assert log is not None and log.cancelled_at is None


class TestCancelGmailSync:
    @pytest.mark.asyncio
    async def test_a_sync_id_from_another_organization_is_not_cancelled(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        log_id = await _running_sync(db, test_org, test_user)

        await integration_service.cancel_gmail_sync(_ctx(uuid.uuid4(), uuid.uuid4()), sync_log_id=log_id)

        log = await sync_log_repo.get_by_id(db, log_id)
        assert log is not None and log.cancelled_at is None

    @pytest.mark.asyncio
    async def test_cancels_my_sync_by_id(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        log_id = await _running_sync(db, test_org, test_user)

        await integration_service.cancel_gmail_sync(_ctx(test_org.id, test_user.id), sync_log_id=log_id)

        log = await sync_log_repo.get_by_id(db, log_id)
        assert log is not None and log.cancelled_at is not None
