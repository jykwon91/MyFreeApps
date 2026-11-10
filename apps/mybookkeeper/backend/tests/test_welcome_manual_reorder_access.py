"""Who may reorder, and what a reorder does to a manual that is gone.

The route is exercised for real (permission dependency, service, repository)
against the in-memory database; only the organization membership is faked.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.main import app
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole
from app.models.user.user import User
from app.repositories.welcome_manuals import (
    welcome_manual_repo,
    welcome_manual_section_repo,
)

SERVICES = (
    "welcome_manual_section_service",
    "welcome_manual_section_field_service",
    "welcome_manual_section_image_service",
)


def _use_session(db: AsyncSession):
    @asynccontextmanager
    async def _fake():
        yield db

    return [patch(f"app.services.welcome_manuals.{name}.unit_of_work", _fake) for name in SERVICES]


async def _client(db: AsyncSession, org: Organization, user: User, role: OrgRole) -> AsyncGenerator[AsyncClient, None]:
    ctx = RequestContext(organization_id=org.id, user_id=user.id, org_role=role)
    app.dependency_overrides[current_org_member] = lambda: ctx
    patches = _use_session(db)
    for each in patches:
        each.start()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            yield client
    finally:
        for each in patches:
            each.stop()
        app.dependency_overrides.clear()


@pytest_asyncio.fixture()
async def viewer(db: AsyncSession, test_user: User, test_org: Organization) -> AsyncGenerator[AsyncClient, None]:
    async for client in _client(db, test_org, test_user, OrgRole.VIEWER):
        yield client


@pytest_asyncio.fixture()
async def owner(db: AsyncSession, test_user: User, test_org: Organization) -> AsyncGenerator[AsyncClient, None]:
    async for client in _client(db, test_org, test_user, OrgRole.OWNER):
        yield client


def _reorder_requests(manual_id: uuid.UUID, section_id: uuid.UUID) -> list[tuple[str, dict[str, list[str]]]]:
    some = [str(uuid.uuid4())]
    return [
        (f"/welcome-manuals/{manual_id}/sections/order", {"section_ids": some}),
        (f"/welcome-manuals/{manual_id}/sections/{section_id}/fields/order", {"field_ids": some}),
        (f"/welcome-manuals/{manual_id}/sections/{section_id}/images/order", {"image_ids": some}),
    ]


class TestViewerCannotReorder:
    @pytest.mark.asyncio
    async def test_all_three_reorders_are_403_and_change_nothing(
        self, viewer: AsyncClient, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = await welcome_manual_repo.create_manual(
            db, organization_id=test_org.id, user_id=test_user.id, property_id=None, title="G", intro_text=None,
        )
        a = await welcome_manual_section_repo.create(db, manual_id=manual.id, title="A", body=None, display_order=0)
        b = await welcome_manual_section_repo.create(db, manual_id=manual.id, title="B", body=None, display_order=1)
        await db.commit()
        for url, body in _reorder_requests(manual.id, a.id):
            response = await viewer.put(url, json=body)
            assert response.status_code == 403, url
        swapped = await viewer.put(f"/welcome-manuals/{manual.id}/sections/order", json={"section_ids": [str(b.id), str(a.id)]})
        assert swapped.status_code == 403
        assert [s.id for s in await welcome_manual_section_repo.list_by_manual(db, manual.id)] == [a.id, b.id]


class TestGoneManual:
    @pytest.mark.asyncio
    async def test_all_three_reorders_of_a_soft_deleted_manual_are_404(
        self, owner: AsyncClient, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        manual = await welcome_manual_repo.create_manual(
            db, organization_id=test_org.id, user_id=test_user.id, property_id=None, title="G", intro_text=None,
        )
        section = await welcome_manual_section_repo.create(db, manual_id=manual.id, title="A", body=None, display_order=0)
        await db.commit()
        await welcome_manual_repo.soft_delete_by_id(db, manual.id, test_org.id)
        await db.commit()
        for url, body in _reorder_requests(manual.id, section.id):
            response = await owner.put(url, json=body)
            assert response.status_code == 404, url
