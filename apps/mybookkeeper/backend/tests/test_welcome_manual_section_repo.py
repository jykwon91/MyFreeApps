"""Repository tests for welcome_manual_sections — ordering, counts, allowlist."""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories.welcome_manuals import welcome_manual_repo, welcome_manual_section_repo


async def _make_manual(db: AsyncSession, org: Organization, user: User, title: str = "M"):
    manual = await welcome_manual_repo.create_manual(
        db, organization_id=org.id, user_id=user.id,
        property_id=None, title=title, intro_text=None,
    )
    await db.flush()
    return manual


class TestOrdering:
    @pytest.mark.asyncio
    async def test_list_in_display_order(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual = await _make_manual(db, test_org, test_user)
        await welcome_manual_section_repo.create(db, manual_id=manual.id, title="B", body=None, display_order=1)
        await welcome_manual_section_repo.create(db, manual_id=manual.id, title="A", body=None, display_order=0)
        await db.commit()
        sections = await welcome_manual_section_repo.list_by_manual(db, manual.id)
        assert [s.title for s in sections] == ["A", "B"]

    @pytest.mark.asyncio
    async def test_next_display_order(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual = await _make_manual(db, test_org, test_user)
        assert await welcome_manual_section_repo.next_display_order(db, manual.id) == 0
        await welcome_manual_section_repo.create(db, manual_id=manual.id, title="A", body=None, display_order=0)
        await welcome_manual_section_repo.create(db, manual_id=manual.id, title="B", body=None, display_order=1)
        await db.flush()
        assert await welcome_manual_section_repo.next_display_order(db, manual.id) == 2


class TestCounts:
    @pytest.mark.asyncio
    async def test_counts_by_manual_ids(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        m1 = await _make_manual(db, test_org, test_user, "M1")
        m2 = await _make_manual(db, test_org, test_user, "M2")
        m3 = await _make_manual(db, test_org, test_user, "M3")  # zero sections
        await welcome_manual_section_repo.create(db, manual_id=m1.id, title="a", body=None, display_order=0)
        await welcome_manual_section_repo.create(db, manual_id=m1.id, title="b", body=None, display_order=1)
        await welcome_manual_section_repo.create(db, manual_id=m2.id, title="c", body=None, display_order=0)
        await db.commit()
        counts = await welcome_manual_section_repo.counts_by_manual_ids(db, [m1.id, m2.id, m3.id])
        assert counts.get(m1.id) == 2
        assert counts.get(m2.id) == 1
        assert m3.id not in counts

    @pytest.mark.asyncio
    async def test_counts_empty_input(self, db: AsyncSession) -> None:
        assert await welcome_manual_section_repo.counts_by_manual_ids(db, []) == {}


class TestUpdateDelete:
    @pytest.mark.asyncio
    async def test_update_allowlist(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual = await _make_manual(db, test_org, test_user)
        section = await welcome_manual_section_repo.create(
            db, manual_id=manual.id, title="Old", body=None, display_order=0,
        )
        await db.commit()
        updated = await welcome_manual_section_repo.update(
            db, section.id, manual.id,
            {"title": "New", "body": "text", "manual_id": uuid.uuid4()},
        )
        assert updated is not None
        assert updated.title == "New"
        assert updated.body == "text"
        assert updated.manual_id == manual.id  # immutable — not reassigned

    @pytest.mark.asyncio
    async def test_get_wrong_manual_returns_none(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual = await _make_manual(db, test_org, test_user)
        section = await welcome_manual_section_repo.create(
            db, manual_id=manual.id, title="x", body=None, display_order=0,
        )
        await db.commit()
        assert await welcome_manual_section_repo.get_by_id(db, section.id, uuid.uuid4()) is None

    @pytest.mark.asyncio
    async def test_delete_returns_row_then_none(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual = await _make_manual(db, test_org, test_user)
        section = await welcome_manual_section_repo.create(
            db, manual_id=manual.id, title="x", body=None, display_order=0,
        )
        await db.commit()
        deleted = await welcome_manual_section_repo.delete_by_id(db, section.id, manual.id)
        assert deleted is not None and deleted.id == section.id
        assert await welcome_manual_section_repo.delete_by_id(db, section.id, manual.id) is None
