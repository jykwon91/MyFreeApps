"""resume_next_run — where each job's cadence picks up after a restart."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.services.scheduling.resume_next_run import resume_next_run

_NOW = datetime(2026, 11, 10, 12, 0, tzinfo=timezone.utc)
_DAY = timedelta(hours=24)


def test_never_reported_runs_now() -> None:
    assert resume_next_run(None, _NOW, _DAY) == _NOW


def test_missed_while_down_runs_now_once() -> None:
    assert resume_next_run(_NOW - timedelta(hours=30), _NOW, _DAY) == _NOW
    assert resume_next_run(_NOW, _NOW, _DAY) == _NOW


def test_a_future_report_keeps_the_cadence() -> None:
    reported = _NOW + timedelta(hours=7)
    assert resume_next_run(reported, _NOW, _DAY) == reported


def test_a_report_past_one_interval_is_capped() -> None:
    # The interval was shortened since that report.
    assert resume_next_run(_NOW + timedelta(hours=30), _NOW, timedelta(hours=3)) == _NOW + timedelta(hours=3)


def test_frequent_restarts_never_postpone_a_daily_job() -> None:
    # Twenty deploys a day: each restart resumes the same next run.
    due = _NOW + timedelta(hours=20)
    now = _NOW
    for _ in range(20):
        now += timedelta(hours=1)
        assert resume_next_run(due, now, _DAY) == due
