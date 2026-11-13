"""Triage writes on one posting serialize on its row lock.

Promote, Dismiss and Save load the posting with ``SELECT ... FOR UPDATE``, so
the "already applied" check holds against a concurrent Apply: a second writer
waits for the first to commit, then sees what it wrote. This pins the lock
itself: while one session holds the posting, another session's Dismiss can't
read it (it times out instead of deciding on stale state).
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.models.discovery.discovered_job import DiscoveredJob
from app.repositories.discovery import discovery_repository
from app.services.discovery import discovery_inbox_service

LOCK_NOT_AVAILABLE = "55P03"


@pytest.mark.asyncio
async def test_dismiss_waits_for_a_session_holding_the_posting(
    db: AsyncSession, db_engine: AsyncEngine, user_factory,
):
    user = await user_factory()
    user_id = uuid.UUID(user["id"])
    job = DiscoveredJob(
        user_id=user_id,
        source="jsearch",
        source_external_id="contended",
        title="Platform Engineer",
        company_name="Acme",
        remote_type="remote",
    )
    db.add(job)
    await db.commit()

    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    async with sessions() as holder, sessions() as other:
        assert await discovery_repository.get_discovered(
            holder, job.id, user_id, for_update=True,
        ) is not None
        await other.execute(text("SET LOCAL lock_timeout = '100ms'"))

        with pytest.raises(DBAPIError) as raised:
            await discovery_inbox_service.dismiss_discovered(other, job.id, user_id)

        await other.rollback()
        await holder.rollback()

    assert getattr(raised.value.orig, "sqlstate", None) == LOCK_NOT_AVAILABLE
    await db.refresh(job)
    assert job.dismissed_at is None
