"""Tests for the test-only signed-lease hard-delete route."""
import datetime as dt
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.context import RequestContext
from app.models.applicants.applicant import Applicant
from app.models.leases.signed_lease import SignedLease
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember, OrgRole
from app.models.user.user import User
from app.test_helpers.seed import (
    _SeedSignedLeaseRequest,
    hard_delete_signed_lease,
    seed_signed_lease,
)


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


async def _seeded_lease(db: AsyncSession, org: Organization, user: User) -> uuid.UUID:
    applicant = Applicant(id=uuid.uuid4(), organization_id=org.id, user_id=user.id, stage="lead")
    db.add(applicant)
    await db.flush()
    created = await seed_signed_lease(
        payload=_SeedSignedLeaseRequest(
            applicant_id=applicant.id, starts_on=dt.date(2026, 6, 1), ends_on=dt.date(2026, 12, 31),
        ),
        ctx=_ctx(org.id, user),
    )
    return created.id


async def _exists(db: AsyncSession, lease_id: uuid.UUID) -> bool:
    row = await db.execute(select(SignedLease.id).where(SignedLease.id == lease_id))
    return row.scalar_one_or_none() is not None


class TestHardDeleteSignedLease:
    @pytest.mark.asyncio
    async def test_hard_deletes_my_lease(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        lease_id = await _seeded_lease(db, test_org, test_user)

        await hard_delete_signed_lease(lease_id=lease_id, ctx=_ctx(test_org.id, test_user))

        assert not await _exists(db, lease_id)

    @pytest.mark.asyncio
    async def test_a_soft_deleted_lease_is_still_hard_deleted(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        lease_id = await _seeded_lease(db, test_org, test_user)
        lease = await db.get(SignedLease, lease_id)
        assert lease is not None
        lease.deleted_at = dt.datetime.now(dt.timezone.utc)
        await db.flush()

        await hard_delete_signed_lease(lease_id=lease_id, ctx=_ctx(test_org.id, test_user))

        assert not await _exists(db, lease_id)

    @pytest.mark.asyncio
    async def test_a_lease_that_does_not_exist_is_404(
        self, test_user: User, test_org: Organization,
    ) -> None:
        with pytest.raises(HTTPException) as exc:
            await hard_delete_signed_lease(lease_id=uuid.uuid4(), ctx=_ctx(test_org.id, test_user))

        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    async def test_a_lease_already_deleted_is_404(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        lease_id = await _seeded_lease(db, test_org, test_user)
        await hard_delete_signed_lease(lease_id=lease_id, ctx=_ctx(test_org.id, test_user))

        with pytest.raises(HTTPException) as exc:
            await hard_delete_signed_lease(lease_id=lease_id, ctx=_ctx(test_org.id, test_user))

        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    async def test_another_organizations_lease_is_404_and_kept(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        lease_id = await _seeded_lease(db, test_org, test_user)

        with pytest.raises(HTTPException) as exc:
            await hard_delete_signed_lease(lease_id=lease_id, ctx=_ctx(uuid.uuid4(), test_user))

        assert exc.value.status_code == 404
        assert await _exists(db, lease_id)

    @pytest.mark.asyncio
    async def test_another_members_lease_in_my_organization_is_404_and_kept(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        lease_id = await _seeded_lease(db, test_org, test_user)
        other = User(
            id=uuid.uuid4(), email="other-member@example.com", hashed_password="h",
            is_active=True, is_superuser=False, is_verified=True,
        )
        db.add(other)
        await db.flush()
        db.add(OrganizationMember(organization_id=test_org.id, user_id=other.id, org_role="owner"))
        await db.flush()

        with pytest.raises(HTTPException) as exc:
            await hard_delete_signed_lease(lease_id=lease_id, ctx=_ctx(test_org.id, other))

        assert exc.value.status_code == 404
        assert await _exists(db, lease_id)

    @pytest.mark.asyncio
    async def test_outside_test_mode_is_404_and_kept(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        lease_id = await _seeded_lease(db, test_org, test_user)
        settings.allow_test_admin_promotion = False

        with pytest.raises(HTTPException) as exc:
            await hard_delete_signed_lease(lease_id=lease_id, ctx=_ctx(test_org.id, test_user))

        assert exc.value.status_code == 404
        assert await _exists(db, lease_id)
