"""GET /documents/summary: the counts behind the phone's Home screen."""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.permissions import current_org_member
from app.main import app
from app.models.organization.organization_member import OrgRole
from app.repositories import document_repo
from tests.document_support import (
    make_document,
    mock_session_factory,
    setup_org_and_user,
)

QUERY_SERVICE = "app.services.documents.document_query_service"


@pytest_asyncio.fixture
async def world(db: AsyncSession) -> AsyncIterator[tuple[AsyncClient, uuid.UUID, uuid.UUID]]:
    user, org_id = await setup_org_and_user(db)
    ctx = RequestContext(organization_id=org_id, user_id=user.id, org_role=OrgRole.VIEWER)
    app.dependency_overrides[current_org_member] = lambda: ctx
    fake_session, _ = mock_session_factory(db)
    try:
        with patch(f"{QUERY_SERVICE}.AsyncSessionLocal", fake_session):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                yield client, org_id, user.id
    finally:
        app.dependency_overrides.clear()


async def _add(db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID, *statuses: str) -> None:
    db.add_all([make_document(org_id, user_id, status=status) for status in statuses])
    await db.commit()


@pytest.mark.asyncio
async def test_counts_documents_being_read_and_needing_a_look(db: AsyncSession, world) -> None:
    client, org_id, user_id = world
    await _add(db, org_id, user_id, "processing", "extracting", "failed", "duplicate", "duplicate", "completed")

    resp = await client.get("/documents/summary")

    assert resp.status_code == 200
    assert resp.json() == {"total": 6, "in_progress": 2, "needs_review": 3}


@pytest.mark.asyncio
async def test_an_empty_organization_has_nothing(world) -> None:
    client, _, _ = world

    resp = await client.get("/documents/summary")

    assert resp.json() == {"total": 0, "in_progress": 0, "needs_review": 0}


@pytest.mark.asyncio
async def test_another_organizations_documents_are_not_counted(db: AsyncSession, world) -> None:
    client, org_id, user_id = world
    other_user, other_org = await setup_org_and_user(db)
    await _add(db, other_org, other_user.id, "failed", "processing", "completed")
    await _add(db, org_id, user_id, "completed")

    resp = await client.get("/documents/summary")

    assert resp.json() == {"total": 1, "in_progress": 0, "needs_review": 0}


@pytest.mark.asyncio
async def test_deleted_documents_are_not_counted(db: AsyncSession, world) -> None:
    client, org_id, user_id = world
    gone = make_document(org_id, user_id, status="deleted")
    gone.deleted_at = datetime.now(timezone.utc)
    db.add(gone)
    await _add(db, org_id, user_id, "failed")

    resp = await client.get("/documents/summary")

    assert resp.json() == {"total": 1, "in_progress": 0, "needs_review": 1}


@pytest.mark.asyncio
async def test_matches_the_list_it_stands_in_for(db: AsyncSession, world) -> None:
    client, org_id, user_id = world
    await _add(db, org_id, user_id, "processing", "failed", "completed")

    listed = await document_repo.list_filtered(db, org_id)
    summary = (await client.get("/documents/summary")).json()

    assert summary["total"] == len(listed)


@pytest.mark.asyncio
async def test_is_not_read_as_a_document_id(world) -> None:
    client, _, _ = world

    assert (await client.get("/documents/summary")).status_code == 200
    assert (await client.get(f"/documents/{uuid.uuid4()}")).status_code == 404
