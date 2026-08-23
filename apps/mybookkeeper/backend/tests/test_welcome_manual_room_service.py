"""Service-layer tests for welcome_manual_room_service.

Patches ``unit_of_work`` on the room-service module to point at the in-memory
SQLite session, mirroring ``test_welcome_manual_section_service``.
"""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.welcome_manual_constants import WELCOME_MANUAL_MAX_ROOMS
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories.welcome_manuals import welcome_manual_repo, welcome_manual_room_repo
from app.services.welcome_manuals import welcome_manual_room_service


def _patch_uow(db: AsyncSession):
    @asynccontextmanager
    async def _fake():
        yield db

    return patch(
        "app.services.welcome_manuals.welcome_manual_room_service.unit_of_work",
        _fake,
    )


async def _make_manual(db: AsyncSession, org: Organization, user: User, title: str = "Guide"):
    manual = await welcome_manual_repo.create_manual(
        db, organization_id=org.id, user_id=user.id,
        property_id=None, title=title, intro_text=None,
    )
    await db.flush()
    return manual


class TestAddRoom:
    @pytest.mark.asyncio
    async def test_appends_in_order(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = await _make_manual(db, test_org, test_user)
        await db.commit()
        with _patch_uow(db):
            first = await welcome_manual_room_service.add_room(
                test_org.id, test_user.id, manual.id, name="Front bedroom",
            )
            second = await welcome_manual_room_service.add_room(
                test_org.id, test_user.id, manual.id, name="Back bedroom",
            )
        assert first.display_order == 0
        assert second.display_order == 1
        assert first.name == "Front bedroom"
        assert first.manual_id == manual.id

    @pytest.mark.asyncio
    async def test_manual_not_found(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        with _patch_uow(db), pytest.raises(welcome_manual_room_service.ManualNotFoundError):
            await welcome_manual_room_service.add_room(
                test_org.id, test_user.id, uuid.uuid4(), name="Nowhere",
            )

    @pytest.mark.asyncio
    async def test_other_org_cannot_add_a_room(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = await _make_manual(db, test_org, test_user)
        await db.commit()
        with _patch_uow(db), pytest.raises(welcome_manual_room_service.ManualNotFoundError):
            await welcome_manual_room_service.add_room(
                uuid.uuid4(), test_user.id, manual.id, name="Intruder",
            )

    @pytest.mark.asyncio
    async def test_enforces_the_cap(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = await _make_manual(db, test_org, test_user)
        for index in range(WELCOME_MANUAL_MAX_ROOMS):
            await welcome_manual_room_repo.create(
                db, manual_id=manual.id, name=f"R{index}", display_order=index,
            )
        await db.commit()
        with _patch_uow(db), pytest.raises(welcome_manual_room_service.TooManyRoomsError):
            await welcome_manual_room_service.add_room(
                test_org.id, test_user.id, manual.id, name="One too many",
            )


class TestUpdateRoom:
    @pytest.mark.asyncio
    async def test_renames(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = await _make_manual(db, test_org, test_user)
        room = await welcome_manual_room_repo.create(
            db, manual_id=manual.id, name="New room", display_order=0,
        )
        await db.commit()
        with _patch_uow(db):
            updated = await welcome_manual_room_service.update_room(
                test_org.id, test_user.id, manual.id, room.id, {"name": "Room 2"},
            )
        assert updated.name == "Room 2"

    @pytest.mark.asyncio
    async def test_room_not_found(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = await _make_manual(db, test_org, test_user)
        await db.commit()
        with _patch_uow(db), pytest.raises(welcome_manual_room_service.RoomNotFoundError):
            await welcome_manual_room_service.update_room(
                test_org.id, test_user.id, manual.id, uuid.uuid4(), {"name": "X"},
            )


class TestDeleteRoom:
    @pytest.mark.asyncio
    async def test_removes_the_room(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = await _make_manual(db, test_org, test_user)
        room = await welcome_manual_room_repo.create(
            db, manual_id=manual.id, name="A", display_order=0,
        )
        await db.commit()
        with _patch_uow(db):
            await welcome_manual_room_service.delete_room(
                test_org.id, test_user.id, manual.id, room.id,
            )
        assert await welcome_manual_room_repo.list_by_manual(db, manual.id) == []

    @pytest.mark.asyncio
    async def test_room_not_found(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = await _make_manual(db, test_org, test_user)
        await db.commit()
        with _patch_uow(db), pytest.raises(welcome_manual_room_service.RoomNotFoundError):
            await welcome_manual_room_service.delete_room(
                test_org.id, test_user.id, manual.id, uuid.uuid4(),
            )


class TestReorderRooms:
    @pytest.mark.asyncio
    async def test_reassigns_display_order(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = await _make_manual(db, test_org, test_user)
        a = await welcome_manual_room_repo.create(
            db, manual_id=manual.id, name="A", display_order=0,
        )
        b = await welcome_manual_room_repo.create(
            db, manual_id=manual.id, name="B", display_order=1,
        )
        c = await welcome_manual_room_repo.create(
            db, manual_id=manual.id, name="C", display_order=2,
        )
        await db.commit()
        with _patch_uow(db):
            ordered = await welcome_manual_room_service.reorder_rooms(
                test_org.id, test_user.id, manual.id, [c.id, a.id, b.id],
            )
        assert [r.name for r in ordered] == ["C", "A", "B"]
        assert [r.display_order for r in ordered] == [0, 1, 2]
        persisted = await welcome_manual_room_repo.list_by_manual(db, manual.id)
        assert [r.name for r in persisted] == ["C", "A", "B"]

    @pytest.mark.asyncio
    async def test_rejects_a_partial_permutation(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = await _make_manual(db, test_org, test_user)
        a = await welcome_manual_room_repo.create(
            db, manual_id=manual.id, name="A", display_order=0,
        )
        await welcome_manual_room_repo.create(
            db, manual_id=manual.id, name="B", display_order=1,
        )
        await db.commit()
        with _patch_uow(db), pytest.raises(welcome_manual_room_service.InvalidRoomReorderError):
            await welcome_manual_room_service.reorder_rooms(
                test_org.id, test_user.id, manual.id, [a.id],
            )

    @pytest.mark.asyncio
    async def test_rejects_an_unknown_id(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = await _make_manual(db, test_org, test_user)
        a = await welcome_manual_room_repo.create(
            db, manual_id=manual.id, name="A", display_order=0,
        )
        await db.commit()
        with _patch_uow(db), pytest.raises(welcome_manual_room_service.InvalidRoomReorderError):
            await welcome_manual_room_service.reorder_rooms(
                test_org.id, test_user.id, manual.id, [a.id, uuid.uuid4()],
            )


class TestListRooms:
    @pytest.mark.asyncio
    async def test_lists_in_display_order(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = await _make_manual(db, test_org, test_user)
        await welcome_manual_room_repo.create(
            db, manual_id=manual.id, name="Second", display_order=1,
        )
        await welcome_manual_room_repo.create(
            db, manual_id=manual.id, name="First", display_order=0,
        )
        await db.commit()
        with _patch_uow(db):
            rooms = await welcome_manual_room_service.list_rooms(
                test_org.id, test_user.id, manual.id,
            )
        assert [r.name for r in rooms] == ["First", "Second"]

    @pytest.mark.asyncio
    async def test_other_org_cannot_list(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = await _make_manual(db, test_org, test_user)
        await db.commit()
        with _patch_uow(db), pytest.raises(welcome_manual_room_service.ManualNotFoundError):
            await welcome_manual_room_service.list_rooms(
                uuid.uuid4(), test_user.id, manual.id,
            )
