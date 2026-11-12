"""The scheduler process (``app/workers/scheduler_worker.py``).

- boots, registers the jobs its switches enable, heartbeats, stops cleanly
- resumes each job's cadence from the last report in ``scheduler_job``
- a run asked for while the job is running starts after it, schedule unmoved
- reports every job one last time before it stops (a failure is only logged)
- boot fails loud: Blizzard guard, Discord guard, unmigrated / unreachable DB
- one failed tick recovers in place; repeated failures exit the process
- SIGTERM via ``main()`` returns cleanly; ``run()`` propagates fatal errors
- the container healthcheck reads the heartbeat
"""
from __future__ import annotations

import asyncio
import logging
import os
import signal
import time
from collections.abc import Awaitable, Callable, Iterator
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from platform_shared.workers.worker_tick_failing_error import WorkerTickFailingError

from app.core.blizzard_prices_not_configured_error import BlizzardPricesNotConfiguredError
from app.core.config import settings
from app.core.scheduler_constants import (
    JOB_CLEANUP_DOWNLOADS,
    JOB_PURGE_CHARACTER_METRICS,
    JOB_REFRESH_GUILD_ROSTERS,
    JOB_PURGE_FEATURE_SUBMISSIONS,
    JOB_PURGE_SERVER_STATUS,
    JOB_RECORD_SERVER_STATUS,
    JOB_REFRESH_WOW_PRICES,
    JOB_SYNC_ALL_SOURCES,
)
from app.repositories.system import scheduler_job_repo
from app.services.scheduling import scheduled_jobs, scheduler_service, scheduler_sync_service
from app.workers import scheduler_healthcheck, scheduler_worker

_JOB_BODIES = (
    "run_sync_all_sources",
    "run_raid_notifications",
    "run_refresh_wow_prices",
    "run_record_server_status",
    "run_purge_server_status_history",
    "run_purge_character_metrics",
    "run_refresh_guild_rosters",
    "run_purge_feature_submissions",
    "run_cleanup_downloads",
)


class _NoDispose:
    async def dispose(self) -> None:
        return None


