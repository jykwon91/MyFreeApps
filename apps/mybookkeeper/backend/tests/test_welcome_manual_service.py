"""Service-layer tests for welcome_manual_service.

Patches ``AsyncSessionLocal`` + ``unit_of_work`` on the service module to point
at the in-memory SQLite session (same pattern as test_applicant_contract_service).
"""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.welcome_manual_constants import DEFAULT_WELCOME_MANUAL_SECTIONS
from app.models.organization.organization import Organization
from app.models.properties.property import Property
from app.models.user.user import User
from app.schemas.welcome_manuals.welcome_manual_create_request import (
    WelcomeManualCreateRequest,
)
from app.schemas.welcome_manuals.welcome_manual_update_request import (
    WelcomeManualUpdateRequest,
)
from app.services.welcome_manuals import welcome_manual_service


def _patch(db: AsyncSession):
    @asynccontextmanager
    async def _fake():
        yield db

    return patch.multiple(
        "app.services.welcome_manuals.welcome_manual_service",
        AsyncSessionLocal=_fake,
        unit_of_work=_fake,
    )


async def _seed_property(db: AsyncSession, org: Organization, user: User) -> Property:
    prop = Property(
        organization_id=org.id, user_id=user.id,
        name="Guest House", address="1 Beach Rd",
    )
    db.add(prop)
    await db.flush()
    return prop


class TestCreate:
    @pytest.mark.asyncio
    async def test_seeds_default_sections(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        with _patch(db):
            resp = await welcome_manual_service.create_manual(
                test_org.id, test_user.id, WelcomeManualCreateRequest(title="Guide"),
            )
        assert resp.title == "Guide"
        assert [s.title for s in resp.sections] == list(DEFAULT_WELCOME_MANUAL_SECTIONS)
        assert [s.display_order for s in resp.sections] == list(range(len(DEFAULT_WELCOME_MANUAL_SECTIONS)))

    @pytest.mark.asyncio
    async def test_no_seed_when_disabled(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        with _patch(db):
            resp = await welcome_manual_service.create_manual(
                test_org.id, test_user.id,
                WelcomeManualCreateRequest(title="Guide", seed_default_sections=False),
            )
        assert resp.sections == []

    @pytest.mark.asyncio
    async def test_with_valid_property(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        prop = await _seed_property(db, test_org, test_user)
        await db.commit()
        with _patch(db):
            resp = await welcome_manual_service.create_manual(
                test_org.id, test_user.id,
                WelcomeManualCreateRequest(title="Guide", property_id=prop.id, seed_default_sections=False),
            )
        assert resp.property_id == prop.id

    @pytest.mark.asyncio
    async def test_invalid_property_raises(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        with _patch(db):
            with pytest.raises(LookupError):
                await welcome_manual_service.create_manual(
                    test_org.id, test_user.id,
                    WelcomeManualCreateRequest(title="Guide", property_id=uuid.uuid4()),
                )


class TestGetListUpdateDelete:
    @pytest.mark.asyncio
    async def test_get_returns_sections(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        with _patch(db):
            created = await welcome_manual_service.create_manual(
                test_org.id, test_user.id, WelcomeManualCreateRequest(title="G"),
            )
            await db.commit()
            fetched = await welcome_manual_service.get_manual(test_org.id, test_user.id, created.id)
        assert fetched.id == created.id
        assert len(fetched.sections) == len(DEFAULT_WELCOME_MANUAL_SECTIONS)

    @pytest.mark.asyncio
    async def test_get_cross_org_raises(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        with _patch(db):
            created = await welcome_manual_service.create_manual(
                test_org.id, test_user.id,
                WelcomeManualCreateRequest(title="G", seed_default_sections=False),
            )
            await db.commit()
            with pytest.raises(LookupError):
                await welcome_manual_service.get_manual(uuid.uuid4(), test_user.id, created.id)

    @pytest.mark.asyncio
    async def test_list_includes_section_count(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        with _patch(db):
            await welcome_manual_service.create_manual(
                test_org.id, test_user.id, WelcomeManualCreateRequest(title="A"),
            )
            await welcome_manual_service.create_manual(
                test_org.id, test_user.id,
                WelcomeManualCreateRequest(title="B", seed_default_sections=False),
            )
            await db.commit()
            page = await welcome_manual_service.list_manuals(test_org.id, test_user.id, limit=50, offset=0)
        assert page.total == 2
        by_title = {i.title: i for i in page.items}
        assert by_title["A"].section_count == len(DEFAULT_WELCOME_MANUAL_SECTIONS)
        assert by_title["B"].section_count == 0

    @pytest.mark.asyncio
    async def test_update_title_and_intro(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        with _patch(db):
            created = await welcome_manual_service.create_manual(
                test_org.id, test_user.id,
                WelcomeManualCreateRequest(title="Old", seed_default_sections=False),
            )
            await db.commit()
            updated = await welcome_manual_service.update_manual(
                test_org.id, test_user.id, created.id,
                WelcomeManualUpdateRequest(title="New", intro_text="Hi"),
            )
        assert updated.title == "New"
        assert updated.intro_text == "Hi"

    @pytest.mark.asyncio
    async def test_update_invalid_property_raises(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        with _patch(db):
            created = await welcome_manual_service.create_manual(
                test_org.id, test_user.id,
                WelcomeManualCreateRequest(title="X", seed_default_sections=False),
            )
            await db.commit()
            with pytest.raises(LookupError):
                await welcome_manual_service.update_manual(
                    test_org.id, test_user.id, created.id,
                    WelcomeManualUpdateRequest(property_id=uuid.uuid4()),
                )

    @pytest.mark.asyncio
    async def test_update_missing_raises(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        with _patch(db):
            with pytest.raises(LookupError):
                await welcome_manual_service.update_manual(
                    test_org.id, test_user.id, uuid.uuid4(),
                    WelcomeManualUpdateRequest(title="x"),
                )

    @pytest.mark.asyncio
    async def test_soft_delete_then_get_raises(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        with _patch(db):
            created = await welcome_manual_service.create_manual(
                test_org.id, test_user.id,
                WelcomeManualCreateRequest(title="D", seed_default_sections=False),
            )
            await db.commit()
            await welcome_manual_service.soft_delete_manual(test_org.id, test_user.id, created.id)
            await db.commit()
            with pytest.raises(LookupError):
                await welcome_manual_service.get_manual(test_org.id, test_user.id, created.id)

    @pytest.mark.asyncio
    async def test_soft_delete_missing_raises(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        with _patch(db):
            with pytest.raises(LookupError):
                await welcome_manual_service.soft_delete_manual(test_org.id, test_user.id, uuid.uuid4())
