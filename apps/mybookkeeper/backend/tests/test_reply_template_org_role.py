"""A reply template is only editable under the org it was created in.

The role check runs against the org in ``X-Organization-Id``. A user who is a
viewer in Org A but a writer in Org B must not change their Org A template by
sending the Org B header.
"""
from __future__ import annotations

import contextlib
import uuid
from contextlib import asynccontextmanager
from typing import AsyncIterator
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.main import app
from app.models.organization.organization import Organization
from app.models.user.user import User
from app.repositories import organization_repo
from app.repositories.inquiries import reply_template_repo

_ORG_HEADER = "X-Organization-Id"


@pytest_asyncio.fixture()
async def user(db: AsyncSession) -> User:
    row = User(
        id=uuid.uuid4(),
        email=f"tpl-role-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(row)
    await db.commit()
    return row


async def _org_with_member(db: AsyncSession, user: User, role: str) -> Organization:
    org = await organization_repo.create(db, f"Org {uuid.uuid4().hex[:6]}", user.id)
    await db.commit()
    member = await organization_repo.get_member(db, org.id, user.id)
    assert member is not None
    member.org_role = role
    await db.commit()
    return org


@pytest_asyncio.fixture()
async def org_a_viewer(db: AsyncSession, user: User) -> Organization:
    return await _org_with_member(db, user, "viewer")


@pytest_asyncio.fixture()
async def org_b_writer(db: AsyncSession, user: User) -> Organization:
    return await _org_with_member(db, user, "owner")


@pytest_asyncio.fixture()
async def org_a_template_id(
    db: AsyncSession, user: User, org_a_viewer: Organization,
) -> uuid.UUID:
    template = await reply_template_repo.create(
        db,
        organization_id=org_a_viewer.id,
        user_id=user.id,
        name="Org A reply",
        subject_template="s",
        body_template="b",
    )
    await db.commit()
    return template.id


@pytest.fixture(autouse=True)
def _on_test_session(db: AsyncSession):
    @asynccontextmanager
    async def _session():
        yield db

    with (
        patch("app.core.permissions.AsyncSessionLocal", _session),
        patch("app.services.inquiries.reply_template_service.AsyncSessionLocal", _session),
        patch("app.services.inquiries.reply_template_service.unit_of_work", _session),
    ):
        yield


@contextlib.asynccontextmanager
async def _client_as(user: User) -> AsyncIterator[AsyncClient]:
    app.dependency_overrides[current_active_user] = lambda: user
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test",
        ) as client:
            yield client
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_viewer_in_org_a_cannot_edit_org_a_template_via_org_b_header(
    db: AsyncSession, user: User, org_a_viewer: Organization,
    org_b_writer: Organization, org_a_template_id: uuid.UUID,
) -> None:
    async with _client_as(user) as client:
        response = await client.patch(
            f"/reply-templates/{org_a_template_id}",
            json={"name": "hijacked"},
            headers={_ORG_HEADER: str(org_b_writer.id)},
        )

    assert response.status_code == 404
    template = await reply_template_repo.get_by_id_in_org_for_user(
        db, org_a_template_id, org_a_viewer.id, user.id,
    )
    assert template is not None
    assert template.name == "Org A reply"


@pytest.mark.asyncio
async def test_viewer_in_org_a_cannot_archive_org_a_template_via_org_b_header(
    db: AsyncSession, user: User, org_a_viewer: Organization,
    org_b_writer: Organization, org_a_template_id: uuid.UUID,
) -> None:
    async with _client_as(user) as client:
        response = await client.delete(
            f"/reply-templates/{org_a_template_id}",
            headers={_ORG_HEADER: str(org_b_writer.id)},
        )

    assert response.status_code == 404
    template = await reply_template_repo.get_by_id_in_org_for_user(
        db, org_a_template_id, org_a_viewer.id, user.id,
    )
    assert template is not None
    assert template.is_archived is False


@pytest.mark.asyncio
async def test_viewer_is_refused_in_their_own_org(
    user: User, org_a_viewer: Organization, org_a_template_id: uuid.UUID,
) -> None:
    async with _client_as(user) as client:
        edit = await client.patch(
            f"/reply-templates/{org_a_template_id}",
            json={"name": "nope"},
            headers={_ORG_HEADER: str(org_a_viewer.id)},
        )
        archive = await client.delete(
            f"/reply-templates/{org_a_template_id}",
            headers={_ORG_HEADER: str(org_a_viewer.id)},
        )

    assert edit.status_code == 403
    assert archive.status_code == 403


@pytest.mark.asyncio
async def test_writer_can_still_edit_and_archive_in_the_templates_own_org(
    db: AsyncSession, user: User, org_b_writer: Organization,
) -> None:
    template = await reply_template_repo.create(
        db,
        organization_id=org_b_writer.id,
        user_id=user.id,
        name="Org B reply",
        subject_template="s",
        body_template="b",
    )
    await db.commit()
    headers = {_ORG_HEADER: str(org_b_writer.id)}

    async with _client_as(user) as client:
        edit = await client.patch(
            f"/reply-templates/{template.id}", json={"name": "renamed"}, headers=headers,
        )
        archive = await client.delete(f"/reply-templates/{template.id}", headers=headers)

    assert edit.status_code == 200
    assert edit.json()["name"] == "renamed"
    assert archive.status_code == 204
