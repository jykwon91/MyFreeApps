"""Unit tests for scheduler_service — the scheduler process's job registry.

- each job group follows its switch; the retention purges always run
- intervals, coalesce / max_instances / misfire grace per job
- every job's first run resumes the last reported cadence (``resume_from``)
- snapshot_jobs() and run_now() for the ``scheduler_job`` channel; run_now
  never starts a second copy of a running job
- start / shutdown are idempotent

Every job body is replaced by a recorder, so a job firing during a test never
reaches the DB, Blizzard or YouTube (job bodies: test_scheduled_jobs.py).
AsyncIOScheduler.start() needs a running loop, hence the async tests.
"""
from __future__ import annotations

import asyncio
from collections.abc import Iterator
from typing import TypedDict, Unpack
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core.scheduler_constants import (
    JOB_CLEANUP_DOWNLOADS,
    JOB_PURGE_CHARACTER_METRICS,
    JOB_REFRESH_GUILD_ROSTERS,
    JOB_PURGE_FEATURE_SUBMISSIONS,
    JOB_PURGE_SERVER_STATUS,
    JOB_RAID_NOTIFICATIONS,
    JOB_RECORD_SERVER_STATUS,
    JOB_REFRESH_WOW_PRICES,
    JOB_SYNC_ALL_SOURCES,
)
from app.schemas.system.run_now_outcome import RunNowOutcome
from app.services.scheduling import scheduled_jobs, scheduler_service
from app.services.scheduling.scheduler_not_running_error import SchedulerNotRunningError
from app.services.scheduling.scheduler_service import (
    run_now,
    running_job_ids,
    shutdown_scheduler,
    snapshot_jobs,
    start_scheduler,
)

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
# The jobs with no switch.
_ALWAYS_ON = {JOB_PURGE_FEATURE_SUBMISSIONS, JOB_PURGE_SERVER_STATUS, JOB_PURGE_CHARACTER_METRICS, JOB_REFRESH_GUILD_ROSTERS}
_ALL_JOBS = _ALWAYS_ON | {
    JOB_SYNC_ALL_SOURCES, JOB_CLEANUP_DOWNLOADS, JOB_RAID_NOTIFICATIONS,
    JOB_REFRESH_WOW_PRICES, JOB_RECORD_SERVER_STATUS,
}


@pytest.fixture(autouse=True)
def fake_job_bodies(monkeypatch: pytest.MonkeyPatch) -> Iterator[dict[str, AsyncMock]]:
    bodies = {name: AsyncMock(return_value=None) for name in _JOB_BODIES}
    for name, body in bodies.items():
        monkeypatch.setattr(scheduled_jobs, name, body)
    shutdown_scheduler()
    yield bodies
    shutdown_scheduler()


class _StartOptions(TypedDict, total=False):
    sync_interval_hours: int
    price_refresh_interval_hours: int
    source_jobs: bool
    price_refresh: bool
    server_status_recording: bool
    raid_notifications: bool
    resume_from: dict[str, datetime]


def _start(**overrides: Unpack[_StartOptions]) -> AsyncIOScheduler:
    options: _StartOptions = {
        "sync_interval_hours": 6,
        "price_refresh_interval_hours": 3,
        "source_jobs": True,
        "price_refresh": True,
        "server_status_recording": True,
        "raid_notifications": False,
        "resume_from": {},
    }
    options.update(overrides)
    return start_scheduler(**options)


def _job_ids() -> set[str]:
    scheduler = scheduler_service._scheduler
    assert scheduler is not None
    return {job.id for job in scheduler.get_jobs()}


# ---------------------------------------------------------------------------
# Switches
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_every_switch_on_registers_every_job() -> None:
    _start(raid_notifications=True)
    assert _job_ids() == _ALL_JOBS


@pytest.mark.asyncio
async def test_retention_purges_run_with_every_switch_off() -> None:
    _start(source_jobs=False, price_refresh=False, server_status_recording=False, raid_notifications=True)
    assert _job_ids() == _ALWAYS_ON


