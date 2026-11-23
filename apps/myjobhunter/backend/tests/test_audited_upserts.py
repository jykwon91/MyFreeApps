"""Upserts of discovered jobs and parsed skills are audited.

``discovery_repository.upsert_postings`` and the resume parser's skill insert
used ``INSERT ... ON CONFLICT``, which the audit listener never sees. They now
write through the ORM: a new row leaves INSERT audit rows naming the actor, a
re-fetched posting leaves UPDATE rows for what changed, and a skill the user
already has is skipped with no audit rows.
"""
from __future__ import annotations

import asyncio
import uuid
from collections.abc import Iterator
from typing import Any

import pytest
from platform_shared.core.audit_actor import audit_actor
from platform_shared.db.models.audit_log import AuditLog
from platform_shared.testing.audit_erasure import audit_listener_attached
from platform_shared.testing.audited_write_case import assert_row_audited
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.audit import AUDIT_CONFIG
from app.models.discovery.discovered_job import DiscoveredJob
from app.models.discovery.discovery_fetch import DiscoveryFetch
from app.models.profile.profile import Profile
from app.models.profile.skill import Skill
from app.repositories.discovery import discovery_repository
from app.repositories.profile import skill_repository
from tests import audited_write_seeds as seeds


@pytest.fixture()
def audit_listener() -> Iterator[None]:
    with audit_listener_attached(AUDIT_CONFIG):
        yield


def _posting(title: str, **fields: Any) -> dict[str, Any]:
    return {
        "source": "jsearch", "source_external_id": "ext-1", "title": title,
        "company_name": "Acme", "raw_payload": {}, **fields,
    }


async def _upsert(db: AsyncSession, fetch: DiscoveryFetch, posting: dict[str, Any]) -> tuple[int, int]:
    return await discovery_repository.upsert_postings(
        db, user_id=fetch.user_id, fetch_id=fetch.id, postings=[posting],
    )


async def _job(db: AsyncSession) -> DiscoveredJob:
    return (await db.execute(select(DiscoveredJob).execution_options(populate_existing=True))).scalar_one()


async def _clear_audit(db: AsyncSession) -> None:
    await db.flush()
    await db.flush()  # writes the listener's audit rows from the previous flush
    await db.execute(AuditLog.__table__.delete())


@pytest.mark.usefixtures("audit_listener")
async def test_a_new_posting_is_audited_as_an_insert(db: AsyncSession) -> None:
    fetch = await seeds.discovery_fetch(db)
    await _clear_audit(db)

    with audit_actor(fetch.user_id):
        assert await _upsert(db, fetch, _posting("Backend Engineer")) == (1, 0)

    job = await _job(db)
    assert (job.title, job.remote_type, job.salary_currency) == ("Backend Engineer", "unknown", "USD")
    await assert_row_audited(
        db, job, operation="INSERT", actor=fetch.user_id,
        fields=frozenset({"user_id", "source", "source_external_id", "title", "fetch_id"}),
    )


@pytest.mark.usefixtures("audit_listener")
async def test_a_refetched_posting_is_audited_as_an_update_and_keeps_its_state(db: AsyncSession) -> None:
    first = await seeds.discovery_fetch(db)
    await _upsert(db, first, _posting("Backend Engineer", remote_type="remote"))
    job = await _job(db)
    job.saved_at = seeds.NOW
    job.expired_at = seeds.NOW
    second = DiscoveryFetch(
        user_id=first.user_id, discovery_source_id=first.discovery_source_id, source="jsearch", started_at=seeds.NOW,
    )
    db.add(second)
    await _clear_audit(db)

    with audit_actor(first.user_id):
        assert await _upsert(db, second, _posting("Senior Backend Engineer")) == (0, 1)

    job = await _job(db)
    assert (job.title, job.fetch_id, job.expired_at, job.saved_at) == (
        "Senior Backend Engineer", second.id, None, seeds.NOW,
    )
    # Left out of the re-fetched posting, so it takes its insert value, as before.
    assert job.remote_type == "unknown"
    await assert_row_audited(
        db, job, operation="UPDATE", actor=first.user_id,
        fields=frozenset({"title", "fetch_id", "expired_at", "remote_type", "updated_at"}),
    )


async def test_two_fetches_upserting_one_new_posting_share_one_row(
    db: AsyncSession, db_engine: AsyncEngine,
) -> None:
    """The ON CONFLICT guarantee: the loser of the insert race updates the winner's row."""
    fetch = await seeds.discovery_fetch(db)
    await db.commit()
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)

    async with sessions() as first, sessions() as second:
        assert await _upsert(first, fetch, _posting("First")) == (1, 0)
        racing = asyncio.create_task(_upsert(second, fetch, _posting("Second")))
        await asyncio.sleep(0.3)
        assert not racing.done(), "the second insert didn't wait for the first one's uncommitted key"
        await first.commit()
        assert await asyncio.wait_for(racing, timeout=5) == (0, 1)
        await second.commit()

    titles = (await db.execute(select(DiscoveredJob.title))).scalars().all()
    assert titles == ["Second"]


async def _skill(db: AsyncSession, name: str) -> tuple[Skill, uuid.UUID]:
    owner = await seeds.user(db)
    profile = Profile(user_id=owner.id)
    db.add(profile)
    await db.flush()
    return Skill(user_id=owner.id, profile_id=profile.id, name=name, category="language"), owner.id


@pytest.mark.usefixtures("audit_listener")
async def test_a_new_skill_is_audited_as_an_insert(db: AsyncSession) -> None:
    skill, owner_id = await _skill(db, "Python")
    await _clear_audit(db)

    with audit_actor(owner_id):
        assert await skill_repository.add_if_absent(db, skill) is True

    stored = (await db.execute(select(Skill))).scalar_one()
    assert (stored.name, stored.category) == ("Python", "language")
    await assert_row_audited(
        db, stored, operation="INSERT", actor=owner_id, fields=frozenset({"user_id", "profile_id", "name"}),
    )


@pytest.mark.usefixtures("audit_listener")
async def test_a_skill_the_user_has_in_another_case_is_skipped(db: AsyncSession) -> None:
    skill, owner_id = await _skill(db, "Python")
    assert await skill_repository.add_if_absent(db, skill) is True
    await _clear_audit(db)

    duplicate = Skill(user_id=owner_id, profile_id=skill.profile_id, name="PYTHON", category="tool")
    with audit_actor(owner_id):
        assert await skill_repository.add_if_absent(db, duplicate) is False

    await db.flush()
    assert (await db.execute(select(Skill.name, Skill.category))).all() == [("Python", "language")]
    count = (await db.execute(
        select(func.count()).select_from(AuditLog).where(AuditLog.table_name == "skills"),
    )).scalar_one()
    assert count == 0
