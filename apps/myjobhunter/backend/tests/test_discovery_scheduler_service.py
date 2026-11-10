"""Tests for discovery_scheduler_service — APScheduler wiring.

Real APScheduler is used with a MemoryJobStore (paused, so nothing fires)
so each test gets an isolated scheduler without touching
``apscheduler_jobs``. The persistent-jobstore path is covered in
test_discovery_scheduler_worker.py.

The reconcile tests drive the real cross-process path: the API writes
``discovery_sources`` rows over HTTP, then ``reconcile_source_jobs`` (what
the scheduler process runs every RECONCILE_INTERVAL_SECONDS) brings the
scheduler in line.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from apscheduler.jobstores.memory import MemoryJobStore
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.models.discovery.discovery_source import DiscoverySource
from app.services.discovery import discovery_fetch_service, discovery_scheduler_service
from app.services.discovery.discovery_scheduler_service import (
    SchedulerNotStartedError,
    SchedulerSourceMismatchError,
    _job_id,
    _run_scheduled_fetch,
    add_source_job,
    reconcile_source_jobs,
    remove_source_job,
)


@pytest_asyncio.fixture
async def real_scheduler(monkeypatch: pytest.MonkeyPatch):
    """A real, paused AsyncIOScheduler on a MemoryJobStore."""
    sched = AsyncIOScheduler(
        jobstores={"default": MemoryJobStore()}, timezone="UTC",
    )
    sched.start(paused=True)
    monkeypatch.setattr(discovery_scheduler_service, "_scheduler", sched)

    yield sched

    sched.shutdown(wait=False)
    monkeypatch.setattr(discovery_scheduler_service, "_scheduler", None)


def _interval(sched: AsyncIOScheduler, source_id: uuid.UUID) -> timedelta:
    job = sched.get_job(_job_id(source_id))
    assert job is not None
    assert isinstance(job.trigger, IntervalTrigger)
    return job.trigger.interval


async def _create_source(authed, interval: int = 1440, query: str = "test") -> uuid.UUID:
    resp = await authed.post(
        "/discover/sources",
        json={
            "source": "jsearch",
            "name": query,
            "config": {"query": query},
            "fetch_interval_minutes": interval,
        },
    )
    assert resp.status_code == 201, resp.text
    return uuid.UUID(resp.json()["id"])


# ===========================================================================
# add_source_job / remove_source_job
# ===========================================================================


@pytest.mark.asyncio
async def test_add_source_job_registers(real_scheduler):
    source_id = uuid.uuid4()
    user_id = uuid.uuid4()

    add_source_job(source_id, user_id, interval_minutes=60)

    job = real_scheduler.get_job(_job_id(source_id))
    assert job is not None
    assert job.kwargs == {"source_id": source_id, "user_id": user_id}
    assert _interval(real_scheduler, source_id) == timedelta(minutes=60)


@pytest.mark.asyncio
async def test_add_source_job_replaces(real_scheduler):
    source_id = uuid.uuid4()
    user_id = uuid.uuid4()

    add_source_job(source_id, user_id, interval_minutes=60)
    add_source_job(source_id, user_id, interval_minutes=120)

    assert [j.id for j in real_scheduler.get_jobs()] == [_job_id(source_id)]
    assert _interval(real_scheduler, source_id) == timedelta(minutes=120)


@pytest.mark.asyncio
async def test_missed_runs_fire_once_on_recovery(real_scheduler):
    """An outage at fire time must run the pass once when the scheduler is
    back, not skip it until the next interval (up to a day)."""
    source_id = uuid.uuid4()
    add_source_job(source_id, uuid.uuid4(), interval_minutes=60)

    job = real_scheduler.get_job(_job_id(source_id))
    assert job.misfire_grace_time is None
    assert job.coalesce is True
    assert job.max_instances == 1


@pytest.mark.asyncio
async def test_remove_source_job_removes(real_scheduler):
    source_id = uuid.uuid4()
    add_source_job(source_id, uuid.uuid4(), interval_minutes=60)

    remove_source_job(source_id)
    assert real_scheduler.get_job(_job_id(source_id)) is None


@pytest.mark.asyncio
async def test_remove_source_job_idempotent_when_missing(real_scheduler):
    remove_source_job(uuid.uuid4())


def test_helpers_raise_when_scheduler_not_started(monkeypatch: pytest.MonkeyPatch):
    """Outside the scheduler process there is no scheduler to talk to."""
    monkeypatch.setattr(discovery_scheduler_service, "_scheduler", None)

    with pytest.raises(SchedulerNotStartedError):
        add_source_job(uuid.uuid4(), uuid.uuid4(), interval_minutes=60)
    with pytest.raises(SchedulerNotStartedError):
        remove_source_job(uuid.uuid4())


# ===========================================================================
# reconcile_source_jobs — how API writes reach the scheduler process
# ===========================================================================


@pytest.mark.asyncio
async def test_reconcile_adds_job_for_source_created_via_api(
    real_scheduler, user_factory, as_user, db,
):
    user = await user_factory()
    async with await as_user(user) as a:
        source_id = await _create_source(a, interval=720)

    # The API never touched the scheduler.
    assert real_scheduler.get_job(_job_id(source_id)) is None

    result = await reconcile_source_jobs(db)

    assert (result.added, result.rescheduled, result.removed) == (1, 0, 0)
    job = real_scheduler.get_job(_job_id(source_id))
    assert job is not None
    assert job.kwargs == {"source_id": source_id, "user_id": uuid.UUID(user["id"])}
    assert _interval(real_scheduler, source_id) == timedelta(minutes=720)


@pytest.mark.asyncio
async def test_reconcile_leaves_matching_jobs_alone(
    real_scheduler, user_factory, as_user, db,
):
    """An unchanged job keeps its next_run_time — a restart or a second
    reconcile must not push every fetch back by a full interval."""
    user = await user_factory()
    async with await as_user(user) as a:
        source_id = await _create_source(a)

    await reconcile_source_jobs(db)
    job_before = real_scheduler.get_job(_job_id(source_id))
    real_scheduler.modify_job(
        job_before.id, next_run_time=datetime(2030, 1, 1, tzinfo=timezone.utc),
    )

    result = await reconcile_source_jobs(db)

    assert not result.changed
    assert result.active_sources == 1
    job_after = real_scheduler.get_job(_job_id(source_id))
    assert job_after.next_run_time == datetime(2030, 1, 1, tzinfo=timezone.utc)


@pytest.mark.asyncio
async def test_reconcile_reschedules_after_interval_patch(
    real_scheduler, user_factory, as_user, db,
):
    user = await user_factory()
    async with await as_user(user) as a:
        source_id = await _create_source(a, interval=1440)
        await reconcile_source_jobs(db)

        resp = await a.patch(
            f"/discover/sources/{source_id}", json={"fetch_interval_minutes": 120},
        )
        assert resp.status_code == 200

    db.expire_all()
    result = await reconcile_source_jobs(db)

    assert (result.added, result.rescheduled, result.removed) == (0, 1, 0)
    assert _interval(real_scheduler, source_id) == timedelta(minutes=120)


@pytest.mark.asyncio
async def test_reconcile_replaces_job_whose_owner_changed(
    real_scheduler, user_factory, as_user, db,
):
    """A job whose payload user_id no longer matches the row is replaced,
    so the job runner never trips SchedulerSourceMismatchError on it."""
    user = await user_factory()
    async with await as_user(user) as a:
        source_id = await _create_source(a)
    add_source_job(source_id, uuid.uuid4(), interval_minutes=1440)

    result = await reconcile_source_jobs(db)

    assert (result.added, result.rescheduled, result.removed) == (0, 1, 0)
    job = real_scheduler.get_job(_job_id(source_id))
    assert job.kwargs["user_id"] == uuid.UUID(user["id"])


@pytest.mark.asyncio
async def test_reconcile_removes_job_after_deactivate(
    real_scheduler, user_factory, as_user, db,
):
    user = await user_factory()
    async with await as_user(user) as a:
        source_id = await _create_source(a)
        await reconcile_source_jobs(db)
        assert real_scheduler.get_job(_job_id(source_id)) is not None

        resp = await a.delete(f"/discover/sources/{source_id}")
        assert resp.status_code == 204

    db.expire_all()
    result = await reconcile_source_jobs(db)

    assert (result.added, result.rescheduled, result.removed) == (0, 0, 1)
    assert real_scheduler.get_job(_job_id(source_id)) is None


@pytest.mark.asyncio
async def test_reconcile_readds_job_after_reactivate(
    real_scheduler, user_factory, as_user, db,
):
    """PATCH is_active=true used to leave a reactivated source unscheduled."""
    user = await user_factory()
    async with await as_user(user) as a:
        source_id = await _create_source(a)
        await a.patch(f"/discover/sources/{source_id}", json={"is_active": False})
        db.expire_all()
        await reconcile_source_jobs(db)
        assert real_scheduler.get_job(_job_id(source_id)) is None

        resp = await a.patch(f"/discover/sources/{source_id}", json={"is_active": True})
        assert resp.status_code == 200

    db.expire_all()
    result = await reconcile_source_jobs(db)

    assert result.added == 1
    assert real_scheduler.get_job(_job_id(source_id)) is not None


@pytest.mark.asyncio
async def test_reconcile_removes_orphans_and_ignores_foreign_jobs(
    real_scheduler, db,
):
    """A discovery job whose source no longer exists is dropped; jobs
    without the discovery id prefix are not reconcile's to manage."""
    orphan = uuid.uuid4()
    add_source_job(orphan, uuid.uuid4(), interval_minutes=60)
    real_scheduler.add_job(
        print, trigger=IntervalTrigger(minutes=5), id="something-else",
    )

    result = await reconcile_source_jobs(db)

    assert result.removed == 1
    assert real_scheduler.get_job(_job_id(orphan)) is None
    assert real_scheduler.get_job("something-else") is not None


@pytest.mark.asyncio
async def test_reconcile_requires_running_scheduler(
    monkeypatch: pytest.MonkeyPatch, db,
):
    monkeypatch.setattr(discovery_scheduler_service, "_scheduler", None)
    with pytest.raises(SchedulerNotStartedError):
        await reconcile_source_jobs(db)


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

    async def _must_not_fetch(*args, **kwargs):
        raise AssertionError("fetch_source called for an inactive source")

    monkeypatch.setattr(discovery_fetch_service, "fetch_source", _must_not_fetch)

    await _run_scheduled_fetch(fake_source_id, user_id)

    assert real_scheduler.get_job(_job_id(fake_source_id)) is None
