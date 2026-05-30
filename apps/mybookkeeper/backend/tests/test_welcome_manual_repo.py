"""Repository tests for welcome_manuals — CRUD, ordering, soft-delete, org scope."""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories.welcome_manuals import welcome_manual_repo


async def _create(db: AsyncSession, org: Organization, user: User, *, title: str = "Guide"):
    manual = await welcome_manual_repo.create_manual(
        db,
        organization_id=org.id,
        user_id=user.id,
        property_id=None,
        title=title,
        intro_text=None,
    )
    await db.flush()
    return manual


class TestCreateAndGet:
    @pytest.mark.asyncio
    async def test_create_then_get(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual = await welcome_manual_repo.create_manual(
            db, organization_id=test_org.id, user_id=test_user.id,
            property_id=None, title="Cabin Guide", intro_text="Welcome!",
        )
        await db.commit()
        fetched = await welcome_manual_repo.get_by_id(db, manual.id, test_org.id)
        assert fetched is not None
        assert fetched.title == "Cabin Guide"
        assert fetched.intro_text == "Welcome!"
        assert fetched.property_id is None

    @pytest.mark.asyncio
    async def test_get_cross_org_returns_none(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual = await _create(db, test_org, test_user)
        await db.commit()
        assert await welcome_manual_repo.get_by_id(db, manual.id, uuid.uuid4()) is None


class TestListAndCount:
    @pytest.mark.asyncio
    async def test_list_and_count(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        for i in range(3):
            await _create(db, test_org, test_user, title=f"M{i}")
        await db.commit()
        rows = await welcome_manual_repo.list_by_organization(db, test_org.id, limit=50, offset=0)
        assert len(rows) == 3
        assert await welcome_manual_repo.count_by_organization(db, test_org.id) == 3

    @pytest.mark.asyncio
    async def test_list_paginates(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        for i in range(5):
            await _create(db, test_org, test_user, title=f"M{i}")
        await db.commit()
        page = await welcome_manual_repo.list_by_organization(db, test_org.id, limit=2, offset=2)
        assert len(page) == 2

    @pytest.mark.asyncio
    async def test_list_excludes_soft_deleted(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual = await _create(db, test_org, test_user, title="ToDelete")
        await db.commit()
        assert await welcome_manual_repo.soft_delete_by_id(db, manual.id, test_org.id) is True
        await db.commit()
        assert await welcome_manual_repo.list_by_organization(db, test_org.id, limit=50, offset=0) == []
        assert await welcome_manual_repo.count_by_organization(db, test_org.id) == 0
        assert await welcome_manual_repo.get_by_id(db, manual.id, test_org.id) is None


class TestUpdate:
    @pytest.mark.asyncio
    async def test_update_allowlisted(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual = await _create(db, test_org, test_user, title="Old")
        await db.commit()
        updated = await welcome_manual_repo.update_manual(
            db, manual.id, test_org.id, {"title": "New", "intro_text": "Hi"},
        )
        assert updated is not None
        assert updated.title == "New"
        assert updated.intro_text == "Hi"

    @pytest.mark.asyncio
    async def test_update_ignores_non_allowlisted(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual = await _create(db, test_org, test_user, title="Keep")
        await db.commit()
        original_org = manual.organization_id
        updated = await welcome_manual_repo.update_manual(
            db, manual.id, test_org.id,
            {"organization_id": uuid.uuid4(), "title": "Renamed"},
        )
        assert updated is not None
        assert updated.organization_id == original_org
        assert updated.title == "Renamed"

    @pytest.mark.asyncio
    async def test_update_missing_returns_none(self, db: AsyncSession, test_org: Organization) -> None:
        assert await welcome_manual_repo.update_manual(
            db, uuid.uuid4(), test_org.id, {"title": "x"},
        ) is None


class TestSoftDelete:
    @pytest.mark.asyncio
    async def test_soft_delete_then_no_op(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual = await _create(db, test_org, test_user, title="D")
        await db.commit()
        assert await welcome_manual_repo.soft_delete_by_id(db, manual.id, test_org.id) is True
        await db.commit()
        # Second delete is a no-op — already soft-deleted.
        assert await welcome_manual_repo.soft_delete_by_id(db, manual.id, test_org.id) is False

    @pytest.mark.asyncio
    async def test_soft_delete_cross_org_is_no_op(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual = await _create(db, test_org, test_user, title="D")
        await db.commit()
        assert await welcome_manual_repo.soft_delete_by_id(db, manual.id, uuid.uuid4()) is False