@pytest.mark.asyncio
async def test_serve_only_prod_keeps_prices_and_server_status() -> None:
    # SCHEDULER_ENABLED=false must stop neither the prices nor the history.
    _start(source_jobs=False, raid_notifications=True)
    assert _job_ids() == _ALWAYS_ON | {JOB_REFRESH_WOW_PRICES, JOB_RECORD_SERVER_STATUS}


@pytest.mark.asyncio
async def test_source_jobs_run_without_the_price_refresh() -> None:
    _start(price_refresh=False, server_status_recording=False, raid_notifications=True)
    assert _job_ids() == _ALWAYS_ON | {JOB_SYNC_ALL_SOURCES, JOB_CLEANUP_DOWNLOADS, JOB_RAID_NOTIFICATIONS}


@pytest.mark.asyncio
async def test_raid_notifications_only_when_discord_is_on() -> None:
    _start(raid_notifications=False)
    assert JOB_RAID_NOTIFICATIONS not in _job_ids()


# ---------------------------------------------------------------------------
# Triggers and run policy
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("job_id", "interval", "misfire_grace"),
    [
        (JOB_SYNC_ALL_SOURCES, timedelta(hours=12), 3600),
        (JOB_CLEANUP_DOWNLOADS, timedelta(hours=1), 1800),
        (JOB_RAID_NOTIFICATIONS, timedelta(seconds=60), 60),
        (JOB_REFRESH_WOW_PRICES, timedelta(hours=5), 3600),
        (JOB_RECORD_SERVER_STATUS, timedelta(minutes=5), 300),
        (JOB_PURGE_FEATURE_SUBMISSIONS, timedelta(hours=24), 3600),
        (JOB_PURGE_SERVER_STATUS, timedelta(hours=24), 3600),
        (JOB_PURGE_CHARACTER_METRICS, timedelta(hours=24), 3600),
        (JOB_REFRESH_GUILD_ROSTERS, timedelta(minutes=30), 1800),
    ],
)
async def test_each_job_runs_on_its_interval_once_at_a_time(
    job_id: str, interval: timedelta, misfire_grace: int,
) -> None:
    scheduler = _start(sync_interval_hours=12, price_refresh_interval_hours=5, raid_notifications=True)
    job = scheduler.get_job(job_id)
    assert job is not None
    assert job.trigger.interval == interval
    assert job.max_instances == 1
    assert job.coalesce is True
    assert job.misfire_grace_time == misfire_grace


# ---------------------------------------------------------------------------
# Resume across restarts
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_first_boot_runs_every_job_now() -> None:
    before = datetime.now(timezone.utc)
    scheduler = _start(raid_notifications=True)
    for job in scheduler.get_jobs():
        assert job.next_run_time - before < timedelta(seconds=30), job.id


@pytest.mark.asyncio
async def test_restart_resumes_the_reported_next_run() -> None:
    later = datetime.now(timezone.utc) + timedelta(hours=10)
    scheduler = _start(resume_from={JOB_PURGE_FEATURE_SUBMISSIONS: later})
    job = scheduler.get_job(JOB_PURGE_FEATURE_SUBMISSIONS)
    assert job is not None
    assert abs(job.next_run_time - later) < timedelta(seconds=1)
    # A job with no report still runs now.
    other = scheduler.get_job(JOB_PURGE_SERVER_STATUS)
    assert other is not None
    assert other.next_run_time - datetime.now(timezone.utc) < timedelta(seconds=30)


@pytest.mark.asyncio
async def test_a_run_missed_while_down_runs_now() -> None:
    missed = datetime.now(timezone.utc) - timedelta(hours=2)
    job = _start(resume_from={JOB_PURGE_SERVER_STATUS: missed}).get_job(JOB_PURGE_SERVER_STATUS)
    assert job is not None
    assert job.next_run_time > missed
    assert job.next_run_time - datetime.now(timezone.utc) < timedelta(seconds=30)


@pytest.mark.asyncio
async def test_a_shortened_interval_caps_the_resumed_run() -> None:
    far = datetime.now(timezone.utc) + timedelta(hours=20)
    job = _start(price_refresh_interval_hours=3, resume_from={JOB_REFRESH_WOW_PRICES: far}).get_job(
        JOB_REFRESH_WOW_PRICES,
    )
    assert job is not None
    assert job.next_run_time - datetime.now(timezone.utc) <= timedelta(hours=3)


