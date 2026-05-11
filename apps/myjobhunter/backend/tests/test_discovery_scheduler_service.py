"""Tests for discovery_scheduler_service — APScheduler wiring (PR 5).

The autouse ``_disable_discovery_scheduler`` fixture in conftest.py
no-ops the CRUD helpers for every other test. These tests re-patch the
relevant symbols back to the real implementations so they exercise
actual scheduler behaviour.

Real APScheduler is used (with MemoryJobStore instead of the production
SQLAlchemyJobStore) so each test can spin up + tear down an isolated
scheduler in-process without touching the database.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from apscheduler.jobstores.memory import MemoryJobStore
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.services.discovery import discovery_scheduler_service
from app.services.discovery.discovery_scheduler_service import (
    SchedulerNotStartedError,
    SchedulerSourceMismatchError,
    _job_id,
    _run_scheduled_fetch,
    add_source_job,
    register_source_jobs,
    remove_source_job,
    update_source_job,
)


@pytest_asyncio.fixture
async def real_scheduler(monkeypatch: pytest.MonkeyPatch):
    """Spin up a real AsyncIOScheduler backed by MemoryJobStore.

    Replaces the module-level ``_scheduler`` directly to bypass the
    Postgres jobstore (which would require a live DB connection and slow
    every test). Re-patches the autouse no-op mocks back to the real
    implementations so this test exercises actual scheduler behaviour.

    AsyncIOScheduler requires a running event loop on ``start``, which
    is why this fixture is async.
    """
    # Restore real implementations (autouse fixture mocked them).
    monkeypatch.setattr(
        discovery_scheduler_service, "add_source_job", add_source_job,
    )
    monkeypatch.setattr(
        discovery_scheduler_service, "remove_source_job", remove_source_job,
    )
    monkeypatch.setattr(
        discovery_scheduler_service, "update_source_job", update_source_job,
    )

    sched = AsyncIOScheduler(
        jobstores={"default": MemoryJobStore()}, timezone="UTC",
    )
    sched.start(paused=True)  # paused so jobs don't actually fire
    monkeypatch.setattr(discovery_scheduler_service, "_scheduler", sched)

    yield sched

    sched.shutdown(wait=False)
    monkeypatch.setattr(discovery_scheduler_service, "_scheduler", None)


# ===========================================================================
# add_source_job / remove_source_job / update_source_job
# ===========================================================================


@pytest.mark.asyncio
async def test_add_source_job_registers(real_scheduler):
    source_id = uuid.uuid4()
    user_id = uuid.uuid4()

    add_source_job(source_id, user_id, interval_minutes=60)

    job = real_scheduler.get_job(_job_id(source_id))
    assert job is not None
    assert job.kwargs == {"source_id": source_id, "user_id": user_id}


@pytest.mark.asyncio
async def test_add_source_job_is_idempotent(real_scheduler):
    source_id = uuid.uuid4()
    user_id = uuid.uuid4()

    add_source_job(source_id, user_id, interval_minutes=60)
    add_source_job(source_id, user_id, interval_minutes=120)  # replace

    job = real_scheduler.get_job(_job_id(source_id))
    assert job is not None
    # Trigger should reflect the new interval. We can't introspect the
    # raw minutes directly across APScheduler versions, but the job
    # being still single confirms replace_existing worked.
    jobs = real_scheduler.get_jobs()
    assert len([j for j in jobs if j.id == _job_id(source_id)]) == 1


@pytest.mark.asyncio
async def test_update_source_job_round_trip(real_scheduler):
    source_id = uuid.uuid4()
    user_id = uuid.uuid4()

    add_source_job(source_id, user_id, interval_minutes=60)
    update_source_job(source_id, user_id, interval_minutes=720)

    job = real_scheduler.get_job(_job_id(source_id))
    assert job is not None


@pytest.mark.asyncio
async def test_remove_source_job_removes(real_scheduler):
    source_id = uuid.uuid4()
    user_id = uuid.uuid4()

    add_source_job(source_id, user_id, interval_minutes=60)
    assert real_scheduler.get_job(_job_id(source_id)) is not None

    remove_source_job(source_id)
    assert real_scheduler.get_job(_job_id(source_id)) is None


@pytest.mark.asyncio
async def test_remove_source_job_idempotent_when_missing(real_scheduler):
    # No add — remove should be a no-op, not raise.
    remove_source_job(uuid.uuid4())


def test_add_source_job_raises_when_scheduler_not_started(
    monkeypatch: pytest.MonkeyPatch,
):
    """If the scheduler hasn't been started, the CRUD helpers raise."""
    monkeypatch.setattr(
        discovery_scheduler_service, "add_source_job", add_source_job,
    )
    monkeypatch.setattr(discovery_scheduler_service, "_scheduler", None)

    with pytest.raises(SchedulerNotStartedError):
        add_source_job(uuid.uuid4(), uuid.uuid4(), interval_minutes=60)


