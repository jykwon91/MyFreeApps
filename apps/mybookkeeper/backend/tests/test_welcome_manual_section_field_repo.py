"""Repository tests for welcome_manual_section_fields."""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories.welcome_manuals import (
    welcome_manual_repo,
    welcome_manual_section_field_repo,
    welcome_manual_section_repo,
)


async def _make_section(db: AsyncSession, org: Organization, user: User):
    manual = await welcome_manual_repo.create_manual(
        db, organization_id=org.id, user_id=user.id,
        property_id=None, title="G", intro_text=None,
    )
    await db.flush()
    section = await welcome_manual_section_repo.create(
        db, manual_id=manual.id, title="Wi-Fi", body=None, display_order=0,
    )
    await db.flush()
    return section


class TestOrderingAndCreate:
    @pytest.mark.asyncio
    async def test_create_and_list_in_order(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        section = await _make_section(db, test_org, test_user)
        await welcome_manual_section_field_repo.create(db, section_id=section.id, label="B", value=None, display_order=1)
        await welcome_manual_section_field_repo.create(db, section_id=section.id, label="A", value="v", display_order=0)
        await db.commit()
        fields = await welcome_manual_section_field_repo.list_by_section(db, section.id)
        assert [f.label for f in fields] == ["A", "B"]
        assert fields[0].value == "v"

    @pytest.mark.asyncio
    async def test_next_display_order(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        section = await _make_section(db, test_org, test_user)
        assert await welcome_manual_section_field_repo.next_display_order(db, section.id) == 0
        await welcome_manual_section_field_repo.create(db, section_id=section.id, label="A", value=None, display_order=0)
        await db.flush()
        assert await welcome_manual_section_field_repo.next_display_order(db, section.id) == 1


class TestListBySectionIds:
    @pytest.mark.asyncio
    async def test_groups_across_sections(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        s1 = await _make_section(db, test_org, test_user)
        s2 = await _make_section(db, test_org, test_user)
        await welcome_manual_section_field_repo.create(db, section_id=s1.id, label="a", value=None, display_order=0)
        await welcome_manual_section_field_repo.create(db, section_id=s1.id, label="b", value=None, display_order=1)
        await welcome_manual_section_field_repo.create(db, section_id=s2.id, label="c", value=None, display_order=0)
        await db.commit()
        fields = await welcome_manual_section_field_repo.list_by_section_ids(db, [s1.id, s2.id])
        by_section: dict = {}
        for f in fields:
            by_section.setdefault(f.section_id, []).append(f)
        assert len(by_section[s1.id]) == 2
        assert len(by_section[s2.id]) == 1

    @pytest.mark.asyncio
    async def test_empty_input(self, db: AsyncSession) -> None:
        assert await welcome_manual_section_field_repo.list_by_section_ids(db, []) == []


class TestUpdateDelete:
    @pytest.mark.asyncio
    async def test_update_allowlist(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        section = await _make_section(db, test_org, test_user)
        field = await welcome_manual_section_field_repo.create(
            db, section_id=section.id, label="Network name", value=None, display_order=0,
        )
        await db.commit()
        updated = await welcome_manual_section_field_repo.update(
            db, field.id, section.id,
            {"label": "SSID", "value": "GuestNet", "display_order": 3, "section_id": uuid.uuid4()},
        )
        assert updated is not None
        assert updated.label == "SSID"
        assert updated.value == "GuestNet"
        assert updated.display_order == 3
        assert updated.section_id == section.id  # immutable

    @pytest.mark.asyncio
    async def test_update_value_to_null(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        section = await _make_section(db, test_org, test_user)
        field = await welcome_manual_section_field_repo.create(
            db, section_id=section.id, label="Password", value="hunter2", display_order=0,
        )
        await db.commit()
        updated = await welcome_manual_section_field_repo.update(
            db, field.id, section.id, {"value": None},
        )
        assert updated is not None
        assert updated.value is None

    @pytest.mark.asyncio
    async def test_get_wrong_section_returns_none(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        section = await _make_section(db, test_org, test_user)
        field = await welcome_manual_section_field_repo.create(
            db, section_id=section.id, label="A", value=None, display_order=0,
        )
        await db.commit()
        assert await welcome_manual_section_field_repo.get_by_id(db, field.id, uuid.uuid4()) is None

    @pytest.mark.asyncio
    async def test_delete_returns_row_then_none(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        section = await _make_section(db, test_org, test_user)
        field = await welcome_manual_section_field_repo.create(
            db, section_id=section.id, label="A", value=None, display_order=0,
        )
        await db.commit()
        deleted = await welcome_manual_section_field_repo.delete_by_id(db, field.id, section.id)
        assert deleted is not None and deleted.label == "A"
        assert await welcome_manual_section_field_repo.delete_by_id(db, field.id, section.id) is None
