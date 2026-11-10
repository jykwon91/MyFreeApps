"""When a job's first run should be after the scheduler process (re)starts."""
from __future__ import annotations

from datetime import datetime, timedelta


def resume_next_run(last_reported: datetime | None, now: datetime, interval: timedelta) -> datetime:
    """The job's first run time in a freshly started scheduler.

    Jobs live in memory, so a restart (every deploy) re-registers them. Starting
    each one a full interval out would mean a daily job never runs when the app
    deploys more than once a day. Instead each job resumes the cadence the last
    scheduler reported (``scheduler_job.next_run_at``):

    * never reported (first boot, or the job was just switched on) -> now;
    * that time already passed (it was missed while down) -> now, once;
    * otherwise that time, capped at one interval from now (the interval may
      have been shortened since).
    """
    if last_reported is None or last_reported <= now:
        return now
    return min(last_reported, now + interval)
