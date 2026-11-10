"""The ``scheduler_job`` table — how the API and the scheduler process talk.

- the repository: snapshot upsert + delete, run requests claimed once,
  never for a running job
- the worker side: a tick starts requested runs and reports every job; a
  request for a running job waits for the next tick; repeated requests are
  one run; a tick that fails after its claim never runs the job again
- the API side: status is "running" only while reports are fresh; a run
  request needs a running scheduler and a registered job
"""
from __future__ import annotations

from collections.abc import AsyncIterator, Iterable, Sequence
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.scheduler_constants import (
    HEARTBEAT_MAX_AGE_SECONDS,
    JOB_PURGE_FEATURE_SUBMISSIONS,
    JOB_REFRESH_WOW_PRICES,
    JOB_SYNC_ALL_SOURCES,
)
from app.repositories.system import scheduler_job_repo
from app.schemas.system.run_now_outcome import RunNowOutcome
from app.schemas.system.scheduled_job_snapshot import ScheduledJobSnapshot
from app.services.scheduling import scheduler_control_service, scheduler_service, scheduler_sync_service
from app.services.scheduling.job_not_scheduled_error import JobNotScheduledError
from app.services.scheduling.scheduler_not_running_error import SchedulerNotRunningError

_NOW = datetime(2026, 11, 10, 12, 0, tzinfo=timezone.utc)


def _snap(job_id: str, next_run_at: datetime | None = _NOW + timedelta(hours=1)) -> ScheduledJobSnapshot:
    return ScheduledJobSnapshot(job_id=job_id, trigger="interval[1:00:00]", next_run_at=next_run_at)


_SNAPSHOTS = [_snap(JOB_PURGE_FEATURE_SUBMISSIONS), _snap(JOB_REFRESH_WOW_PRICES)]


