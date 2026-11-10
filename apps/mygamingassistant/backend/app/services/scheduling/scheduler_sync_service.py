"""The scheduler process's side of the ``scheduler_job`` table.

The API cannot see the scheduler's memory (it runs in another container), so
the scheduler process syncs with the table every tick:

1. claim the runs the API requested (``POST /scheduler/trigger/{job_id}``)
   and commit that claim on its own, so a tick failing later can never
   claim — and run — the same request again;
2. start them; a job that is running already keeps its request until the
   run finishes;
3. record every registered job's next run (``GET /scheduler/status``, and
   where the next start resumes each job's cadence), deleting the rows of
   jobs it no longer registers.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.db.session import unit_of_work
from app.repositories.system import scheduler_job_repo
from app.services.scheduling import scheduler_service

logger = logging.getLogger(__name__)


async def load_resume_times() -> dict[str, datetime]:
    """Each job's next run as the last scheduler reported it, by job id.

    Read before the scheduler starts. Raises if Postgres is unreachable or the
    ``scheduler_job`` migration has not run — the worker's boot fails loud.
    """
    async with unit_of_work() as db:
        return await scheduler_job_repo.next_run_times(db)


async def write_snapshot() -> None:
    """Record every registered job's next run, stamped now."""
    async with unit_of_work() as db:
        await scheduler_job_repo.replace_snapshot(
            db, scheduler_service.snapshot_jobs(), datetime.now(timezone.utc),
        )


async def sync_with_db() -> list[str]:
    """One tick: start the requested runs, then report every job. Returns the started ids."""
    async with unit_of_work() as db:
        requested = await scheduler_job_repo.claim_run_requests(db, skip=scheduler_service.running_job_ids())
    outcome = scheduler_service.run_now(requested)
    if outcome.started:
        logger.info("scheduler: started on request: %s", ", ".join(outcome.started))
    if outcome.busy:
        # Started between the claim and now: ask again for after this run.
        async with unit_of_work() as db:
            for job_id in outcome.busy:
                await scheduler_job_repo.request_run(db, job_id, datetime.now(timezone.utc))
    await write_snapshot()
    return outcome.started
