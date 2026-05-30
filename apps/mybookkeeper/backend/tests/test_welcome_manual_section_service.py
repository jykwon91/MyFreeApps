"""Service-layer tests for welcome_manual_section_service.

Patches ``unit_of_work`` on the section-service module to point at the
in-memory SQLite session.
"""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.welcome_manual_constants import WELCOME_MANUAL_MAX_SECTIONS
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories.welcome_manuals import welcome_manual_repo, welcome_manual_section_repo
from app.services.welcome_manuals import welcome_manual_section_service


def _patch_uow(db: AsyncSession):
    @asynccontextmanager
    async def _fake():
        yield db

    return patch(
        "app.services.welcome_manuals.welcome_manual_section_service.unit_of_work",
        _fake,
    )


async def _make_manual(db: AsyncSession, org: Organization, user: User):
    manual = await welcome_manual_repo.create_manual(
        db, organization_id=org.id, user_id=user.id,
        property_id=None, title="Guide", intro_text=None,
    )
    await db.flush()
    return manual


class TestAddSection:
    @pytest.mark.asyncio
    async def test_appends_in_order(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual = await _make_manual(db, test_org, test_user)
        await db.commit()
        with _patch_uow(db):
            s1 = await welcome_manual_section_service.add_section(
                test_org.id, test_user.id, manual.id, title="Wi-Fi", body="net/pass",
            )
            s2 = await welcome_manual_section_service.add_section(
                test_org.id, test_user.id, manual.id, title="Trash", body=None,
            )
        assert s1.display_order == 0
        assert s2.display_order == 1
        assert s1.title == "Wi-Fi"
        assert s1.body == "net/pass"

    @pytest.mark.asyncio
    async def test_manual_not_found(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        with _patch_uow(db):
            with pytest.raises(welcome_manual_section_service.ManualNotFoundError):
                await welcome_manual_section_service.add_section(
                    test_org.id, test_user.id, uuid.uuid4(), title="x", body=None,
                )

    @pytest.mark.asyncio
    async def test_cross_org_manual_not_found(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual = await _make_manual(db, test_org, test_user)
        await db.commit()
        with _patch_uow(db):
            with pytest.raises(welcome_manual_section_service.ManualNotFoundError):
                await welcome_manual_section_service.add_section(
                    uuid.uuid4(), test_user.id, manual.id, title="x", body=None,
                )

    @pytest.mark.asyncio
    async def test_too_many_sections(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual = await _make_manual(db, test_org, test_user)
        for i in range(WELCOME_MANUAL_MAX_SECTIONS):
            await welcome_manual_section_repo.create(
                db, manual_id=manual.id, title=f"s{i}", body=None, display_order=i,
            )
        await db.commit()
        with _patch_uow(db):
            with pytest.raises(welcome_manual_section_service.TooManySectionsError):
                await welcome_manual_section_service.add_section(
                    test_org.id, test_user.id, manual.id, title="overflow", body=None,
                )


class TestUpdateDeleteSection:
    @pytest.mark.asyncio
    async def test_update_section(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual = await _make_manual(db, test_org, test_user)
        section = await welcome_manual_section_repo.create(
            db, manual_id=manual.id, title="Old", body=None, display_order=0,
        )
        await db.commit()
        with _patch_uow(db):
            updated = await welcome_manual_section_service.update_section(
                test_org.id, test_user.id, manual.id, section.id, {"title": "New", "body": "txt"},
            )
        assert updated.title == "New"
        assert updated.body == "txt"

    @pytest.mark.asyncio
    async def test_update_section_not_found(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual = await _make_manual(db, test_org, test_user)
        await db.commit()
        with _patch_uow(db):
            with pytest.raises(welcome_manual_section_service.SectionNotFoundError):
                await welcome_manual_section_service.update_section(
                    test_org.id, test_user.id, manual.id, uuid.uuid4(), {"title": "x"},
                )

    @pytest.mark.asyncio
    async def test_delete_section(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual = await _make_manual(db, test_org, test_user)
        section = await welcome_manual_section_repo.create(
            db, manual_id=manual.id, title="x", body=None, display_order=0,
        )
        await db.commit()
        with _patch_uow(db):
            await welcome_manual_section_service.delete_section(
                test_org.id, test_user.id, manual.id, section.id,
            )
            with pytest.raises(welcome_manual_section_service.SectionNotFoundError):
                await welcome_manual_section_service.delete_section(
                    test_org.id, test_user.id, manual.id, section.id,
                )


class TestReorder:
    @pytest.mark.asyncio
    async def test_reorders_sections(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual = await _make_manual(db, test_org, test_user)
        a = await welcome_manual_section_repo.create(db, manual_id=manual.id, title="A", body=None, display_order=0)
        b = await welcome_manual_section_repo.create(db, manual_id=manual.id, title="B", body=None, display_order=1)
        c = await welcome_manual_section_repo.create(db, manual_id=manual.id, title="C", body=None, display_order=2)
        await db.commit()
        with _patch_uow(db):
            result = await welcome_manual_section_service.reorder_sections(
                test_org.id, test_user.id, manual.id, [c.id, a.id, b.id],
            )
        assert [s.title for s in result] == ["C", "A", "B"]
        assert [s.display_order for s in result] == [0, 1, 2]

    @pytest.mark.asyncio
    async def test_reorder_rejects_partial_set(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual = await _make_manual(db, test_org, test_user)
        a = await welcome_manual_section_repo.create(db, manual_id=manual.id, title="A", body=None, display_order=0)
        await welcome_manual_section_repo.create(db, manual_id=manual.id, title="B", body=None, display_order=1)
        await db.commit()
        with _patch_uow(db):
            with pytest.raises(welcome_manual_section_service.InvalidReorderError):
                await welcome_manual_section_service.reorder_sections(
                    test_org.id, test_user.id, manual.id, [a.id],  # missing B
                )

    @pytest.mark.asyncio
    async def test_reorder_rejects_unknown_id(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        manual = await _make_manual(db, test_org, test_user)
        a = await welcome_manual_section_repo.create(db, manual_id=manual.id, title="A", body=None, display_order=0)
        await db.commit()
        with _patch_uow(db):
            with pytest.raises(welcome_manual_section_service.InvalidReorderError):
                await welcome_manual_section_service.reorder_sections(
                    test_org.id, test_user.id, manual.id, [uuid.uuid4()],
                )

    @pytest.mark.asyncio
    async def test_reorder_manual_not_found(self, db: AsyncSession, test_user: User, test_org: Organization) -> None:
        with _patch_uow(db):
            with pytest.raises(welcome_manual_section_service.ManualNotFoundError):
                await welcome_manual_section_service.reorder_sections(
                    test_org.id, test_user.id, uuid.uuid4(), [uuid.uuid4()],
                )
