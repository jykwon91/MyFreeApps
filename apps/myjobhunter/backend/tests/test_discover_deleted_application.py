"""Deleting an application returns its posting to Discover.

Applications are soft-deleted, so the posting's ``promoted_application_id``
(``ON DELETE SET NULL``) used to keep pointing at the deleted application and
the posting stayed out of every Discover view. Deleting the application now
clears the link in the same transaction, and migration ``promolink261113``
clears the links left before that.
"""
from __future__ import annotations

import importlib.util
import uuid
from datetime import datetime, timezone
from pathlib import Path
from types import ModuleType

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.models.application.application import Application
from app.models.discovery.discovered_job import DiscoveredJob

_MIGRATION = (
    Path(__file__).parent.parent / "alembic" / "versions"
    / "promolink261113_clear_links_to_deleted_applications.py"
)


def _load_migration() -> ModuleType:
    spec = importlib.util.spec_from_file_location("promolink261113", _MIGRATION)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


async def _applied(db: AsyncSession, a: AsyncClient, user_id: uuid.UUID, name: str) -> tuple[DiscoveredJob, str]:
    job = DiscoveredJob(
        user_id=user_id,
        source="jsearch",
        source_external_id=name,
        title=f"Engineer {name}",
        company_name="Acme",
        remote_type="remote",
    )
    db.add(job)
    await db.commit()
    resp = await a.post(f"/discover/{job.id}/promote")
    assert resp.status_code == 201
    return job, resp.json()["id"]


async def _inbox(a: AsyncClient) -> list[dict]:
    return (await a.get("/discover", params={"state": "inbox"})).json()["items"]


@pytest.mark.asyncio
async def test_deleting_the_application_returns_its_posting_to_discover(
    db: AsyncSession, client: AsyncClient, user_factory, as_user,
):
    user = await user_factory()
    async with await as_user(user) as a:
        job, application_id = await _applied(db, a, uuid.UUID(user["id"]), "deleted")
        assert await _inbox(a) == []

        assert (await a.delete(f"/applications/{application_id}")).status_code == 204
        inbox = await _inbox(a)
        assert (await a.post(f"/discover/{job.id}/save")).status_code == 204
        fresh = await a.post(f"/discover/{job.id}/promote")

    assert [item["id"] for item in inbox] == [str(job.id)]
    assert inbox[0]["promoted_application_id"] is None
    assert fresh.status_code == 201
    assert fresh.json()["id"] != application_id


@pytest.mark.asyncio
async def test_another_user_cannot_unlink_a_posting_by_deleting_its_application(
    db: AsyncSession, client: AsyncClient, user_factory, as_user,
):
    owner = await user_factory()
    other = await user_factory()
    async with await as_user(owner) as a:
        job, application_id = await _applied(db, a, uuid.UUID(owner["id"]), "owners")
    async with await as_user(other) as b:
        assert (await b.delete(f"/applications/{application_id}")).status_code == 404

    await db.refresh(job)
    assert str(job.promoted_application_id) == application_id
    assert job.promoted_at is not None


@pytest.mark.asyncio
async def test_the_migration_clears_links_to_deleted_applications_only(
    db: AsyncSession, db_engine: AsyncEngine, client: AsyncClient, user_factory, as_user,
):
    """Links left by deletes before the fix are cleared; live links, and other users', are kept."""
    user = await user_factory()
    other = await user_factory()
    async with await as_user(user) as a:
        dead, dead_app = await _applied(db, a, uuid.UUID(user["id"]), "dead")
        live, live_app = await _applied(db, a, uuid.UUID(user["id"]), "live")
    async with await as_user(other) as b:
        others, others_app = await _applied(db, b, uuid.UUID(other["id"]), "others")
    # What a delete did before the fix: soft-delete only, the link left behind.
    application = await db.get(Application, uuid.UUID(dead_app))
    assert application is not None
    application.deleted_at = datetime.now(timezone.utc)
    await db.commit()

    async with db_engine.begin() as conn:
        await conn.run_sync(_load_migration().clear_links_to_deleted_applications)

    for job in (dead, live, others):
        await db.refresh(job)
    assert dead.promoted_application_id is None
    assert dead.promoted_at is None
    assert str(live.promoted_application_id) == live_app
    assert str(others.promoted_application_id) == others_app
