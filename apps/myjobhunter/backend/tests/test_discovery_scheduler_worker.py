"""Tests for the dedicated discovery scheduler process.

- the worker entrypoint boots, reconciles, heartbeats and shuts down cleanly
- boot fails loud (scheduler never started) when the jobstore can't be built
- the jobstore factory refuses to run against an unmigrated database
- end to end on the real ``apscheduler_jobs`` table: a source the API creates
  is persisted as a job by the scheduler process's reconcile
- the container healthcheck reads the heartbeat
"""
from __future__ import annotations

import asyncio
import os
import signal
import time
import uuid
from pathlib import Path

import pytest
from apscheduler.jobstores.memory import MemoryJobStore
from sqlalchemy import create_engine, text

from app.core.config import settings
from app.db import scheduler_jobstore
from app.db.scheduler_jobstore import (
    SchedulerJobstoreMissingError,
    build_scheduler_jobstore,
)
from app.services.discovery import discovery_embedding_service, discovery_scheduler_service
from app.services.discovery.discovery_scheduler_service import _job_id
from app.schemas.discovery.scheduler_reconcile_result import SchedulerReconcileResult
from app.workers import discovery_scheduler_healthcheck, discovery_scheduler_worker
from app.workers.discovery_scheduler_worker import SchedulerReconcileFailingError

_OK = SchedulerReconcileResult(added=0, rescheduled=0, removed=0, active_sources=0)


