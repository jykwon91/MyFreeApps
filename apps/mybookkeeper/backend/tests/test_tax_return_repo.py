import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.tax.tax_return import TaxReturn
from app.models.user.user import User
from app.repositories import tax_return_repo


class TestGetOrCreateForYear:
    @pytest.mark.asyncio
    async def test_creates_new_return(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        result = await tax_return_repo.get_or_create_for_year(
            db, test_org.id, 2025,
        )
        assert result.id is not None
        assert result.organization_id == test_org.id
        assert result.tax_year == 2025
        assert result.status == "draft"
        assert result.needs_recompute is True

    @pytest.mark.asyncio
    async def test_returns_existing_return(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        first = await tax_return_repo.get_or_create_for_year(
            db, test_org.id, 2025,
        )
        await db.commit()
        second = await tax_return_repo.get_or_create_for_year(
            db, test_org.id, 2025,
        )
        assert first.id == second.id

    @pytest.mark.asyncio
    async def test_different_years_create_separate(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        r2024 = await tax_return_repo.get_or_create_for_year(
            db, test_org.id, 2024,
        )
        r2025 = await tax_return_repo.get_or_create_for_year(
            db, test_org.id, 2025,
        )
        assert r2024.id != r2025.id


class TestListByOrg:
    @pytest.mark.asyncio
    async def test_lists_returns_ordered_by_year_desc(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        await tax_return_repo.get_or_create_for_year(db, test_org.id, 2023)
        await tax_return_repo.get_or_create_for_year(db, test_org.id, 2025)
        await tax_return_repo.get_or_create_for_year(db, test_org.id, 2024)
        await db.commit()

        results = await tax_return_repo.list_by_org(db, test_org.id)
        years = [r.tax_year for r in results]
        assert years == [2025, 2024, 2023]

    @pytest.mark.asyncio
    async def test_scoped_to_org(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        await tax_return_repo.get_or_create_for_year(db, test_org.id, 2025)
        await db.commit()

        results = await tax_return_repo.list_by_org(db, uuid.uuid4())
        assert len(results) == 0


class TestGetById:
    @pytest.mark.asyncio
    async def test_returns_return(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        created = await tax_return_repo.get_or_create_for_year(
            db, test_org.id, 2025,
        )
        await db.commit()

        found = await tax_return_repo.get_by_id(db, created.id, test_org.id)
        assert found is not None
        assert found.id == created.id

    @pytest.mark.asyncio
    async def test_returns_none_wrong_org(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        created = await tax_return_repo.get_or_create_for_year(
            db, test_org.id, 2025,
        )
        await db.commit()

        found = await tax_return_repo.get_by_id(db, created.id, uuid.uuid4())
        assert found is None


class TestSetNeedsRecompute:
    @pytest.mark.asyncio
    async def test_sets_flag(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        tax_return = await tax_return_repo.get_or_create_for_year(
            db, test_org.id, 2025,
        )
        assert tax_return.needs_recompute is True

        await tax_return_repo.set_needs_recompute(db, tax_return, value=False)
        assert tax_return.needs_recompute is False

        await tax_return_repo.set_needs_recompute(db, tax_return, value=True)
        assert tax_return.needs_recompute is True