class _FakeScheduler:
    """Stands in for scheduler_service: records run_now calls; ``busy`` jobs are running."""

    def __init__(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self.calls: list[list[str]] = []
        self.running: set[str] = set()
        self.busy: set[str] = set()
        monkeypatch.setattr(scheduler_service, "snapshot_jobs", lambda: _SNAPSHOTS)
        monkeypatch.setattr(scheduler_service, "running_job_ids", lambda: frozenset(self.running))
        monkeypatch.setattr(scheduler_service, "run_now", self.run_now)

    def run_now(self, job_ids: Iterable[str]) -> RunNowOutcome:
        ids = list(job_ids)
        self.calls.append(ids)
        return RunNowOutcome(
            started=[j for j in ids if j not in self.busy], busy=[j for j in ids if j in self.busy],
        )


@pytest.fixture
def fake_scheduler(bound_unit_of_work: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> _FakeScheduler:
    return _FakeScheduler(monkeypatch)


@pytest.fixture
def transactional_unit_of_work(db: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> AsyncSession:
    """Each ``unit_of_work`` in the sync service is a SAVEPOINT: released on a
    clean exit, rolled back on an exception — so transaction boundaries show."""

    @asynccontextmanager
    async def _savepoint() -> AsyncIterator[AsyncSession]:
        async with db.begin_nested():
            yield db

    monkeypatch.setattr(scheduler_sync_service, "unit_of_work", _savepoint)
    return db


# ---------------------------------------------------------------------------
# Repository
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_snapshot_upserts_and_drops_jobs_no_longer_registered(db: AsyncSession) -> None:
    await scheduler_job_repo.replace_snapshot(db, [_snap("a"), _snap("b")], _NOW)
    later = _NOW + timedelta(seconds=15)
    await scheduler_job_repo.replace_snapshot(db, [_snap("b", _NOW + timedelta(hours=2))], later)

    rows = await scheduler_job_repo.list_all(db)
    assert [(r.job_id, r.next_run_at, r.reported_at) for r in rows] == [("b", _NOW + timedelta(hours=2), later)]
    assert await scheduler_job_repo.latest_report_at(db) == later


@pytest.mark.asyncio
async def test_next_run_times_leaves_out_paused_jobs(db: AsyncSession) -> None:
    await scheduler_job_repo.replace_snapshot(db, [_snap("a"), _snap("paused", None)], _NOW)
    assert await scheduler_job_repo.next_run_times(db) == {"a": _NOW + timedelta(hours=1)}


@pytest.mark.asyncio
async def test_a_run_request_is_claimed_exactly_once(db: AsyncSession) -> None:
    await scheduler_job_repo.replace_snapshot(db, [_snap("a"), _snap("b")], _NOW)
    assert await scheduler_job_repo.request_run(db, "b", _NOW) is True
    assert await scheduler_job_repo.request_run(db, "missing", _NOW) is False

    assert await scheduler_job_repo.claim_run_requests(db, skip=()) == ["b"]
    assert await scheduler_job_repo.claim_run_requests(db, skip=()) == []


@pytest.mark.asyncio
async def test_a_snapshot_keeps_a_pending_run_request(db: AsyncSession) -> None:
    await scheduler_job_repo.replace_snapshot(db, [_snap("a")], _NOW)
    await scheduler_job_repo.request_run(db, "a", _NOW)
    await scheduler_job_repo.replace_snapshot(db, [_snap("a")], _NOW + timedelta(seconds=15))
    assert await scheduler_job_repo.claim_run_requests(db, skip=()) == ["a"]


@pytest.mark.asyncio
async def test_a_claim_skips_running_jobs_and_keeps_their_request(db: AsyncSession) -> None:
    await scheduler_job_repo.replace_snapshot(db, [_snap("a"), _snap("b")], _NOW)
    await scheduler_job_repo.request_run(db, "a", _NOW)
    await scheduler_job_repo.request_run(db, "b", _NOW)

    assert await scheduler_job_repo.claim_run_requests(db, skip={"a"}) == ["b"]
    assert await scheduler_job_repo.claim_run_requests(db, skip=()) == ["a"]


@pytest.mark.asyncio
async def test_repeated_requests_are_claimed_as_one(db: AsyncSession) -> None:
    await scheduler_job_repo.replace_snapshot(db, [_snap("a")], _NOW)
    await scheduler_job_repo.request_run(db, "a", _NOW)
    await scheduler_job_repo.request_run(db, "a", _NOW + timedelta(seconds=3))
    assert await scheduler_job_repo.claim_run_requests(db, skip=()) == ["a"]
    assert await scheduler_job_repo.claim_run_requests(db, skip=()) == []


# ---------------------------------------------------------------------------
# Worker side
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_a_tick_starts_requested_runs_and_reports_every_job(fake_scheduler: _FakeScheduler, db: AsyncSession) -> None:
    assert await scheduler_sync_service.sync_with_db() == []
    assert {r.job_id for r in await scheduler_job_repo.list_all(db)} == {
        JOB_PURGE_FEATURE_SUBMISSIONS, JOB_REFRESH_WOW_PRICES,
    }

    await scheduler_job_repo.request_run(db, JOB_REFRESH_WOW_PRICES, _NOW)
    assert await scheduler_sync_service.sync_with_db() == [JOB_REFRESH_WOW_PRICES]
    assert fake_scheduler.calls[-1] == [JOB_REFRESH_WOW_PRICES]
    assert await scheduler_job_repo.claim_run_requests(db, skip=()) == []


@pytest.mark.asyncio
async def test_a_request_for_a_running_job_waits_for_it_to_finish(
    fake_scheduler: _FakeScheduler, db: AsyncSession,
) -> None:
    await scheduler_sync_service.sync_with_db()
    await scheduler_job_repo.request_run(db, JOB_REFRESH_WOW_PRICES, _NOW)
    fake_scheduler.running.add(JOB_REFRESH_WOW_PRICES)

    for _ in range(3):  # ticks while it runs leave the request alone
        assert await scheduler_sync_service.sync_with_db() == []
    assert fake_scheduler.calls[-1] == []

    fake_scheduler.running.clear()
    assert await scheduler_sync_service.sync_with_db() == [JOB_REFRESH_WOW_PRICES]
    assert await scheduler_sync_service.sync_with_db() == []


@pytest.mark.asyncio
async def test_a_job_that_starts_between_claim_and_run_keeps_its_request(
    fake_scheduler: _FakeScheduler, db: AsyncSession,
) -> None:
    await scheduler_sync_service.sync_with_db()
    await scheduler_job_repo.request_run(db, JOB_REFRESH_WOW_PRICES, _NOW)
    fake_scheduler.busy.add(JOB_REFRESH_WOW_PRICES)  # claimed, then found running

    assert await scheduler_sync_service.sync_with_db() == []
    fake_scheduler.busy.clear()
    assert await scheduler_sync_service.sync_with_db() == [JOB_REFRESH_WOW_PRICES]


@pytest.mark.asyncio
async def test_two_triggers_before_a_tick_are_one_run(
    fake_scheduler: _FakeScheduler, db: AsyncSession,
) -> None:
    await scheduler_sync_service.sync_with_db()
    now = datetime.now(timezone.utc)
    await scheduler_control_service.request_run(JOB_REFRESH_WOW_PRICES, now=now)
    await scheduler_control_service.request_run(JOB_REFRESH_WOW_PRICES, now=now + timedelta(seconds=1))

    assert await scheduler_sync_service.sync_with_db() == [JOB_REFRESH_WOW_PRICES]
    assert await scheduler_sync_service.sync_with_db() == []
    assert [c for c in fake_scheduler.calls if c] == [[JOB_REFRESH_WOW_PRICES]]


@pytest.mark.asyncio
async def test_a_tick_failing_after_its_claim_never_runs_the_job_twice(
    transactional_unit_of_work: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = transactional_unit_of_work
    fake = _FakeScheduler(monkeypatch)
    await scheduler_sync_service.sync_with_db()
    await scheduler_job_repo.request_run(db, JOB_REFRESH_WOW_PRICES, _NOW)

    real_replace = scheduler_job_repo.replace_snapshot
    failures = 0

    async def _replace_fails_once(
        session: AsyncSession, snapshots: Sequence[ScheduledJobSnapshot], reported_at: datetime,
    ) -> None:
        nonlocal failures
        if failures == 0:
            failures += 1
            raise RuntimeError("database went away mid-tick")
        await real_replace(session, snapshots, reported_at)

    monkeypatch.setattr(scheduler_job_repo, "replace_snapshot", _replace_fails_once)
    with pytest.raises(RuntimeError, match="mid-tick"):
        await scheduler_sync_service.sync_with_db()
    assert fake.calls[-1] == [JOB_REFRESH_WOW_PRICES]  # the job was started

    # The claim was its own transaction: the failed report didn't undo it.
    assert await scheduler_sync_service.sync_with_db() == []
    assert fake.calls[-1] == []
    assert await scheduler_job_repo.claim_run_requests(db, skip=()) == []


@pytest.mark.asyncio
async def test_resume_times_come_from_the_last_report(bound_unit_of_work: AsyncSession) -> None:
    await scheduler_job_repo.replace_snapshot(bound_unit_of_work, [_snap(JOB_SYNC_ALL_SOURCES)], _NOW)
    assert await scheduler_sync_service.load_resume_times() == {JOB_SYNC_ALL_SOURCES: _NOW + timedelta(hours=1)}


# ---------------------------------------------------------------------------
# API side
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_status_is_not_running_before_any_report(bound_unit_of_work: AsyncSession) -> None:
    status = await scheduler_control_service.get_status(now=_NOW)
    assert status.running is False
    assert status.jobs == []


@pytest.mark.asyncio
async def test_status_lists_jobs_while_reports_are_fresh(bound_unit_of_work: AsyncSession) -> None:
    await scheduler_job_repo.replace_snapshot(bound_unit_of_work, [_snap(JOB_SYNC_ALL_SOURCES)], _NOW)

    fresh = await scheduler_control_service.get_status(now=_NOW + timedelta(seconds=HEARTBEAT_MAX_AGE_SECONDS))
    assert fresh.running is True
    assert [(j.id, j.next_run_at) for j in fresh.jobs] == [
        (JOB_SYNC_ALL_SOURCES, (_NOW + timedelta(hours=1)).isoformat()),
    ]

    stale = await scheduler_control_service.get_status(now=_NOW + timedelta(seconds=HEARTBEAT_MAX_AGE_SECONDS + 1))
    assert stale.running is False
    assert stale.jobs == []


@pytest.mark.asyncio
async def test_a_run_request_needs_a_running_scheduler(bound_unit_of_work: AsyncSession) -> None:
    await scheduler_job_repo.replace_snapshot(bound_unit_of_work, [_snap(JOB_SYNC_ALL_SOURCES)], _NOW)
    with pytest.raises(SchedulerNotRunningError):
        await scheduler_control_service.request_run(JOB_SYNC_ALL_SOURCES, now=_NOW + timedelta(minutes=5))


@pytest.mark.asyncio
async def test_a_run_request_needs_a_registered_job(bound_unit_of_work: AsyncSession) -> None:
    await scheduler_job_repo.replace_snapshot(bound_unit_of_work, [_snap(JOB_SYNC_ALL_SOURCES)], _NOW)
    with pytest.raises(JobNotScheduledError):
        await scheduler_control_service.request_run(JOB_REFRESH_WOW_PRICES, now=_NOW)
    await scheduler_control_service.request_run(JOB_SYNC_ALL_SOURCES, now=_NOW)
    assert await scheduler_job_repo.claim_run_requests(bound_unit_of_work, skip=()) == [JOB_SYNC_ALL_SOURCES]
