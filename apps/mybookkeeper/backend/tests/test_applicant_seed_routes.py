"""Tests for the test-only applicant hard-delete route."""
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.context import RequestContext
from app.models.applicants.applicant import Applicant
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole
from app.models.user.user import User
from app.repositories.applicants import applicant_repo
from app.test_helpers.seed import delete_applicant


@pytest.fixture(autouse=True)
def _patch_session(db: AsyncSession) -> Iterator[None]:
    @asynccontextmanager
    async def _fake_uow():
        yield db

    with patch("app.test_helpers.seed.unit_of_work", _fake_uow):
        yield


@pytest.fixture(autouse=True)
def _test_mode() -> Iterator[None]:
    original = settings.allow_test_admin_promotion
    settings.allow_test_admin_promotion = True
    try:
        yield
    finally:
        settings.allow_test_admin_promotion = original


def _ctx(org_id: uuid.UUID, user: User) -> RequestContext:
    return RequestContext(user_id=user.id, organization_id=org_id, org_role=OrgRole.OWNER)


async def _seeded_applicant(db: AsyncSession, org: Organization, user: User) -> uuid.UUID:
    applicant = Applicant(organization_id=org.id, user_id=user.id, stage="lead")
    db.add(applicant)
    await db.flush()
    return applicant.id


async def _exists(db: AsyncSession, applicant_id: uuid.UUID, org: Organization, user: User) -> bool:
    found = await applicant_repo.get(
        db, applicant_id=applicant_id, organization_id=org.id,
        user_id=user.id, include_deleted=True,
    )
    return found is not None


class TestDeleteApplicant:
    @pytest.mark.asyncio
    async def test_hard_deletes_my_applicant(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        applicant_id = await _seeded_applicant(db, test_org, test_user)

        await delete_applicant(applicant_id=applicant_id, ctx=_ctx(test_org.id, test_user))

        assert not await _exists(db, applicant_id, test_org, test_user)

    @pytest.mark.asyncio
    async def test_an_applicant_that_does_not_exist_is_404(
        self, test_user: User, test_org: Organization,
    ) -> None:
        with pytest.raises(HTTPException) as exc:
            await delete_applicant(applicant_id=uuid.uuid4(), ctx=_ctx(test_org.id, test_user))

        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    async def test_an_applicant_already_deleted_is_404(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        applicant_id = await _seeded_applicant(db, test_org, test_user)
        await delete_applicant(applicant_id=applicant_id, ctx=_ctx(test_org.id, test_user))

        with pytest.raises(HTTPException) as exc:
            await delete_applicant(applicant_id=applicant_id, ctx=_ctx(test_org.id, test_user))

        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    async def test_another_organizations_applicant_is_404_and_kept(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        applicant_id = await _seeded_applicant(db, test_org, test_user)

        with pytest.raises(HTTPException) as exc:
            await delete_applicant(applicant_id=applicant_id, ctx=_ctx(uuid.uuid4(), test_user))

        assert exc.value.status_code == 404
        assert await _exists(db, applicant_id, test_org, test_user)

    @pytest.mark.asyncio
    async def test_outside_test_mode_is_404_and_kept(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        applicant_id = await _seeded_applicant(db, test_org, test_user)
        settings.allow_test_admin_promotion = False

        with pytest.raises(HTTPException) as exc:
            await delete_applicant(applicant_id=applicant_id, ctx=_ctx(test_org.id, test_user))

        assert exc.value.status_code == 404
        assert await _exists(db, applicant_id, test_org, test_user)
