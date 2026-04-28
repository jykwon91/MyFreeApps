"""Repository test for ``applicant_repo.count_for_user`` (added in PR 3.1b)."""
from __future__ import annotations

import datetime as _dt

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories.applicants import applicant_repo


class TestCountForUser:
    @pytest.mark.asyncio
    async def test_counts_active_only_by_default(
        self,
        db: AsyncSession,
        test_user: User,
        test_org: Organization,
    ) -> None:
        await applicant_repo.create(
            db, organization_id=test_org.id, user_id=test_user.id, stage="lead",
        )
        await applicant_repo.create(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            stage="screening_pending",
        )
        soft_deleted = await applicant_repo.create(
            db, organization_id=test_org.id, user_id=test_user.id, stage="lead",
        )
        soft_deleted.deleted_at = _dt.datetime.now(_dt.timezone.utc)
        await db.flush()

        active = await applicant_repo.count_for_user(
            db, organization_id=test_org.id, user_id=test_user.id,
        )
        assert active == 2

        with_deleted = await applicant_repo.count_for_user(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            include_deleted=True,
        )
        assert with_deleted == 3

    @pytest.mark.asyncio
    async def test_counts_with_stage_filter(
        self,
        db: AsyncSession,
        test_user: User,
        test_org: Organization,
    ) -> None:
        await applicant_repo.create(
            db, organization_id=test_org.id, user_id=test_user.id, stage="lead",
        )
        await applicant_repo.create(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            stage="screening_pending",
        )
        await applicant_repo.create(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            stage="screening_pending",
        )

        leads = await applicant_repo.count_for_user(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            stage="lead",
        )
        assert leads == 1

        screening = await applicant_repo.count_for_user(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            stage="screening_pending",
        )
        assert screening == 2