# ===========================================================================
# register_source_jobs — startup sweep
# ===========================================================================


@pytest.mark.asyncio
async def test_register_source_jobs_picks_up_active_sources(
    real_scheduler,
    client,  # noqa: ARG001 — pulls in the test DB fixture
    user_factory,
    as_user,
    db,
):
    """The startup sweep registers one job per active DiscoverySource.

    Creates a source through the HTTP API (with the scheduler mock
    bypassed via ``real_scheduler``), then runs ``register_source_jobs``
    against the test DB and asserts one job was scheduled.
    """
    user = await user_factory()
    async with await as_user(user) as a:
        resp = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "test"}},
        )
        assert resp.status_code == 201
        source_id = uuid.UUID(resp.json()["id"])

    # ``register_source_jobs`` scans the DB for is_active=True rows.
    # The test client's rolled-back transaction means we have to use
    # the same session for the read.
    count = await register_source_jobs(db)
    assert count >= 1
    assert real_scheduler.get_job(_job_id(source_id)) is not None


# ===========================================================================
# _run_scheduled_fetch — the actual job function
# ===========================================================================


@pytest.mark.asyncio
async def test_run_scheduled_fetch_missing_source_removes_job(
    real_scheduler, monkeypatch: pytest.MonkeyPatch,
):
    """When the source no longer exists in the DB, the job removes itself.

    Patches ``AsyncSessionLocal`` so the function uses a session that
    sees no matching row. Confirms ``remove_source_job`` was called.
    """
    # Patch the session factory to yield a session that returns None
    # from db.get(DiscoverySource, ...).
    fake_source_id = uuid.uuid4()
    fake_user_id = uuid.uuid4()

    # Pre-register a job so we can confirm it gets removed.
    add_source_job(fake_source_id, fake_user_id, interval_minutes=60)
    assert real_scheduler.get_job(_job_id(fake_source_id)) is not None

    class _FakeSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, model, key):  # noqa: ARG002
            return None

    monkeypatch.setattr(
        discovery_scheduler_service, "AsyncSessionLocal", _FakeSession,
    )

    await _run_scheduled_fetch(fake_source_id, fake_user_id)

    # Job should have been removed by the missing-source cleanup branch.
    assert real_scheduler.get_job(_job_id(fake_source_id)) is None


@pytest.mark.asyncio
async def test_run_scheduled_fetch_user_id_mismatch_raises(
    real_scheduler, monkeypatch: pytest.MonkeyPatch,
):
    """A user_id mismatch between payload and DB row is a hard error.

    Prevents cross-tenant leakage if scheduler state ever drifts.
    """
    from app.models.discovery.discovery_source import DiscoverySource

    fake_source_id = uuid.uuid4()
    real_user_id = uuid.uuid4()
    payload_user_id = uuid.uuid4()
    assert real_user_id != payload_user_id

    stub_source = DiscoverySource(
        id=fake_source_id,
        user_id=real_user_id,
        source="jsearch",
        config={},
        is_active=True,
        fetch_interval_minutes=60,
        consecutive_failures=0,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    class _FakeSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, model, key):  # noqa: ARG002
            return stub_source

    monkeypatch.setattr(
        discovery_scheduler_service, "AsyncSessionLocal", _FakeSession,
    )

    with pytest.raises(SchedulerSourceMismatchError):
        await _run_scheduled_fetch(fake_source_id, payload_user_id)


@pytest.mark.asyncio
async def test_run_scheduled_fetch_inactive_source_skips_and_removes(
    real_scheduler, monkeypatch: pytest.MonkeyPatch,
):
    """An inactive source is skipped + the scheduled job is removed."""
    from app.models.discovery.discovery_source import DiscoverySource

    fake_source_id = uuid.uuid4()
    user_id = uuid.uuid4()

    add_source_job(fake_source_id, user_id, interval_minutes=60)
    assert real_scheduler.get_job(_job_id(fake_source_id)) is not None

    stub_source = DiscoverySource(
        id=fake_source_id,
        user_id=user_id,
        source="jsearch",
        config={},
        is_active=False,
        fetch_interval_minutes=60,
        consecutive_failures=0,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    class _FakeSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, model, key):  # noqa: ARG002
            return stub_source

    monkeypatch.setattr(
        discovery_scheduler_service, "AsyncSessionLocal", _FakeSession,
    )

    # No fetch service is invoked because is_active=False short-circuits.
    await _run_scheduled_fetch(fake_source_id, user_id)

    assert real_scheduler.get_job(_job_id(fake_source_id)) is None
