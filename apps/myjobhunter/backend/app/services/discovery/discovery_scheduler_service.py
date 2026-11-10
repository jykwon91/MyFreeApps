"""APScheduler wiring for scheduled discovery passes.

Runs ``fetch + embed + score`` automatically per ``DiscoverySource`` row on
the cadence stored in ``discovery_sources.fetch_interval_minutes``.

Process model
-------------

The scheduler runs in exactly ONE process: the ``scheduler`` compose
service (``python -m app.workers.discovery_scheduler_worker``). The API
never starts it. The API image runs ``uvicorn --workers 2``; APScheduler
3.x does not support several schedulers sharing one jobstore (each would
fire every job — duplicate JSearch calls, duplicate postings, double
Anthropic spend), and two workers racing to auto-create the jobstore table
on a fresh database crashed the API at boot.

How API edits reach the scheduler
---------------------------------

``discovery_sources`` is the desired schedule: a row with
``is_active=true`` should have exactly one interval job firing every
``fetch_interval_minutes``. The API only writes those rows (create /
PATCH / deactivate). APScheduler 3.x has no supported way for a process
that is not running the scheduler to add jobs to its store (a stopped
scheduler only queues jobs in memory, and a running jobstore is never told
about rows another process writes), so the scheduler process reconciles:
every ``RECONCILE_INTERVAL_SECONDS`` it reads the active sources and adds
missing jobs, reschedules jobs whose interval or owner changed, and removes
jobs whose source is gone or inactive. See ``reconcile_source_jobs``.

Jobs live in a ``SQLAlchemyJobStore`` on the app's Postgres (table
``apscheduler_jobs``, created by migration ``apschedjobs261110``) so each
job's ``next_run_time`` survives restarts and deploys — reconcile leaves an
unchanged job alone rather than re-adding it, which would restart its
interval from zero on every deploy.

When to migrate to a real queue
-------------------------------

Promote the discovery passes to Dramatiq (or similar) when ANY of these
are true: one scheduler process can no longer keep up (asyncio lag > 200ms
p95), cross-process retries are needed, scheduled-pass throughput exceeds
50/min, or job latency/jitter starts to matter to users.

Failure mode posture
--------------------

Per ``rules/no-bandaid-solutions.md``: if the jobstore cannot be built
(Postgres unreachable, table missing) the scheduler process crashes and the
deploy's healthcheck gate fails. Nothing here swallows a startup failure.
"""
from __future__ import annotations

import logging
import uuid
from datetime import timedelta

from apscheduler.job import Job
from apscheduler.jobstores.base import BaseJobStore
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.discovery.discovery_source import DiscoverySource
from app.repositories.discovery import discovery_schedule_repository
from app.schemas.discovery.scheduler_reconcile_result import (
    SchedulerReconcileResult,
)
from app.services.discovery import (
    discovery_embedding_service,
    discovery_fetch_service,
    discovery_score_service,
)
from app.services.discovery.discovery_fetch_service import (
    DiscoveryFetchError,
    DiscoverySourceInactiveError,
    DiscoverySourceNotFoundError,
    DiscoveryUnsupportedSourceError,
)


logger = logging.getLogger(__name__)

_JOB_ID_PREFIX = "discovery:source:"

# Process-wide singleton, populated by ``start_scheduler``. Only the
# scheduler worker process ever sets it.
_scheduler: AsyncIOScheduler | None = None


class SchedulerNotStartedError(RuntimeError):
    """Raised when a job helper is called before ``start_scheduler``."""


class SchedulerSourceMismatchError(RuntimeError):
    """Raised when a scheduled job's payload doesn't match the DB row.

    Defensive assertion — catches scheduler-state bugs (e.g. a stale
    job left over from a previous deploy referencing a reused source id)
    BEFORE they can leak data cross-tenant.
    """


def _job_id(source_id: uuid.UUID) -> str:
    """Stable, greppable job id derived from the source id."""
    return f"{_JOB_ID_PREFIX}{source_id}"


