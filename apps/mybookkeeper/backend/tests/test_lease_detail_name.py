"""One lease's page names its tenant without a second request."""
from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories.applicants import applicant_repo
from app.repositories.leases import signed_lease_repo
from app.services.leases import lease_lifecycle_service


async def _read_lease(
    db: AsyncSession, user: User, org: Organization, legal_name: str | None,
) -> str | None:
    applicant = await applicant_repo.create(
        db, organization_id=org.id, user_id=user.id, legal_name=legal_name,
    )
    lease = await signed_lease_repo.create(
        db, user_id=user.id, organization_id=org.id, applicant_id=applicant.id,
        listing_id=None, values={}, starts_on=None, ends_on=None, status="active",
    )
    await db.commit()

    @asynccontextmanager
    async def same_session() -> AsyncIterator[AsyncSession]:
        yield db

    with patch("app.services.leases.lease_lifecycle_service.unit_of_work", same_session):
        detail = await lease_lifecycle_service.get_lease(
            user_id=user.id, organization_id=org.id, lease_id=lease.id,
        )
    return detail.applicant_legal_name


@pytest.mark.asyncio
async def test_names_the_tenant(db: AsyncSession, test_user: User, test_org: Organization) -> None:
    assert await _read_lease(db, test_user, test_org, "Dana Reed") == "Dana Reed"


@pytest.mark.asyncio
async def test_a_tenant_with_no_name_stays_empty(
    db: AsyncSession, test_user: User, test_org: Organization,
) -> None:
    assert await _read_lease(db, test_user, test_org, None) is None
