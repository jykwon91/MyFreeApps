"""The API's side of the ``scheduler_job`` table — status and on-demand runs.

The scheduler runs in its own process; the API only reads what it reports
and writes run requests it picks up on its next tick
(``TICK_INTERVAL_SECONDS``). It counts as running while its last report is
younger than ``HEARTBEAT_MAX_AGE_SECONDS`` — the same staleness its container
healthcheck uses.

A run request for a job that is running already waits for that run to
finish; any number of requests before a tick are one run.

Known gap: a deploy that switches a job off leaves the old scheduler's row
for it in place until the new scheduler's first tick (seconds). A trigger
accepted in that window is answered 200 and then dropped, with a warning in
the scheduler's log. Closing it would need the API to wait for the new
scheduler's first report, which it cannot tell apart from the old one's.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.core.scheduler_constants import HEARTBEAT_MAX_AGE_SECONDS
from app.db.session import unit_of_work
from app.repositories.system import scheduler_job_repo
from app.schemas.system.scheduler_job_status import SchedulerJobStatus
from app.schemas.system.scheduler_status_response import SchedulerStatusResponse
from app.services.scheduling.job_not_scheduled_error import JobNotScheduledError
from app.services.scheduling.scheduler_not_running_error import SchedulerNotRunningError

_MAX_REPORT_AGE = timedelta(seconds=HEARTBEAT_MAX_AGE_SECONDS)


def _is_fresh(reported_at: datetime | None, now: datetime) -> bool:
    return reported_at is not None and now - reported_at <= _MAX_REPORT_AGE


async def get_status(*, now: datetime | None = None) -> SchedulerStatusResponse:
    at = now or datetime.now(timezone.utc)
    async with unit_of_work() as db:
        if not _is_fresh(await scheduler_job_repo.latest_report_at(db), at):
            return SchedulerStatusResponse(running=False, jobs=[])
        rows = await scheduler_job_repo.list_all(db)
    return SchedulerStatusResponse(
        running=True,
        jobs=[
            SchedulerJobStatus(
                id=row.job_id,
                name=row.job_id,
                next_run_at=row.next_run_at.isoformat() if row.next_run_at else None,
                trigger=row.trigger,
            )
            for row in rows
        ],
    )


async def request_run(job_id: str, *, now: datetime | None = None) -> None:
    """Ask the scheduler to start ``job_id`` on its next tick.

    Raises SchedulerNotRunningError when the scheduler isn't reporting in,
    JobNotScheduledError when it doesn't register ``job_id``.
    """
    at = now or datetime.now(timezone.utc)
    async with unit_of_work() as db:
        if not _is_fresh(await scheduler_job_repo.latest_report_at(db), at):
            raise SchedulerNotRunningError("the scheduler service is not reporting in")
        if not await scheduler_job_repo.request_run(db, job_id, at):
            raise JobNotScheduledError(job_id)