def start_scheduler(jobstore: BaseJobStore) -> AsyncIOScheduler:
    """Start the process's AsyncIOScheduler on ``jobstore``.

    Must be called from inside a running event loop, and only by the
    scheduler worker process. Idempotent within a process.

    Raises:
        Any APScheduler / SQLAlchemy startup error — never swallowed.
    """
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        return _scheduler

    _scheduler = AsyncIOScheduler(
        jobstores={"default": jobstore},
        # UTC throughout, matching every datetime column in MJH.
        timezone="UTC",
    )
    _scheduler.start()
    logger.info("discovery_scheduler_service: scheduler started")
    return _scheduler


def shutdown_scheduler() -> None:
    """Stop the scheduler. Idempotent.

    ``wait=False``: the asyncio executor cannot wait for coroutine jobs
    anyway (it cancels them). A cancelled fetch leaves its
    ``discovery_fetches`` row ``running``; the stale-fetch reaper clears it
    on the next API boot, and the job fires again on its next interval
    because the jobstore persists it.
    """
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("discovery_scheduler_service: scheduler shut down")
    _scheduler = None


def _require_scheduler() -> AsyncIOScheduler:
    if _scheduler is None or not _scheduler.running:
        raise SchedulerNotStartedError(
            "discovery_scheduler_service: scheduler not started — only the "
            "scheduler worker process (app.workers.discovery_scheduler_worker) "
            "runs it",
        )
    return _scheduler


def add_source_job(
    source_id: uuid.UUID,
    user_id: uuid.UUID,
    interval_minutes: int,
) -> None:
    """Register / replace the scheduled fetch for one DiscoverySource.

    ``replace_existing=True`` keeps one job per source; replacing a job
    (e.g. after an interval change) restarts its clock — the next run is
    ``now + new interval``. ``misfire_grace_time=None`` with
    ``coalesce=True``: a run missed while the scheduler was down (deploy,
    crash, outage at fire time) runs exactly once on recovery, however
    late, instead of being skipped until the next interval (up to a day).
    ``max_instances=1`` never runs two passes for one source at once (no
    duplicate JSearch quota burn).
    """
    scheduler = _require_scheduler()
    scheduler.add_job(
        _run_scheduled_fetch,
        trigger=IntervalTrigger(minutes=interval_minutes),
        id=_job_id(source_id),
        kwargs={"source_id": source_id, "user_id": user_id},
        replace_existing=True,
        coalesce=True,
        misfire_grace_time=None,
        max_instances=1,
        name=f"discovery_fetch:{source_id}",
    )
    logger.info(
        "discovery_scheduler_service: added/updated job source=%s interval=%dm",
        source_id, interval_minutes,
    )


def remove_source_job(source_id: uuid.UUID) -> None:
    """Cancel the scheduled fetch for a source. Idempotent."""
    scheduler = _require_scheduler()
    job_id = _job_id(source_id)
    if scheduler.get_job(job_id) is not None:
        scheduler.remove_job(job_id)
        logger.info(
            "discovery_scheduler_service: removed job source=%s", source_id,
        )


def _job_matches(job: Job, source: DiscoverySource) -> bool:
    """True when ``job`` already fires for ``source`` as configured."""
    trigger = job.trigger
    return (
        isinstance(trigger, IntervalTrigger)
        and trigger.interval == timedelta(minutes=source.fetch_interval_minutes)
        and job.kwargs.get("user_id") == source.user_id
    )


async def reconcile_source_jobs(db: AsyncSession) -> SchedulerReconcileResult:
    """Bring the jobstore in line with the active ``discovery_sources``.

    - active source with no job → add
    - active source whose job has a different interval or owner → replace
      (restarts its clock: next run is now + the new interval)
    - job whose source is gone or inactive → remove
    - matching job → left alone, so its ``next_run_time`` is kept

    Only touches jobs with the ``discovery:source:`` id prefix.
    """
    scheduler = _require_scheduler()
    sources = await discovery_schedule_repository.list_all_active_sources(db)
    desired = {_job_id(src.id): src for src in sources}
    existing = {
        job.id: job
        for job in scheduler.get_jobs()
        if job.id.startswith(_JOB_ID_PREFIX)
    }

    added = rescheduled = removed = 0
    for job_id, src in desired.items():
        job = existing.get(job_id)
        if job is not None and _job_matches(job, src):
            continue
        add_source_job(
            source_id=src.id,
            user_id=src.user_id,
            interval_minutes=src.fetch_interval_minutes,
        )
        if job is None:
            added += 1
        else:
            rescheduled += 1

    for job_id in existing.keys() - desired.keys():
        scheduler.remove_job(job_id)
        removed += 1
        logger.info("discovery_scheduler_service: removed job %s", job_id)

    return SchedulerReconcileResult(
        added=added,
        rescheduled=rescheduled,
        removed=removed,
        active_sources=len(desired),
    )


