"""Spending categories against a real (SQLite) database.

The service opens its own session through ``unit_of_work``; each test patches
it to the test session so commits behave as they do in production.

What is pinned here: defaults are seeded lazily on first list, a user-defined
category can be created/renamed/archived/unarchived, duplicate names are
rejected, default categories cannot be archived, and two orgs in the same
workspace do not share categories.
"""
from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager, contextmanager
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.user.user import User
from app.schemas.spending_categories.spending_category_create_request import SpendingCategoryCreateRequest
from app.schemas.spending_categories.spending_category_update_request import SpendingCategoryUpdateRequest
from app.services.spending_categories import spending_category_service as svc

pytestmark = pytest.mark.asyncio


@contextmanager
def _session(db: AsyncSession) -> Iterator[None]:
    @asynccontextmanager
    async def _uow():
        yield db
        await db.commit()

    with patch.object(svc, "unit_of_work", _uow):
        yield


async def _list(db: AsyncSession, org: Organization, include_archived: bool = False):
    with _session(db):
        return await svc.list_categories(organization_id=org.id, include_archived=include_archived)


async def _create(db: AsyncSession, org: Organization, name: str):
    with _session(db):
        return await svc.create_category(
            organization_id=org.id, payload=SpendingCategoryCreateRequest(name=name),
        )


class TestDefaults:
    async def test_first_list_seeds_default_categories(
        self, db: AsyncSession, test_org: Organization,
    ) -> None:
        result = await _list(db, test_org)
        assert len(result.items) > 0
        default_names = {c.name for c in result.items if c.is_default}
        assert "Dining & restaurants" in default_names
        assert "Groceries" in default_names

    async def test_second_list_does_not_duplicate(
        self, db: AsyncSession, test_org: Organization,
    ) -> None:
        await _list(db, test_org)
        result = await _list(db, test_org)
        names = [c.name for c in result.items]
        assert len(names) == len(set(names))

    async def test_orgs_do_not_share_categories(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        # Create a second org
        org2 = Organization(id=uuid.uuid4(), name="Second Org", created_by=test_user.id)
        db.add(org2)
        await db.commit()

        await _list(db, test_org)   # seeds defaults for org1
        await _list(db, org2)       # seeds defaults for org2

        # Each org has its own independent set
        result1 = await _list(db, test_org)
        result2 = await _list(db, org2)
        ids1 = {c.id for c in result1.items}
        ids2 = {c.id for c in result2.items}
        assert ids1.isdisjoint(ids2)


class TestCreateAndRename:
    async def test_create_adds_a_live_category(
        self, db: AsyncSession, test_org: Organization,
    ) -> None:
        cat = await _create(db, test_org, "My Custom Category")
        assert cat.name == "My Custom Category"
        assert cat.is_default is False
        assert cat.archived_at is None

    async def test_duplicate_name_raises_conflict(
        self, db: AsyncSession, test_org: Organization,
    ) -> None:
        await _create(db, test_org, "Hobby")
        with pytest.raises(svc.SpendingCategoryConflictError):
            await _create(db, test_org, "Hobby")

    async def test_rename_updates_the_name(
        self, db: AsyncSession, test_org: Organization,
    ) -> None:
        cat = await _create(db, test_org, "Old Name")
        with _session(db):
            updated = await svc.update_category(
                organization_id=test_org.id,
                category_id=cat.id,
                payload=SpendingCategoryUpdateRequest(name="New Name"),
            )
        assert updated.name == "New Name"

    async def test_rename_to_existing_name_raises_conflict(
        self, db: AsyncSession, test_org: Organization,
    ) -> None:
        await _create(db, test_org, "Taken")
        cat = await _create(db, test_org, "Free")
        with pytest.raises(svc.SpendingCategoryConflictError):
            with _session(db):
                await svc.update_category(
                    organization_id=test_org.id,
                    category_id=cat.id,
                    payload=SpendingCategoryUpdateRequest(name="Taken"),
                )

    async def test_update_not_found_raises(
        self, db: AsyncSession, test_org: Organization,
    ) -> None:
        with pytest.raises(svc.SpendingCategoryNotFoundError):
            with _session(db):
                await svc.update_category(
                    organization_id=test_org.id,
                    category_id=uuid.uuid4(),
                    payload=SpendingCategoryUpdateRequest(name="X"),
                )


class TestArchive:
    async def test_archive_sets_archived_at(
        self, db: AsyncSession, test_org: Organization,
    ) -> None:
        cat = await _create(db, test_org, "To Archive")
        with _session(db):
            archived = await svc.archive_category(organization_id=test_org.id, category_id=cat.id)
        assert archived.archived_at is not None

    async def test_archived_category_excluded_by_default(
        self, db: AsyncSession, test_org: Organization,
    ) -> None:
        cat = await _create(db, test_org, "Will Archive")
        with _session(db):
            await svc.archive_category(organization_id=test_org.id, category_id=cat.id)
        result = await _list(db, test_org, include_archived=False)
        ids = {c.id for c in result.items}
        assert cat.id not in ids

    async def test_archived_category_included_with_flag(
        self, db: AsyncSession, test_org: Organization,
    ) -> None:
        cat = await _create(db, test_org, "Will Archive 2")
        with _session(db):
            await svc.archive_category(organization_id=test_org.id, category_id=cat.id)
        result = await _list(db, test_org, include_archived=True)
        ids = {c.id for c in result.items}
        assert cat.id in ids

    async def test_unarchive_clears_archived_at(
        self, db: AsyncSession, test_org: Organization,
    ) -> None:
        cat = await _create(db, test_org, "To Restore")
        with _session(db):
            await svc.archive_category(organization_id=test_org.id, category_id=cat.id)
        with _session(db):
            restored = await svc.unarchive_category(organization_id=test_org.id, category_id=cat.id)
        assert restored.archived_at is None

    async def test_cannot_archive_default_category(
        self, db: AsyncSession, test_org: Organization,
    ) -> None:
        # Seed defaults first
        result = await _list(db, test_org)
        default_cat = next(c for c in result.items if c.is_default)
        with pytest.raises(svc.SpendingCategoryDefaultArchiveError):
            with _session(db):
                await svc.archive_category(organization_id=test_org.id, category_id=default_cat.id)
