"""SchedulerJob repository — the scheduler process's job table.

Standalone functions like the other MGA repositories. The caller owns the
transaction; these only flush.
"""
from __future__ import annotations

from collections.abc import Collection, Sequence
from datetime import datetime

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system.scheduler_job import SchedulerJob
from app.schemas.system.scheduled_job_snapshot import ScheduledJobSnapshot


async def list_all(db: AsyncSession) -> list[SchedulerJob]:
    result = await db.execute(select(SchedulerJob).order_by(SchedulerJob.job_id))
    return list(result.scalars().all())


async def next_run_times(db: AsyncSession) -> dict[str, datetime]:
    """Each reported job's next run, by job id (paused jobs are left out)."""
    result = await db.execute(
        select(SchedulerJob.job_id, SchedulerJob.next_run_at).where(SchedulerJob.next_run_at.is_not(None))
    )
    return {job_id: next_run_at for job_id, next_run_at in result.tuples().all()}


async def latest_report_at(db: AsyncSession) -> datetime | None:
    """When the scheduler last reported in, or None if it never has."""
    result = await db.execute(select(func.max(SchedulerJob.reported_at)))
    return result.scalar_one_or_none()


async def claim_run_requests(db: AsyncSession, *, skip: Collection[str]) -> list[str]:
    """Clear every pending run request and return the job ids that had one.

    Jobs in ``skip`` (running right now) keep their request for a later tick.
    One UPDATE, so a request the API writes concurrently either lands before
    it (and is claimed now) or waits on the row lock and lands after (and is
    claimed next tick) — never lost. Any number of requests for a job before
    a tick is one row, so one run.
    """
    result = await db.execute(
        update(SchedulerJob)
        .where(SchedulerJob.run_requested_at.is_not(None), SchedulerJob.job_id.not_in(list(skip)))
        .values(run_requested_at=None)
        .returning(SchedulerJob.job_id)
    )
    return sorted(result.scalars().all())


async def request_run(db: AsyncSession, job_id: str, at: datetime) -> bool:
    """Ask the scheduler to start ``job_id``; False if it has no such job."""
    result = await db.execute(
        update(SchedulerJob)
        .where(SchedulerJob.job_id == job_id)
        .values(run_requested_at=at)
        .returning(SchedulerJob.id)
    )
    return result.scalar_one_or_none() is not None


async def replace_snapshot(
    db: AsyncSession, snapshots: Sequence[ScheduledJobSnapshot], reported_at: datetime,
) -> None:
    """Make the table list exactly ``snapshots``, keeping any pending run request."""
    for snapshot in snapshots:
        values = {
            "trigger": snapshot.trigger,
            "next_run_at": snapshot.next_run_at,
            "reported_at": reported_at,
        }
        await db.execute(
            insert(SchedulerJob)
            .values(job_id=snapshot.job_id, **values)
            .on_conflict_do_update(constraint="uq_schedulerjob_job_id", set_={**values, "updated_at": reported_at})
        )
    await db.execute(
        delete(SchedulerJob).where(SchedulerJob.job_id.not_in([s.job_id for s in snapshots]))
    )