async def _run_scheduled_fetch(source_id: uuid.UUID, user_id: uuid.UUID) -> None:
    """Job function executed by APScheduler on the schedule.

    Re-loads the source from the DB rather than trusting the queue
    payload — the payload is stable but stale (e.g. the operator may
    have deactivated the source after the job was last scheduled).
    Bails out cleanly when the source is gone or deactivated.

    Tenant-isolation defensive assertion: verify ``source.user_id``
    matches the ``user_id`` from the job payload. A mismatch means
    scheduler state has drifted from DB state (e.g. a source id was
    reused — extremely unlikely with UUIDs but the assertion is cheap
    and the failure mode if it slipped through is cross-tenant data
    leakage). Treat as a hard error rather than silently downgrading.

    The fetch / embed / score chain mirrors the manual-refresh route
    handler in ``app/api/discover.py``. Errors from the fetch (transient
    JSearch outage, auth failure, etc.) are re-raised to APScheduler so
    they surface in logs + Sentry. The fetch service already increments
    ``consecutive_failures`` on the source row and logs structured
    error context (per ``rules/check-third-party-error-codes.md``).
    """
    async with AsyncSessionLocal() as db:
        src = await discovery_schedule_repository.get_source_for_scheduler(
            db, source_id,
        )
        if src is None:
            # Source was deleted between scheduling and execution. Drop
            # the job so we don't keep retrying — the source CRUD path
            # also calls ``remove_source_job`` but a race is possible.
            logger.warning(
                "discovery_scheduler_service: source %s gone; removing job",
                source_id,
            )
            try:
                remove_source_job(source_id)
            except SchedulerNotStartedError:
                # Scheduler was shut down between job dispatch and this
                # cleanup. Nothing to remove; safe to swallow.
                pass
            return

        if src.user_id != user_id:
            raise SchedulerSourceMismatchError(
                f"discovery_scheduler_service: source {source_id} belongs to "
                f"{src.user_id} but job payload says {user_id} — scheduler "
                "state has drifted from DB",
            )

        if not src.is_active:
            # Operator deactivated the source. Cancel the schedule so we
            # don't keep firing — the deactivate path also calls
            # ``remove_source_job`` but a race is possible.
            logger.info(
                "discovery_scheduler_service: source %s inactive; removing job",
                source_id,
            )
            try:
                remove_source_job(source_id)
            except SchedulerNotStartedError:
                pass
            return

        logger.info(
            "discovery_scheduler_service: running scheduled fetch source=%s user=%s",
            source_id, user_id,
        )
        try:
            result = await discovery_fetch_service.fetch_source(
                db, user_id, source_id,
            )
        except (
            DiscoverySourceNotFoundError,
            DiscoverySourceInactiveError,
            DiscoveryUnsupportedSourceError,
            DiscoveryFetchError,
        ):
            # These are surfaced + structured-logged by fetch_source;
            # re-raise so APScheduler counts the job as failed and
            # Sentry captures the traceback.
            raise

    # Embedding + scoring run in their own sessions (each opens its own
    # AsyncSessionLocal context). Mirror the route layer's chain.
    if result.get("new_count", 0) > 0:
        try:
            await discovery_embedding_service.embed_pending_for_user_background(
                user_id,
            )
        except Exception:
            # The fetch itself succeeded. Log + continue to scoring so a
            # transient embed failure doesn't block the scoring pass.
            # Exception propagates to Sentry via APScheduler's logger.
            logger.exception(
                "discovery_scheduler_service: embed failed user=%s source=%s",
                user_id, source_id,
            )
        try:
            await discovery_score_service.score_user_inbox(user_id)
        except Exception:
            logger.exception(
                "discovery_scheduler_service: score failed user=%s source=%s",
                user_id, source_id,
            )