@pytest.fixture
def heartbeat(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "heartbeat"
    monkeypatch.setattr(scheduler_worker, "HEARTBEAT_PATH", path)
    monkeypatch.setattr(scheduler_healthcheck, "HEARTBEAT_PATH", path)
    return path


@pytest.fixture
def worker(
    heartbeat: Path, bound_unit_of_work: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> Iterator[dict[str, AsyncMock]]:
    """A worker on the test DB with recorded job bodies and a fast tick."""
    bodies = {name: AsyncMock(return_value=None) for name in _JOB_BODIES}
    for name, body in bodies.items():
        monkeypatch.setattr(scheduled_jobs, name, body)
    # The shared app engine is reused by the rest of the session.
    monkeypatch.setattr(scheduler_worker, "engine", _NoDispose())
    monkeypatch.setattr(scheduler_worker, "TICK_INTERVAL_SECONDS", 0.01)
    monkeypatch.setattr(settings, "environment", "development")
    monkeypatch.setattr(settings, "discord_enabled", False)
    monkeypatch.setattr(settings, "scheduler_enabled", True)
    monkeypatch.setattr(settings, "wow_price_refresh_enabled", True)
    monkeypatch.setattr(settings, "wow_server_status_recording_enabled", True)
    scheduler_service.shutdown_scheduler()
    yield bodies
    scheduler_service.shutdown_scheduler()


async def _wait_for(condition: Callable[[], bool], timeout: float = 5.0) -> None:
    deadline = time.monotonic() + timeout
    while not condition():
        assert time.monotonic() < deadline, "condition never became true"
        await asyncio.sleep(0.01)


def _scripted_ticks(monkeypatch: pytest.MonkeyPatch, script: Callable[[int], Awaitable[None]]) -> list[int]:
    """Replace sync_with_db with ``script(call_number)``."""
    calls: list[int] = []

    async def _fake() -> list[str]:
        calls.append(len(calls) + 1)
        await script(len(calls))
        return []

    monkeypatch.setattr(scheduler_sync_service, "sync_with_db", _fake)
    return calls


# ---------------------------------------------------------------------------
# Boot, jobs, stop
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_worker_boots_registers_jobs_reports_and_stops(
    worker: dict[str, AsyncMock], heartbeat: Path,
) -> None:
    stop = asyncio.Event()
    task = asyncio.create_task(scheduler_worker.run_scheduler(stop))
    await _wait_for(heartbeat.exists)

    scheduler = scheduler_service._scheduler
    assert scheduler is not None
    assert scheduler.running
    assert {j.id for j in scheduler.get_jobs()} == {
        JOB_PURGE_FEATURE_SUBMISSIONS, JOB_PURGE_SERVER_STATUS, JOB_PURGE_CHARACTER_METRICS, JOB_REFRESH_GUILD_ROSTERS,
        JOB_SYNC_ALL_SOURCES,
        JOB_CLEANUP_DOWNLOADS, JOB_REFRESH_WOW_PRICES, JOB_RECORD_SERVER_STATUS,
    }
    # First boot: every job runs once now.
    await _wait_for(lambda: all(body.await_count for name, body in worker.items() if name != "run_raid_notifications"))
    worker["run_raid_notifications"].assert_not_awaited()

    await asyncio.sleep(0.05)  # a tick after the boot runs reports every job
    assert set(await scheduler_sync_service.load_resume_times()) == {j.id for j in scheduler.get_jobs()}

    stop.set()
    await asyncio.wait_for(task, timeout=5)
    assert scheduler_service._scheduler is None


@pytest.mark.asyncio
async def test_switches_and_discord_choose_the_jobs(
    worker: dict[str, AsyncMock], heartbeat: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "scheduler_enabled", False)  # serve-only prod
    monkeypatch.setattr(settings, "wow_server_status_recording_enabled", False)
    monkeypatch.setattr(settings, "discord_enabled", True)
    monkeypatch.setattr(scheduler_worker, "start_discord", lambda: None)
    stop = asyncio.Event()
    task = asyncio.create_task(scheduler_worker.run_scheduler(stop))
    await _wait_for(heartbeat.exists)

    scheduler = scheduler_service._scheduler
    assert scheduler is not None
    assert {j.id for j in scheduler.get_jobs()} == {
        JOB_PURGE_FEATURE_SUBMISSIONS, JOB_PURGE_SERVER_STATUS, JOB_PURGE_CHARACTER_METRICS, JOB_REFRESH_GUILD_ROSTERS,
        JOB_REFRESH_WOW_PRICES,
    }
    stop.set()
    await asyncio.wait_for(task, timeout=5)


@pytest.mark.asyncio
async def test_raid_notifications_run_from_the_worker_when_discord_is_on(
    worker: dict[str, AsyncMock], heartbeat: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "discord_enabled", True)
    monkeypatch.setattr(scheduler_worker, "start_discord", lambda: None)
    stop = asyncio.Event()
    task = asyncio.create_task(scheduler_worker.run_scheduler(stop))
    await _wait_for(lambda: worker["run_raid_notifications"].await_count > 0)
    stop.set()
    await asyncio.wait_for(task, timeout=5)


@pytest.mark.asyncio
async def test_a_restart_resumes_the_reported_cadence(
    worker: dict[str, AsyncMock], heartbeat: Path,
) -> None:
    # First process: reports every job's next run.
    stop = asyncio.Event()
    task = asyncio.create_task(scheduler_worker.run_scheduler(stop))
    await _wait_for(heartbeat.exists)
    await _wait_for(lambda: worker["run_purge_feature_submissions"].await_count == 1)
    await asyncio.sleep(0.05)  # a tick after the boot runs reports their next runs
    stop.set()
    await asyncio.wait_for(task, timeout=5)

    reported = await scheduler_sync_service.load_resume_times()
    assert reported[JOB_PURGE_FEATURE_SUBMISSIONS] - datetime.now(timezone.utc) > timedelta(hours=23)

    # Second process (a deploy): the daily purge is NOT run again at boot.
    stop = asyncio.Event()
    task = asyncio.create_task(scheduler_worker.run_scheduler(stop))
    await _wait_for(lambda: scheduler_service._scheduler is not None)
    scheduler = scheduler_service._scheduler
    assert scheduler is not None
    job = scheduler.get_job(JOB_PURGE_FEATURE_SUBMISSIONS)
    assert job is not None
    assert abs(job.next_run_time - reported[JOB_PURGE_FEATURE_SUBMISSIONS]) < timedelta(seconds=1)
    await asyncio.sleep(0.05)
    assert worker["run_purge_feature_submissions"].await_count == 1
    stop.set()
    await asyncio.wait_for(task, timeout=5)


@pytest.mark.asyncio
async def test_a_trigger_while_the_job_runs_starts_it_after_without_moving_its_schedule(
    worker: dict[str, AsyncMock], heartbeat: Path, bound_unit_of_work: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = bound_unit_of_work
    release = asyncio.Event()

    async def slow_refresh() -> None:
        await release.wait()

    worker["run_refresh_wow_prices"].side_effect = slow_refresh
    real_sync = scheduler_sync_service.sync_with_db
    pending_after_tick: list[bool] = []
    next_runs: list[datetime] = []

    # The checks run inside the tick, so they never share the session with it.
    async def sync_then_look() -> list[str]:
        started = await real_sync()
        prices_running = JOB_REFRESH_WOW_PRICES in scheduler_service.running_job_ids()
        if prices_running and not next_runs:
            scheduler = scheduler_service._scheduler
            assert scheduler is not None
            job = scheduler.get_job(JOB_REFRESH_WOW_PRICES)
            assert job is not None
            next_runs.append(job.next_run_time)
            await scheduler_job_repo.request_run(db, JOB_REFRESH_WOW_PRICES, datetime.now(timezone.utc))
        elif next_runs:
            db.expire_all()
            row = {r.job_id: r for r in await scheduler_job_repo.list_all(db)}[JOB_REFRESH_WOW_PRICES]
            pending_after_tick.append(row.run_requested_at is not None)
        return started

    monkeypatch.setattr(scheduler_sync_service, "sync_with_db", sync_then_look)
    stop = asyncio.Event()
    task = asyncio.create_task(scheduler_worker.run_scheduler(stop))
    await _wait_for(lambda: len(pending_after_tick) >= 5)

    assert all(pending_after_tick), "the request waits while the job runs"
    scheduler = scheduler_service._scheduler
    assert scheduler is not None
    job = scheduler.get_job(JOB_REFRESH_WOW_PRICES)
    assert job is not None
    assert job.next_run_time == next_runs[0], "the schedule did not move"
    assert worker["run_refresh_wow_prices"].await_count == 1

    release.set()  # the boot run finishes; the requested run starts next
    await _wait_for(lambda: worker["run_refresh_wow_prices"].await_count == 2)
    await _wait_for(lambda: not pending_after_tick[-1])
    stop.set()
    await asyncio.wait_for(task, timeout=5)
    assert worker["run_refresh_wow_prices"].await_count == 2


@pytest.mark.asyncio
async def test_the_worker_reports_every_job_once_more_before_stopping(
    worker: dict[str, AsyncMock], heartbeat: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    stop = asyncio.Event()

    async def script(n: int) -> None:
        if n == 2:
            stop.set()

    _scripted_ticks(monkeypatch, script)  # ticks report nothing
    reports = AsyncMock(return_value=None)
    monkeypatch.setattr(scheduler_sync_service, "write_snapshot", reports)
    await asyncio.wait_for(scheduler_worker.run_scheduler(stop), timeout=5)
    reports.assert_awaited_once()
    assert scheduler_service._scheduler is None


@pytest.mark.asyncio
async def test_a_failed_final_report_is_logged_and_the_worker_still_stops(
    worker: dict[str, AsyncMock], heartbeat: Path, monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    stop = asyncio.Event()

    async def script(n: int) -> None:
        stop.set()

    _scripted_ticks(monkeypatch, script)
    monkeypatch.setattr(
        scheduler_sync_service, "write_snapshot", AsyncMock(side_effect=RuntimeError("db gone")),
    )
    with caplog.at_level(logging.ERROR, logger=scheduler_worker.logger.name):
        await asyncio.wait_for(scheduler_worker.run_scheduler(stop), timeout=5)
    assert "final report failed" in caplog.text
    assert scheduler_service._scheduler is None


# ---------------------------------------------------------------------------
# Fail loud at boot
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_boot_fails_loud_without_blizzard_credentials_in_production(
    worker: dict[str, AsyncMock], heartbeat: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setattr(settings, "blizzard_client_id", "")
    with pytest.raises(BlizzardPricesNotConfiguredError):
        await scheduler_worker.run_scheduler(asyncio.Event())
    assert scheduler_service._scheduler is None
    assert not heartbeat.exists()


@pytest.mark.asyncio
async def test_boot_fails_loud_when_the_database_is_unusable(
    worker: dict[str, AsyncMock], heartbeat: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _unmigrated() -> dict[str, datetime]:
        raise RuntimeError('relation "scheduler_job" does not exist')

    monkeypatch.setattr(scheduler_sync_service, "load_resume_times", _unmigrated)
    with pytest.raises(RuntimeError, match="scheduler_job"):
        await scheduler_worker.run_scheduler(asyncio.Event())
    assert scheduler_service._scheduler is None
    assert not heartbeat.exists()


@pytest.mark.asyncio
async def test_a_failing_first_tick_fails_the_boot(
    worker: dict[str, AsyncMock], heartbeat: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def script(n: int) -> None:
        raise RuntimeError("db down")

    _scripted_ticks(monkeypatch, script)
    with pytest.raises(RuntimeError, match="db down"):
        await scheduler_worker.run_scheduler(asyncio.Event())
    assert scheduler_service._scheduler is None
    assert not heartbeat.exists()


# ---------------------------------------------------------------------------
# Tick failures
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_one_failed_tick_recovers_without_a_heartbeat(
    worker: dict[str, AsyncMock], heartbeat: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    stop = asyncio.Event()
    mtimes: dict[int, float] = {}

    async def script(n: int) -> None:
        if n == 1:
            return  # boot tick -> heartbeat written
        mtimes[n] = heartbeat.stat().st_mtime
        if n == 2:
            os.utime(heartbeat, (1.0, 1.0))  # mark the boot heartbeat
            raise RuntimeError("db blip")
        stop.set()

    calls = _scripted_ticks(monkeypatch, script)
    await asyncio.wait_for(scheduler_worker.run_scheduler(stop), timeout=5)

    assert calls == [1, 2, 3]
    assert mtimes[3] == 1.0, "a failed tick must not advance the heartbeat"
    assert heartbeat.stat().st_mtime > 1.0, "the recovered tick heartbeats again"


@pytest.mark.asyncio
async def test_repeated_tick_failures_exit_the_worker(
    worker: dict[str, AsyncMock], heartbeat: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def script(n: int) -> None:
        if n > 1:
            raise RuntimeError("db down")

    calls = _scripted_ticks(monkeypatch, script)
    with pytest.raises(WorkerTickFailingError):
        await asyncio.wait_for(scheduler_worker.run_scheduler(asyncio.Event()), timeout=5)
    assert len(calls) == 1 + scheduler_worker.MAX_CONSECUTIVE_TICK_FAILURES
    assert scheduler_service._scheduler is None


def test_run_propagates_fatal_errors_so_the_process_exits_non_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _failing_main() -> None:
        raise WorkerTickFailingError("scheduler tick failed 3 times in a row")

    monkeypatch.setattr(scheduler_worker, "main", _failing_main)
    with pytest.raises(WorkerTickFailingError):
        scheduler_worker.run()


@pytest.mark.asyncio
async def test_main_returns_cleanly_on_sigterm(
    worker: dict[str, AsyncMock], heartbeat: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(scheduler_worker, "TICK_INTERVAL_SECONDS", 30)
    task = asyncio.create_task(scheduler_worker.main())
    await _wait_for(heartbeat.exists)

    os.kill(os.getpid(), signal.SIGTERM)

    await asyncio.wait_for(task, timeout=5)
    assert scheduler_service._scheduler is None


# ---------------------------------------------------------------------------
# Healthcheck
# ---------------------------------------------------------------------------

def test_healthcheck_unhealthy_without_heartbeat(heartbeat: Path) -> None:
    assert scheduler_healthcheck.main() == 1


def test_healthcheck_healthy_with_fresh_heartbeat(heartbeat: Path) -> None:
    heartbeat.touch()
    assert scheduler_healthcheck.main() == 0


def test_healthcheck_unhealthy_with_stale_heartbeat(heartbeat: Path) -> None:
    heartbeat.touch()
    stale = time.time() - scheduler_healthcheck.HEARTBEAT_MAX_AGE_SECONDS - 5
    os.utime(heartbeat, (stale, stale))
    assert scheduler_healthcheck.main() == 1
