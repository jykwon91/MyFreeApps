"""Deleting a user who promoted a Discover posting into an application.

``discovered_jobs.promoted_application_id`` is ``ON DELETE SET NULL`` and
``chk_discovered_promoted`` ties it to ``promoted_at``. Hard-deleting the
application while the posting row still exists would null the id and leave
``promoted_at``, which the check rejects. Account deletion hard-deletes the
applications before the user, so it has to remove the postings first. The demo
cleanup is a single ``DELETE FROM users``: Postgres runs both user-level
cascades before the nested SET NULL, so the posting is already gone. Both
paths must remove everything.
"""
import uuid
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.models.application.application import Application
from app.models.discovery.discovered_job import DiscoveredJob
from app.models.user.user import User
from app.services.demo import demo_service
from app.services.discovery.discovery_promote_service import promote_discovered_job
from tests.test_account_deletion_files import (  # noqa: F401  (fixtures + helpers shared with the files tests)
    _delete_account,
    _make_user,
    _patch_session,
    _user_exists,
)


async def _count(db: AsyncSession, model: type, user_id: uuid.UUID) -> int:
    return await db.scalar(select(func.count()).select_from(model).where(model.user_id == user_id))


async def _promote_a_posting(db: AsyncSession, user_id: uuid.UUID) -> DiscoveredJob:
    job = DiscoveredJob(
        user_id=user_id,
        source="greenhouse",
        source_external_id=str(uuid.uuid4()),
        title="Backend Engineer",
        company_name="Acme",
    )
    db.add(job)
    await db.flush()
    await promote_discovered_job(db, user_id, job.id)
    return job


async def _user_with_promoted_posting(db: AsyncSession) -> User:
    user = _make_user()
    db.add(user)
    await db.flush()
    await _promote_a_posting(db, user.id)
    # A posting left in the inbox, alongside the promoted one.
    db.add(DiscoveredJob(
        user_id=user.id, source="lever", source_external_id=str(uuid.uuid4()),
        title="Platform Engineer", company_name="Globex",
    ))
    await db.flush()
    return user


@pytest.mark.asyncio
async def test_deleting_an_account_with_a_promoted_posting_leaves_no_rows(db: AsyncSession) -> None:
    user = await _user_with_promoted_posting(db)
    other = await _user_with_promoted_posting(db)

    with patch("app.services.user.account_deletion_service.get_storage", MagicMock()):
        response = await _delete_account(user)

    assert response.status_code == 204
    assert not await _user_exists(db, user.id)
    assert await _count(db, DiscoveredJob, user.id) == 0
    assert await _count(db, Application, user.id) == 0

    other_promoted = (await db.scalars(
        select(DiscoveredJob)
        .where(DiscoveredJob.user_id == other.id, DiscoveredJob.promoted_at.is_not(None))
        .execution_options(populate_existing=True)
    )).one()
    assert other_promoted.promoted_application_id is not None
    assert await _count(db, DiscoveredJob, other.id) == 2
    assert await _count(db, Application, other.id) == 1


@pytest.mark.asyncio
async def test_deleting_a_demo_user_with_a_promoted_posting_leaves_no_rows() -> None:
    created = await demo_service.create_demo_user()
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as sess:
            await _promote_a_posting(sess, created.user_id)

        await demo_service.delete_demo_user(created.user_id)

        async with factory() as sess:
            for table in ("users", "discovered_jobs", "applications"):
                column = "id" if table == "users" else "user_id"
                remaining = await sess.scalar(
                    text(f"SELECT COUNT(*) FROM {table} WHERE {column} = :id"),
                    {"id": created.user_id},
                )
                assert remaining == 0, f"{table} should be empty"
    finally:
        await engine.dispose()
