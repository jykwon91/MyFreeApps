"""Repository tests for welcome_manual_places."""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories.welcome_manuals import welcome_manual_place_repo, welcome_manual_repo


async def _make_manual(db: AsyncSession, org: Organization, user: User):
    manual = await welcome_manual_repo.create_manual(
        db, organization_id=org.id, user_id=user.id,
        property_id=None, title="G", intro_text=None,
    )
    await db.flush()
    return manual


class TestOrderingAndCreate:
    @pytest.mark.asyncio
    async def test_create_and_list_in_order(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual = await _make_manual(db, test_org, test_user)
        await welcome_manual_place_repo.create(
            db, manual_id=manual.id, name="B", cuisine="Italian",
            price_tier=None, note=None, map_url=None, display_order=1,
        )
        await welcome_manual_place_repo.create(
            db, manual_id=manual.id, name="A", cuisine="Mexican",
            price_tier="$$", note="Great tacos", map_url="https://maps.example.com/a", display_order=0,
        )
        await db.commit()
        places = await welcome_manual_place_repo.list_by_manual(db, manual.id)
        assert [p.name for p in places] == ["A", "B"]
        assert places[0].cuisine == "Mexican"
        assert places[0].price_tier == "$$"

    @pytest.mark.asyncio
    async def test_next_display_order(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual = await _make_manual(db, test_org, test_user)
        assert await welcome_manual_place_repo.next_display_order(db, manual.id) == 0
        await welcome_manual_place_repo.create(
            db, manual_id=manual.id, name="A", cuisine="Japanese & Sushi",
            price_tier=None, note=None, map_url=None, display_order=0,
        )
        await db.flush()
        assert await welcome_manual_place_repo.next_display_order(db, manual.id) == 1


class TestUpdateDelete:
    @pytest.mark.asyncio
    async def test_update_allowlist(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual = await _make_manual(db, test_org, test_user)
        place = await welcome_manual_place_repo.create(
            db, manual_id=manual.id, name="Taco Spot", cuisine="Mexican",
            price_tier="$", note=None, map_url=None, display_order=0,
        )
        await db.commit()
        updated = await welcome_manual_place_repo.update(
            db, place.id, manual.id,
            {
                "name": "Taco Spot 2",
                "cuisine": "Tex-Mex",
                "price_tier": "$$",
                "note": "Ask for the salsa verde",
                "map_url": "https://maps.example.com/taco",
                "display_order": 3,
                "manual_id": uuid.uuid4(),
            },
        )
        assert updated is not None
        assert updated.name == "Taco Spot 2"
        assert updated.cuisine == "Tex-Mex"
        assert updated.price_tier == "$$"
        assert updated.note == "Ask for the salsa verde"
        assert updated.map_url == "https://maps.example.com/taco"
        assert updated.display_order == 3
        assert updated.manual_id == manual.id  # immutable

    @pytest.mark.asyncio
    async def test_update_nullable_fields_to_null(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual = await _make_manual(db, test_org, test_user)
        place = await welcome_manual_place_repo.create(
            db, manual_id=manual.id, name="Ramen House", cuisine="Japanese",
            price_tier="$$", note="Cash only", map_url="https://maps.example.com/r", display_order=0,
        )
        await db.commit()
        updated = await welcome_manual_place_repo.update(
            db, place.id, manual.id, {"price_tier": None, "note": None, "map_url": None},
        )
        assert updated is not None
        assert updated.price_tier is None
        assert updated.note is None
        assert updated.map_url is None

    @pytest.mark.asyncio
    async def test_get_wrong_manual_returns_none(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual = await _make_manual(db, test_org, test_user)
        place = await welcome_manual_place_repo.create(
            db, manual_id=manual.id, name="A", cuisine="Thai",
            price_tier=None, note=None, map_url=None, display_order=0,
        )
        await db.commit()
        assert await welcome_manual_place_repo.get_by_id(db, place.id, uuid.uuid4()) is None

    @pytest.mark.asyncio
    async def test_delete_returns_row_then_none(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual = await _make_manual(db, test_org, test_user)
        place = await welcome_manual_place_repo.create(
            db, manual_id=manual.id, name="A", cuisine="Thai",
            price_tier=None, note=None, map_url=None, display_order=0,
        )
        await db.commit()
        deleted = await welcome_manual_place_repo.delete_by_id(db, place.id, manual.id)
        assert deleted is not None and deleted.name == "A"
        assert await welcome_manual_place_repo.delete_by_id(db, place.id, manual.id) is None