@pytest.fixture
def heartbeat(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "heartbeat"
    monkeypatch.setattr(discovery_scheduler_worker, "HEARTBEAT_PATH", path)
    monkeypatch.setattr(discovery_scheduler_healthcheck, "HEARTBEAT_PATH", path)
    return path


@pytest.fixture
def worker_boot_stubs(monkeypatch: pytest.MonkeyPatch) -> None:
    """Skip Sentry + the fastembed model; keep a fast dispose."""
    monkeypatch.setattr(discovery_scheduler_worker, "init_sentry", lambda: None)
    monkeypatch.setattr(discovery_embedding_service, "load_model_eager", lambda: None)

    class _NoDispose:
        async def dispose(self) -> None:
            return None

    # The shared app engine is reused by the rest of the session; don't
    # dispose it from inside a test.
    monkeypatch.setattr(discovery_scheduler_worker, "engine", _NoDispose())


@pytest.mark.asyncio
async def test_worker_starts_reconciles_and_stops(
    heartbeat: Path, worker_boot_stubs: None, monkeypatch: pytest.MonkeyPatch, db,
):
    monkeypatch.setattr(
        discovery_scheduler_worker,
        "build_scheduler_jobstore",
        lambda url: MemoryJobStore(),
    )
    stop = asyncio.Event()
    task = asyncio.create_task(discovery_scheduler_worker.run_scheduler(stop))

    for _ in range(100):
        if heartbeat.exists():
            break
        await asyncio.sleep(0.05)
    assert heartbeat.exists(), "first reconcile never wrote the heartbeat"
    assert discovery_scheduler_service._scheduler is not None
    assert discovery_scheduler_service._scheduler.running

    stop.set()
    await asyncio.wait_for(task, timeout=5)
    assert discovery_scheduler_service._scheduler is None


@pytest.fixture
def fast_memory_worker(
    worker_boot_stubs: None, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Memory jobstore + a near-zero reconcile interval."""
    monkeypatch.setattr(
        discovery_scheduler_worker, "build_scheduler_jobstore", lambda url: MemoryJobStore(),
    )
    monkeypatch.setattr(discovery_scheduler_worker, "RECONCILE_INTERVAL_SECONDS", 0.01)


def _scripted_reconcile(monkeypatch: pytest.MonkeyPatch, script) -> list[int]:
    """Replace reconcile_source_jobs with ``script(call_number)``."""
    calls: list[int] = []

    async def _fake(db) -> SchedulerReconcileResult:
        calls.append(len(calls) + 1)
        return await script(len(calls))

    monkeypatch.setattr(discovery_scheduler_service, "reconcile_source_jobs", _fake)
    return calls


@pytest.mark.asyncio
async def test_single_reconcile_failure_recovers_without_heartbeat(
    heartbeat: Path, fast_memory_worker: None, monkeypatch: pytest.MonkeyPatch, db,
):
    stop = asyncio.Event()
    mtimes: dict[int, float] = {}

    async def script(n: int) -> SchedulerReconcileResult:
        if n == 1:
            return _OK  # boot reconcile -> heartbeat written
        mtimes[n] = heartbeat.stat().st_mtime
        if n == 2:
            os.utime(heartbeat, (1.0, 1.0))  # mark the boot heartbeat
            raise RuntimeError("db blip")
        stop.set()
        return _OK

    calls = _scripted_reconcile(monkeypatch, script)
    await asyncio.wait_for(discovery_scheduler_worker.run_scheduler(stop), timeout=5)

    assert calls == [1, 2, 3]
    assert mtimes[3] == 1.0, "a failed reconcile must not advance the heartbeat"
    assert heartbeat.stat().st_mtime > 1.0, "the recovered reconcile heartbeats again"


@pytest.mark.asyncio
async def test_repeated_reconcile_failures_exit_the_worker(
    heartbeat: Path, fast_memory_worker: None, monkeypatch: pytest.MonkeyPatch, db,
):
    async def script(n: int) -> SchedulerReconcileResult:
        if n == 1:
            return _OK
        raise RuntimeError("db down")

    calls = _scripted_reconcile(monkeypatch, script)

    with pytest.raises(SchedulerReconcileFailingError):
        await asyncio.wait_for(
            discovery_scheduler_worker.run_scheduler(asyncio.Event()), timeout=5,
        )
    assert len(calls) == 1 + discovery_scheduler_worker.MAX_CONSECUTIVE_RECONCILE_FAILURES
    assert discovery_scheduler_service._scheduler is None


def test_run_propagates_fatal_errors_so_the_process_exits_non_zero(
    monkeypatch: pytest.MonkeyPatch,
):
    async def _failing_main() -> None:
        raise SchedulerReconcileFailingError("reconcile failed 3 times in a row")

    monkeypatch.setattr(discovery_scheduler_worker, "main", _failing_main)
    with pytest.raises(SchedulerReconcileFailingError):
        discovery_scheduler_worker.run()


@pytest.mark.asyncio
async def test_main_returns_cleanly_on_sigterm(
    heartbeat: Path, fast_memory_worker: None, monkeypatch: pytest.MonkeyPatch, db,
):
    monkeypatch.setattr(discovery_scheduler_worker, "RECONCILE_INTERVAL_SECONDS", 30)
    task = asyncio.create_task(discovery_scheduler_worker.main())
    for _ in range(100):
        if heartbeat.exists():
            break
        await asyncio.sleep(0.05)
    assert heartbeat.exists()

    os.kill(os.getpid(), signal.SIGTERM)

    await asyncio.wait_for(task, timeout=5)
    assert discovery_scheduler_service._scheduler is None


@pytest.mark.asyncio
async def test_worker_boot_fails_loud_without_jobstore(
    heartbeat: Path, worker_boot_stubs: None, monkeypatch: pytest.MonkeyPatch,
):
    def _missing(url: str) -> MemoryJobStore:
        raise SchedulerJobstoreMissingError("apscheduler_jobs missing")

    monkeypatch.setattr(discovery_scheduler_worker, "build_scheduler_jobstore", _missing)

    with pytest.raises(SchedulerJobstoreMissingError):
        await discovery_scheduler_worker.run_scheduler(asyncio.Event())
    assert discovery_scheduler_service._scheduler is None
    assert not heartbeat.exists()


def test_jobstore_factory_rejects_unmigrated_database(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(scheduler_jobstore, "JOBSTORE_TABLE_NAME", "no_such_jobstore_table")
    with pytest.raises(SchedulerJobstoreMissingError, match="alembic upgrade head"):
        build_scheduler_jobstore(settings.database_url_sync)


@pytest.mark.asyncio
async def test_api_created_source_is_persisted_by_scheduler_process(
    user_factory, as_user, db,
):
    """API writes the row; the scheduler process's reconcile writes the job
    to the real Postgres jobstore."""
    user = await user_factory()
    async with await as_user(user) as a:
        resp = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "persisted"}},
        )
        assert resp.status_code == 201
        source_id = uuid.UUID(resp.json()["id"])

    sync_engine = create_engine(settings.database_url_sync)
    discovery_scheduler_service.start_scheduler(
        build_scheduler_jobstore(settings.database_url_sync),
    )
    try:
        discovery_scheduler_service._scheduler.pause()
        await discovery_scheduler_service.reconcile_source_jobs(db)
        with sync_engine.connect() as conn:
            ids = conn.execute(text("SELECT id FROM apscheduler_jobs")).scalars().all()
        assert _job_id(source_id) in ids
    finally:
        discovery_scheduler_service._scheduler.remove_all_jobs()
        discovery_scheduler_service.shutdown_scheduler()
        with sync_engine.begin() as conn:
            conn.execute(text("DELETE FROM apscheduler_jobs"))
        sync_engine.dispose()


def test_healthcheck_unhealthy_without_heartbeat(heartbeat: Path):
    assert discovery_scheduler_healthcheck.main() == 1


def test_healthcheck_healthy_with_fresh_heartbeat(heartbeat: Path):
    heartbeat.touch()
    assert discovery_scheduler_healthcheck.main() == 0


def test_healthcheck_unhealthy_with_stale_heartbeat(heartbeat: Path):
    heartbeat.touch()
    stale = time.time() - discovery_scheduler_healthcheck.HEARTBEAT_MAX_AGE_SECONDS - 5
    os.utime(heartbeat, (stale, stale))
    assert discovery_scheduler_healthcheck.main() == 1