# ---------------------------------------------------------------------------
# snapshot_jobs / run_now
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_snapshot_lists_every_job_by_id() -> None:
    _start(source_jobs=False, price_refresh=False)
    snapshots = snapshot_jobs()
    assert [s.job_id for s in snapshots] == sorted([*_ALWAYS_ON, JOB_RECORD_SERVER_STATUS])
    for snapshot in snapshots:
        assert snapshot.trigger.startswith("interval[")
        assert snapshot.next_run_at is not None


@pytest.mark.asyncio
async def test_run_now_moves_a_registered_job_to_now() -> None:
    later = datetime.now(timezone.utc) + timedelta(hours=10)
    scheduler = _start(resume_from={JOB_REFRESH_WOW_PRICES: later})
    scheduler.pause()  # keep the job from firing and moving on mid-assert
    assert run_now([JOB_REFRESH_WOW_PRICES, "no_such_job"]) == RunNowOutcome(
        started=[JOB_REFRESH_WOW_PRICES], busy=[],
    )
    job = scheduler.get_job(JOB_REFRESH_WOW_PRICES)
    assert job is not None
    assert job.next_run_time - datetime.now(timezone.utc) < timedelta(seconds=5)


@pytest.mark.asyncio
async def test_run_now_actually_runs_the_job(fake_job_bodies: dict[str, AsyncMock]) -> None:
    later = datetime.now(timezone.utc) + timedelta(hours=10)
    _start(
        source_jobs=False, server_status_recording=False,
        resume_from={JOB_REFRESH_WOW_PRICES: later, **{p: later for p in _ALWAYS_ON}},
    )
    body = fake_job_bodies["run_refresh_wow_prices"]
    assert body.await_count == 0
    run_now([JOB_REFRESH_WOW_PRICES])
    for _ in range(100):
        if body.await_count:
            break
        await asyncio.sleep(0.02)
    assert body.await_count == 1


@pytest.mark.asyncio
async def test_run_now_leaves_a_running_job_alone(fake_job_bodies: dict[str, AsyncMock]) -> None:
    release = asyncio.Event()
    calls = 0

    async def slow_refresh() -> None:
        nonlocal calls
        calls += 1
        await release.wait()

    fake_job_bodies["run_refresh_wow_prices"].side_effect = slow_refresh
    later = datetime.now(timezone.utc) + timedelta(hours=10)
    scheduler = _start(
        source_jobs=False, server_status_recording=False,
        resume_from={p: later for p in _ALWAYS_ON},
    )
    for _ in range(100):
        if JOB_REFRESH_WOW_PRICES in running_job_ids():
            break
        await asyncio.sleep(0.02)
    assert JOB_REFRESH_WOW_PRICES in running_job_ids()
    job = scheduler.get_job(JOB_REFRESH_WOW_PRICES)
    assert job is not None
    next_run = job.next_run_time

    assert run_now([JOB_REFRESH_WOW_PRICES]) == RunNowOutcome(started=[], busy=[JOB_REFRESH_WOW_PRICES])
    job = scheduler.get_job(JOB_REFRESH_WOW_PRICES)
    assert job is not None
    assert job.next_run_time == next_run  # the schedule did not move

    release.set()
    for _ in range(100):
        if JOB_REFRESH_WOW_PRICES not in running_job_ids():
            break
        await asyncio.sleep(0.02)
    assert running_job_ids() == frozenset()
    assert calls == 1


def test_snapshot_and_run_now_need_a_started_scheduler() -> None:
    with pytest.raises(SchedulerNotRunningError, match="not started"):
        snapshot_jobs()
    with pytest.raises(SchedulerNotRunningError, match="not started"):
        run_now([JOB_SYNC_ALL_SOURCES])


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_start_is_idempotent_and_shutdown_stops_it() -> None:
    first = _start()
    assert _start() is first
    shutdown_scheduler()
    assert scheduler_service._scheduler is None
    shutdown_scheduler()  # idempotent
