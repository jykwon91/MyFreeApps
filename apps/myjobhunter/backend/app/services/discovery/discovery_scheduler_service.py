"""APScheduler wiring for scheduled discovery passes (PR 5).

The shipped /discover surface is manual-refresh only — the operator
clicks Refresh per saved search. This module closes that gap by running
``fetch + embed + score`` automatically per ``DiscoverySource`` row on
the cadence stored in ``discovery_sources.fetch_interval_minutes``.

Architecture rationale
----------------------

Single-VPS, single-process FastAPI app with ~10 saved searches per user.
A full external queue (Dramatiq + Redis) would be over-engineered:

- No multi-process coordination needed today
- No cross-process retries needed today
- Job state survives restarts because we use APScheduler's
  ``SQLAlchemyJobStore`` pointed at the same Postgres the app already
  uses (no new infra surface)

The architecture-design pass on 2026-05-11 recommended in-process
APScheduler with a Postgres jobstore. This module is the realisation.

When to migrate to Dramatiq
---------------------------

Promote the discovery passes to a real queue when ANY of these are true:

1. Multi-user concurrent fetches saturate one process (asyncio lag
   exceeds 200ms p95 measured at the request layer)
2. We need cross-process retries — e.g. one worker dies mid-fetch and a
   second worker must pick it up. APScheduler's ``max_instances=1`` +
   ``coalesce=True`` handles single-process restart; not multi-worker.
3. Global scheduled-pass throughput exceeds 50/min (the per-user model
   doesn't scale linearly because each pass holds a DB connection + an
   adapter HTTP call + an Anthropic call)
4. Job latency or jitter matters for the user (APScheduler is
   best-effort, not real-time)

Until any of those trip, in-process APScheduler is the right shape.

Monorepo parity note
--------------------

APScheduler is currently MJH-only. When MyBookkeeper adds its first
scheduled job (e.g. monthly rent reminders, weekly statement parsing
cron, periodic backup verification), promote this scheduler factory to
``platform_shared.core.scheduler`` per
``rules/monorepo-parity-discipline.md`` (auto-promote rule). The shape
of ``start_scheduler`` + ``register_*_jobs`` + ``add_*_job`` is generic
enough to host MBK's future cron registrations alongside MJH's discovery
passes.

Lifecycle
---------

- ``start_scheduler(settings)`` — initializes the AsyncIOScheduler with a
  SQLAlchemyJobStore pointed at the app's Postgres. Called from
  the FastAPI lifespan startup hook AFTER the fetch reaper has cleared
  stale running rows.
- ``register_source_jobs(db)`` — scans ``discovery_sources WHERE
  is_active=true`` and adds one IntervalTrigger job per source.
  Idempotent (uses ``replace_existing=True``) so a deploy that restarts
  the process re-establishes the schedule cleanly.
- ``add_source_job`` / ``update_source_job`` / ``remove_source_job`` —
  called from ``discovery_source_service`` on create / update / delete
  so the in-memory schedule stays in sync with the DB.
- ``shutdown_scheduler()`` — graceful shutdown from the lifespan
  teardown.

Failure mode posture
--------------------

Per ``rules/no-bandaid-solutions.md``: if APScheduler cannot initialize
its jobstore (e.g. Postgres unreachable, schema missing), the lifespan
startup must FAIL LOUDLY. We do NOT catch + ignore a startup failure.
A backend that booted with no scheduler is silently degraded — the
operator would never know automatic refresh stopped working.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.discovery.discovery_source import DiscoverySource
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


# Module-level scheduler reference. Populated by ``start_scheduler``,
# consumed by ``add_source_job`` / ``update_source_job`` /
# ``remove_source_job`` / ``register_source_jobs`` / ``shutdown_scheduler``.
# Kept as a module global instead of threaded through the dependency
# graph because the scheduler is a process-wide singleton — there is no
# legitimate use case for two AsyncIOScheduler instances in one process.
_scheduler: AsyncIOScheduler | None = None


class SchedulerNotStartedError(RuntimeError):
    """Raised when a CRUD helper is called before ``start_scheduler``."""


class SchedulerSourceMismatchError(RuntimeError):
    """Raised when a scheduled job's payload doesn't match the DB row.

    Defensive assertion — catches scheduler-state bugs (e.g. a stale
    job left over from a previous deploy referencing a deleted source)
    BEFORE they can leak data cross-tenant.
    """


def _job_id(source_id: uuid.UUID) -> str:
    """Stable job id derived from the source id.

    APScheduler uses string ids; using ``str(source_id)`` directly is
    fine but a prefix makes the jobs easy to grep in the ``apscheduler_jobs``
    table when an operator is debugging.
    """
    return f"discovery:source:{source_id}"


def start_scheduler(settings: Any) -> AsyncIOScheduler:
    """Initialize the module-level AsyncIOScheduler.

    The SQLAlchemyJobStore writes jobs to the same Postgres the app uses
    (no separate DB / Redis). Job table name ``apscheduler_jobs`` is
    auto-created on first run.

    ``settings`` must expose ``database_url_sync`` — APScheduler's
    SQLAlchemyJobStore wraps a synchronous SQLAlchemy Engine (it doesn't
    know about asyncio). ``database_url_sync`` is the same DSN as
    ``database_url`` minus the ``+asyncpg`` driver fragment, so both
    layers talk to the same Postgres instance.

    Idempotent: if already started (e.g. a unit test calls this twice),
    returns the existing scheduler.

    Raises:
        Any APScheduler / SQLAlchemy startup error. The caller (lifespan)
        does NOT swallow these — failure to start the scheduler must
        fail the lifespan loudly per ``rules/no-bandaid-solutions.md``.
    """
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        return _scheduler

    jobstore = SQLAlchemyJobStore(
        url=settings.database_url_sync,
        tablename="apscheduler_jobs",
    )
    _scheduler = AsyncIOScheduler(
        jobstores={"default": jobstore},
        # UTC throughout so jobs fire on the same instant regardless of
        # the host's local timezone. Matches the rest of MJH which uses
        # ``datetime.now(timezone.utc)`` for every datetime column.
        timezone="UTC",
    )
    _scheduler.start()
    logger.info("discovery_scheduler_service: scheduler started")
    return _scheduler


def shutdown_scheduler() -> None:
    """Stop the scheduler. Idempotent; safe to call multiple times.

    Called from the FastAPI lifespan shutdown hook. ``wait=False`` so a
    long-running scheduled job doesn't block the process from exiting —
    the job will be picked up again on next start because the jobstore
    is persistent.
    """
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("discovery_scheduler_service: scheduler shut down")
    _scheduler = None


def _require_scheduler() -> AsyncIOScheduler:
    if _scheduler is None or not _scheduler.running:
        raise SchedulerNotStartedError(
            "discovery_scheduler_service: scheduler not started — "
            "call start_scheduler() from the FastAPI lifespan first",
        )
    return _scheduler


def add_source_job(
    source_id: uuid.UUID,
    user_id: uuid.UUID,
    interval_minutes: int,
) -> None:
    """Register / replace a scheduled fetch for one DiscoverySource.

    Idempotent — ``replace_existing=True`` so create-then-update or
    process-restart-after-create both end up with one job per source.

    ``misfire_grace_time=900`` — if the scheduler is delayed by up to
    15 minutes (e.g. a long fetch held the event loop, a deploy paused
    execution), still run the job. Beyond that, skip the missed run and
    wait for the next interval. ``coalesce=True`` collapses multiple
    missed runs into one — we never want to backfill 12h of fetches
    in a row after the process was down for 12h.

    ``max_instances=1`` — never run two passes for the same source
    concurrently. Prevents duplicate JSearch quota burn and DB
    contention if a previous pass took longer than its interval.
    """
    scheduler = _require_scheduler()
    scheduler.add_job(
        _run_scheduled_fetch,
        trigger=IntervalTrigger(minutes=interval_minutes),
        id=_job_id(source_id),
        kwargs={"source_id": source_id, "user_id": user_id},
        replace_existing=True,
        coalesce=True,
        misfire_grace_time=900,
        max_instances=1,
        name=f"discovery_fetch:{source_id}",
    )
    logger.info(
        "discovery_scheduler_service: added/updated job source=%s interval=%dm",
        source_id, interval_minutes,
    )


def update_source_job(
    source_id: uuid.UUID,
    user_id: uuid.UUID,
    interval_minutes: int,
) -> None:
    """Adjust an existing source's interval. Re-registers from scratch.

    APScheduler exposes ``reschedule_job`` for trigger-only edits, but
    re-adding with ``replace_existing=True`` is simpler and covers the
    cases where the user_id payload also needs to refresh (e.g. ownership
    changes — never happens today but a possible future).
    """
    add_source_job(source_id, user_id, interval_minutes)


def remove_source_job(source_id: uuid.UUID) -> None:
    """Cancel the scheduled fetch for a source. Idempotent.

    Called when a source is deleted or deactivated. If the job is
    already gone (e.g. the source was deactivated before the scheduler
    was ever started — unlikely but defensible), this is a no-op.
    """
    scheduler = _require_scheduler()
    job_id = _job_id(source_id)
    job = scheduler.get_job(job_id)
    if job is not None:
        scheduler.remove_job(job_id)
        logger.info(
            "discovery_scheduler_service: removed job source=%s", source_id,
        )


async def register_source_jobs(db: AsyncSession) -> int:
    """Sweep the DB and register a job per active DiscoverySource.

    Called from lifespan startup so a fresh process picks up the
    schedule from the DB. Returns the count of jobs registered so the
    caller can log it.

    Idempotent: each ``add_source_job`` call uses ``replace_existing=True``
    so re-running this on a process that already has jobs registered is
    safe.
    """
    stmt = select(DiscoverySource).where(DiscoverySource.is_active.is_(True))
    result = await db.execute(stmt)
    sources = list(result.scalars().all())

    for src in sources:
        add_source_job(
            source_id=src.id,
            user_id=src.user_id,
            interval_minutes=src.fetch_interval_minutes,
        )

    logger.info(
        "discovery_scheduler_service: registered %d scheduled fetch job(s) on startup",
        len(sources),
    )
    return len(sources)


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
        src = await db.get(DiscoverySource, source_id)
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
