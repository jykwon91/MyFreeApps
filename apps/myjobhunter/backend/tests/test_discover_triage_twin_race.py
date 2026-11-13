"""A twin fetched between the twin check and the commit.

Save, Restore and Apply check for a twin (same content, another source)
before clearing a posting's dismissal. A fetch can still insert one after
that check; the write then violates ``uq_discovered_user_content_hash``. That
used to be a 500. Now Save and Restore answer the same coded 409 as when the
twin was there first, and Apply retries and promotes the twin.

The race is made deterministic: the twin check inserts the twin through a
second session, commits it, and reports no twin.
"""
from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.discovered_job_conflicts import DUPLICATE_CODE, DUPLICATE_MESSAGE
from app.models.discovery.discovered_job import DiscoveredJob
from app.repositories.discovery import discovery_duplicate_repository, discovery_repository
from app.repositories.application import application_event_repository
from app.services.discovery import discovery_inbox_service, discovery_promote_service

CONTENT_HASH = "b" * 64


def _posting(user_id: uuid.UUID, source: str, *, dismissed: bool) -> DiscoveredJob:
    return DiscoveredJob(
        user_id=user_id,
        source=source,
        source_external_id=f"{source}-posting",
        title="Platform Engineer",
        company_name="Acme",
        remote_type="remote",
        content_hash=CONTENT_HASH,
        dismissed_at=datetime.now(timezone.utc) if dismissed else None,
        dismissed_reason="not_remote" if dismissed else None,
    )


def _twin_arrives_after_the_check(
    monkeypatch: pytest.MonkeyPatch, db_engine: AsyncEngine, user_id: uuid.UUID,
) -> None:
    """The first twin check sees none, but a fetch commits a twin right after it."""
    real = discovery_duplicate_repository.get_active_twin
    sessions = async_sessionmaker(db_engine, expire_on_commit=False)
    calls = 0

    async def check(db: AsyncSession, job: DiscoveredJob) -> DiscoveredJob | None:
        nonlocal calls
        calls += 1
        if calls > 1:
            return await real(db, job)
        async with sessions() as fetch:
            fetch.add(_posting(user_id, "greenhouse", dismissed=False))
            await fetch.commit()
        return None

    monkeypatch.setattr(discovery_duplicate_repository, "get_active_twin", check)


async def _dismissed(db: AsyncSession, user_id: uuid.UUID) -> DiscoveredJob:
    job = _posting(user_id, "jsearch", dismissed=True)
    db.add(job)
    await db.commit()
    return job


@pytest.mark.asyncio
@pytest.mark.parametrize("action", ["save", "undo-dismiss"])
async def test_a_twin_arriving_mid_write_gets_the_duplicate_409_not_a_500(
    db: AsyncSession, db_engine: AsyncEngine, client: AsyncClient, user_factory, as_user,
    monkeypatch: pytest.MonkeyPatch, action: str,
):
    user = await user_factory()
    user_id = uuid.UUID(user["id"])
    job = await _dismissed(db, user_id)
    _twin_arrives_after_the_check(monkeypatch, db_engine, user_id)

    async with await as_user(user) as a:
        resp = await a.post(f"/discover/{job.id}/{action}")

    assert resp.status_code == 409
    assert resp.json()["detail"] == {"code": DUPLICATE_CODE, "message": DUPLICATE_MESSAGE}
    await db.refresh(job)
    assert job.dismissed_at is not None
    assert job.dismissed_reason == "not_remote"
    assert job.saved_at is None


@pytest.mark.asyncio
async def test_applying_when_a_twin_arrives_mid_write_applies_the_twin(
    db: AsyncSession, db_engine: AsyncEngine, client: AsyncClient, user_factory, as_user,
    monkeypatch: pytest.MonkeyPatch,
):
    user = await user_factory()
    user_id = uuid.UUID(user["id"])
    job = await _dismissed(db, user_id)
    _twin_arrives_after_the_check(monkeypatch, db_engine, user_id)

    async with await as_user(user) as a:
        resp = await a.post(f"/discover/{job.id}/promote")
        applications = (await a.get("/applications")).json()

    assert resp.status_code == 201
    assert applications["total"] == 1
    twin = (
        await db.execute(select(DiscoveredJob).where(DiscoveredJob.source == "greenhouse"))
    ).scalar_one()
    await db.refresh(job)
    assert str(twin.promoted_application_id) == resp.json()["id"]
    assert str(job.promoted_application_id) == resp.json()["id"]
    assert job.dismissed_at is not None


class _DriverError(Exception):
    constraint_name = "chk_discovered_state"


@pytest.mark.asyncio
@pytest.mark.parametrize("action", ["save", "restore"])
async def test_any_other_integrity_error_is_not_mistaken_for_a_twin(
    db: AsyncSession, user_factory, monkeypatch: pytest.MonkeyPatch, action: str,
):
    user = await user_factory()
    user_id = uuid.UUID(user["id"])
    job = await _dismissed(db, user_id)
    orig = Exception("violates check constraint")
    orig.__cause__ = _DriverError()

    async def violate(*args: object, **kwargs: object) -> None:
        raise IntegrityError("UPDATE discovered_jobs ...", {}, orig)

    write = "save_discovered" if action == "save" else "undo_dismiss_discovered"
    monkeypatch.setattr(discovery_repository, write, violate)
    service: Callable[..., Awaitable[bool]] = (
        discovery_inbox_service.save_discovered if action == "save"
        else discovery_inbox_service.undo_dismiss_for_user
    )

    with pytest.raises(IntegrityError):
        await service(db, job.id, user_id)


@pytest.mark.asyncio
async def test_any_other_integrity_error_is_not_retried_by_apply(
    db: AsyncSession, user_factory, monkeypatch: pytest.MonkeyPatch,
):
    user = await user_factory()
    user_id = uuid.UUID(user["id"])
    job = await _dismissed(db, user_id)
    orig = Exception("violates check constraint")
    orig.__cause__ = _DriverError()
    attempts = 0

    async def violate(*args: object, **kwargs: object) -> None:
        nonlocal attempts
        attempts += 1
        raise IntegrityError("INSERT INTO application_events ...", {}, orig)

    monkeypatch.setattr(application_event_repository, "create", violate)

    with pytest.raises(IntegrityError):
        await discovery_promote_service.promote_discovered_job(db, user_id, job.id)
    assert attempts == 1
