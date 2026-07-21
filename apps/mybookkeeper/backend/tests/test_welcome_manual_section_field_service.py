"""Service-layer tests for welcome_manual_section_field_service.

Patches ``unit_of_work`` on the service module to point at the in-memory SQLite
session (same pattern as test_welcome_manual_section_image_service).
"""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.welcome_manual_constants import WELCOME_MANUAL_MAX_FIELDS
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories.welcome_manuals import (
    welcome_manual_repo,
    welcome_manual_section_field_repo,
    welcome_manual_section_repo,
)
from app.services.welcome_manuals import welcome_manual_section_field_service


def _patch_uow(db: AsyncSession):
    @asynccontextmanager
    async def _fake():
        yield db

    return patch(
        "app.services.welcome_manuals.welcome_manual_section_field_service.unit_of_work",
        _fake,
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
    return manual, section


class TestAdd:
    @pytest.mark.asyncio
    async def test_appends_field(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual, section = await _make_section(db, test_org, test_user)
        await db.commit()
        with _patch_uow(db):
            first = await welcome_manual_section_field_service.add_field(
                test_org.id, test_user.id, manual.id, section.id, "Network name", None,
            )
            second = await welcome_manual_section_field_service.add_field(
                test_org.id, test_user.id, manual.id, section.id, "Password", "hunter2",
            )
        assert first.display_order == 0
        assert second.display_order == 1
        assert second.value == "hunter2"

    @pytest.mark.asyncio
    async def test_manual_not_found(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        with _patch_uow(db):
            with pytest.raises(welcome_manual_section_field_service.ManualNotFoundError):
                await welcome_manual_section_field_service.add_field(
                    test_org.id, test_user.id, uuid.uuid4(), uuid.uuid4(), "L", None,
                )

    @pytest.mark.asyncio
    async def test_section_not_found(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual, _section = await _make_section(db, test_org, test_user)
        await db.commit()
        with _patch_uow(db):
            with pytest.raises(welcome_manual_section_field_service.SectionNotFoundError):
                await welcome_manual_section_field_service.add_field(
                    test_org.id, test_user.id, manual.id, uuid.uuid4(), "L", None,
                )

    @pytest.mark.asyncio
    async def test_cross_org_manual_not_found(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual, section = await _make_section(db, test_org, test_user)
        await db.commit()
        with _patch_uow(db):
            with pytest.raises(welcome_manual_section_field_service.ManualNotFoundError):
                await welcome_manual_section_field_service.add_field(
                    uuid.uuid4(), test_user.id, manual.id, section.id, "L", None,
                )

    @pytest.mark.asyncio
    async def test_too_many_fields(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual, section = await _make_section(db, test_org, test_user)
        for i in range(WELCOME_MANUAL_MAX_FIELDS):
            await welcome_manual_section_field_repo.create(
                db, section_id=section.id, label=f"f{i}", value=None, display_order=i,
            )
        await db.commit()
        with _patch_uow(db):
            with pytest.raises(welcome_manual_section_field_service.TooManyFieldsError):
                await welcome_manual_section_field_service.add_field(
                    test_org.id, test_user.id, manual.id, section.id, "one too many", None,
                )


class TestUpdateDelete:
    @pytest.mark.asyncio
    async def test_update_field(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual, section = await _make_section(db, test_org, test_user)
        field = await welcome_manual_section_field_repo.create(
            db, section_id=section.id, label="Password", value=None, display_order=0,
        )
        await db.commit()
        with _patch_uow(db):
            updated = await welcome_manual_section_field_service.update_field(
                test_org.id, test_user.id, manual.id, section.id, field.id,
                {"value": "sunny123"},
            )
        assert updated.value == "sunny123"

    @pytest.mark.asyncio
    async def test_update_field_not_found(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual, section = await _make_section(db, test_org, test_user)
        await db.commit()
        with _patch_uow(db):
            with pytest.raises(welcome_manual_section_field_service.FieldNotFoundError):
                await welcome_manual_section_field_service.update_field(
                    test_org.id, test_user.id, manual.id, section.id, uuid.uuid4(),
                    {"value": "x"},
                )

    @pytest.mark.asyncio
    async def test_delete_field(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual, section = await _make_section(db, test_org, test_user)
        field = await welcome_manual_section_field_repo.create(
            db, section_id=section.id, label="A", value=None, display_order=0,
        )
        await db.commit()
        with _patch_uow(db):
            await welcome_manual_section_field_service.delete_field(
                test_org.id, test_user.id, manual.id, section.id, field.id,
            )
            with pytest.raises(welcome_manual_section_field_service.FieldNotFoundError):
                await welcome_manual_section_field_service.delete_field(
                    test_org.id, test_user.id, manual.id, section.id, field.id,
                )
