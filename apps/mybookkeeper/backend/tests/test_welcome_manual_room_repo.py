"""Repository tests for welcome_manual_rooms — ordering, counts, allowlist,
manual scoping.
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories.welcome_manuals import welcome_manual_repo, welcome_manual_room_repo


async def _make_manual(db: AsyncSession, org: Organization, user: User, title: str = "M"):
    manual = await welcome_manual_repo.create_manual(
        db, organization_id=org.id, user_id=user.id,
        property_id=None, title=title, intro_text=None,
    )
    await db.flush()
    return manual


class TestOrdering:
    @pytest.mark.asyncio
    async def test_list_in_display_order(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = await _make_manual(db, test_org, test_user)
        await welcome_manual_room_repo.create(db, manual_id=manual.id, name="Back", display_order=1)
        await welcome_manual_room_repo.create(db, manual_id=manual.id, name="Front", display_order=0)
        await db.commit()
        rooms = await welcome_manual_room_repo.list_by_manual(db, manual.id)
        assert [r.name for r in rooms] == ["Front", "Back"]

    @pytest.mark.asyncio
    async def test_next_display_order(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = await _make_manual(db, test_org, test_user)
        assert await welcome_manual_room_repo.next_display_order(db, manual.id) == 0
        await welcome_manual_room_repo.create(db, manual_id=manual.id, name="A", display_order=0)
        await welcome_manual_room_repo.create(db, manual_id=manual.id, name="B", display_order=1)
        await db.flush()
        assert await welcome_manual_room_repo.next_display_order(db, manual.id) == 2


class TestScoping:
    @pytest.mark.asyncio
    async def test_rooms_do_not_leak_between_manuals(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        m1 = await _make_manual(db, test_org, test_user, "M1")
        m2 = await _make_manual(db, test_org, test_user, "M2")
        room = await welcome_manual_room_repo.create(
            db, manual_id=m1.id, name="Room 1", display_order=0,
        )
        await db.commit()

        assert await welcome_manual_room_repo.get_by_id(db, room.id, m1.id) is not None
        # Same room id, wrong manual — must not resolve.
        assert await welcome_manual_room_repo.get_by_id(db, room.id, m2.id) is None
        assert await welcome_manual_room_repo.list_by_manual(db, m2.id) == []

    @pytest.mark.asyncio
    async def test_count_by_manual(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        m1 = await _make_manual(db, test_org, test_user, "M1")
        m2 = await _make_manual(db, test_org, test_user, "M2")
        await welcome_manual_room_repo.create(db, manual_id=m1.id, name="A", display_order=0)
        await welcome_manual_room_repo.create(db, manual_id=m1.id, name="B", display_order=1)
        await db.commit()
        assert await welcome_manual_room_repo.count_by_manual(db, m1.id) == 2
        assert await welcome_manual_room_repo.count_by_manual(db, m2.id) == 0


class TestUpdate:
    @pytest.mark.asyncio
    async def test_renames(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = await _make_manual(db, test_org, test_user)
        room = await welcome_manual_room_repo.create(
            db, manual_id=manual.id, name="New room", display_order=0,
        )
        await db.commit()
        updated = await welcome_manual_room_repo.update(
            db, room.id, manual.id, {"name": "Front bedroom"},
        )
        assert updated is not None
        assert updated.name == "Front bedroom"

    @pytest.mark.asyncio
    async def test_ignores_fields_outside_the_allowlist(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = await _make_manual(db, test_org, test_user)
        other = await _make_manual(db, test_org, test_user, "Other")
        room = await welcome_manual_room_repo.create(
            db, manual_id=manual.id, name="A", display_order=0,
        )
        await db.commit()
        updated = await welcome_manual_room_repo.update(
            db, room.id, manual.id,
            {"name": "B", "manual_id": other.id, "display_order": 99, "id": uuid.uuid4()},
        )
        assert updated is not None
        assert updated.name == "B"
        # manual_id / display_order / id are not host-editable.
        assert updated.manual_id == manual.id
        assert updated.display_order == 0
        assert updated.id == room.id

    @pytest.mark.asyncio
    async def test_update_wrong_manual_returns_none(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        m1 = await _make_manual(db, test_org, test_user, "M1")
        m2 = await _make_manual(db, test_org, test_user, "M2")
        room = await welcome_manual_room_repo.create(
            db, manual_id=m1.id, name="A", display_order=0,
        )
        await db.commit()
        assert await welcome_manual_room_repo.update(db, room.id, m2.id, {"name": "X"}) is None


class TestDelete:
    @pytest.mark.asyncio
    async def test_deletes_and_returns_the_row(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = await _make_manual(db, test_org, test_user)
        room = await welcome_manual_room_repo.create(
            db, manual_id=manual.id, name="A", display_order=0,
        )
        await db.commit()
        deleted = await welcome_manual_room_repo.delete_by_id(db, room.id, manual.id)
        assert deleted is not None
        assert deleted.name == "A"
        await db.commit()
        assert await welcome_manual_room_repo.list_by_manual(db, manual.id) == []

    @pytest.mark.asyncio
    async def test_delete_wrong_manual_returns_none(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        m1 = await _make_manual(db, test_org, test_user, "M1")
        m2 = await _make_manual(db, test_org, test_user, "M2")
        room = await welcome_manual_room_repo.create(
            db, manual_id=m1.id, name="A", display_order=0,
        )
        await db.commit()
        assert await welcome_manual_room_repo.delete_by_id(db, room.id, m2.id) is None
        assert await welcome_manual_room_repo.get_by_id(db, room.id, m1.id) is not None
