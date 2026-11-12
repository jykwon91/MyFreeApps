"""APScheduler wiring — the job registry of the scheduler process.

Only ``app/workers/scheduler_worker.py`` starts this scheduler. The API runs
``uvicorn --workers 2`` and every worker runs the lifespan, so a scheduler
started there ran every job once per worker. The API reaches the scheduler
only through the ``scheduler_job`` table (``scheduler_sync_service``).

Scheduled jobs (bodies in ``scheduled_jobs``):
  sync_all_sources  — every SOURCE_SYNC_INTERVAL_HOURS hours (default 6).
                      Syncs every active source, one at a time.
  cleanup_ingestion_downloads — every hour. Enforces the
                      INGESTION_DOWNLOAD_DIR_MAX_GB cap, oldest files first.
  raid_notifications — every 60 seconds, only when DISCORD_ENABLED=true.
                      Drains the WoW raid bot's notification outbox
                      (``app/services/wow/raid_notification_worker.py``).
  refresh_wow_prices — every WOW_PRICE_REFRESH_INTERVAL_HOURS hours (default
                      3). WoW Forever auction-house prices from Blizzard
                      (``app/services/wow/prices/``).
  purge_wow_feature_submissions — every 24 hours. WoW feature-request
                      retention (``feature_retention_service``).
  record_wow_server_status — every 5 minutes. WoW Forever server status
                      changes + hourly checkpoints (``app/services/wow/server_status/``).
  purge_wow_server_status_history — every 24 hours (rows older than 90 days).
  purge_wow_character_metrics — every 24 hours. Stored characters' daily
                      history older than 400 days (``character_store_service``).
  refresh_wow_guild_rosters — every 30 minutes. Watched WoW Forever guilds
                      whose roster is over 6 hours old: roster + every member
                      (``app/services/wow/guild/guild_roster_service.py``).

Switches: the purges and refresh_wow_guild_rosters always run (it does nothing
until someone looks up a guild member). SCHEDULER_ENABLED gates sync_all_sources,
cleanup_ingestion_downloads and raid_notifications (serve-only prod turns it
off). WOW_PRICE_REFRESH_ENABLED gates refresh_wow_prices.
WOW_SERVER_STATUS_RECORDING_ENABLED gates record_wow_server_status.

Jobs are in memory and re-registered at every start. Each job's first run
resumes the cadence the previous scheduler reported (``resume_next_run``):
now on a first boot or when a run was missed while down, else the reported
next run. ``coalesce=True`` + ``max_instances=1`` keep a late or slow job
from piling up runs.

A job still running when the process stops (every deploy) is cancelled, and
its next run was already set one interval out when it fired, so it waits a
full interval before it runs again — a long sync killed by a deploy is not
retried sooner. Trigger it by hand if that matters.

On-demand runs (``run_now``) never start a second copy of a running job:
the request stays pending until the current run finishes.
"""
from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable, Iterable, Mapping
from datetime import datetime, timedelta, timezone

from apscheduler.events import EVENT_JOB_ERROR, EVENT_JOB_EXECUTED, EVENT_JOB_SUBMITTED, JobEvent
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.core.scheduler_constants import (
    CLEANUP_DOWNLOADS_INTERVAL_HOURS,
    JOB_CLEANUP_DOWNLOADS,
    JOB_PURGE_CHARACTER_METRICS,
    JOB_PURGE_FEATURE_SUBMISSIONS,
    JOB_PURGE_SERVER_STATUS,
    JOB_RAID_NOTIFICATIONS,
    JOB_RECORD_SERVER_STATUS,
    JOB_REFRESH_GUILD_ROSTERS,
    JOB_REFRESH_WOW_PRICES,
    JOB_SYNC_ALL_SOURCES,
    RAID_NOTIFICATIONS_INTERVAL_SECONDS,
)
from app.core.wow_character import CHARACTER_METRIC_PURGE_INTERVAL_HOURS
from app.core.wow_feature_request_limits import PURGE_INTERVAL_HOURS
from app.core.wow_guild import GUILD_ROSTER_JOB_INTERVAL
from app.core.wow_server_status import PURGE_INTERVAL_HOURS as SERVER_STATUS_PURGE_INTERVAL_HOURS
from app.core.wow_server_status import RECORD_INTERVAL as SERVER_STATUS_RECORD_INTERVAL
from app.schemas.system.run_now_outcome import RunNowOutcome
from app.schemas.system.scheduled_job_snapshot import ScheduledJobSnapshot
from app.services.scheduling import scheduled_jobs
from app.services.scheduling.resume_next_run import resume_next_run
from app.services.scheduling.scheduler_not_running_error import SchedulerNotRunningError

logger = logging.getLogger(__name__)

# Module-level singleton. Populated by start_scheduler(), consumed by
# shutdown_scheduler(). There is exactly one scheduler process.
_scheduler: AsyncIOScheduler | None = None
# Ids of the jobs executing right now. Kept from APScheduler's job events:
# SUBMITTED is dispatched in the same step that counts the run against
# max_instances, EXECUTED / ERROR when it finishes. (A run cancelled at
# shutdown dispatches nothing; shutdown_scheduler() clears the set.)
_running: set[str] = set()


def _track_running(event: JobEvent) -> None:
    if event.code == EVENT_JOB_SUBMITTED:
        _running.add(event.job_id)
    else:
        _running.discard(event.job_id)


def start_scheduler(
    *,
    sync_interval_hours: int,
    price_refresh_interval_hours: int,
    source_jobs: bool,
    price_refresh: bool,
    server_status_recording: bool,
    raid_notifications: bool,
    resume_from: Mapping[str, datetime],
) -> AsyncIOScheduler:
    """Create the module-level AsyncIOScheduler, register its jobs and start it.

    The retention purges and the guild roster refresh always run. The other groups each have a switch:

    * ``source_jobs`` (``SCHEDULER_ENABLED``) — YouTube source sync and
      download cleanup, plus the Discord raid reminders when
      ``raid_notifications`` (``DISCORD_ENABLED``) is also on.
    * ``price_refresh`` (``WOW_PRICE_REFRESH_ENABLED``) — the WoW Forever
      auction-house prices (stays on in serve-only prod).
    * ``server_status_recording`` (``WOW_SERVER_STATUS_RECORDING_ENABLED``).

    ``resume_from`` is each job's last reported next run, by job id.
    Idempotent: if already started, returns the existing scheduler. APScheduler
    errors propagate — the worker's boot fails loud.
    """
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        return _scheduler

    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_listener(_track_running, EVENT_JOB_SUBMITTED | EVENT_JOB_EXECUTED | EVENT_JOB_ERROR)
    now = datetime.now(timezone.utc)

    def add(
        job_id: str,
        func: Callable[[], Awaitable[None]],
        interval: timedelta,
        misfire_grace_seconds: int,
    ) -> None:
        scheduler.add_job(
            func,
            trigger=IntervalTrigger(seconds=int(interval.total_seconds())),
            id=job_id,
            name=job_id,
            replace_existing=True,
            coalesce=True,
            misfire_grace_time=misfire_grace_seconds,
            max_instances=1,
            next_run_time=resume_next_run(resume_from.get(job_id), now, interval),
        )

    # A promise to the people who submit data, so it has no switch.
    add(JOB_PURGE_FEATURE_SUBMISSIONS, scheduled_jobs.run_purge_feature_submissions,
        timedelta(hours=PURGE_INTERVAL_HOURS), 3600)
    add(JOB_PURGE_SERVER_STATUS, scheduled_jobs.run_purge_server_status_history,
        timedelta(hours=SERVER_STATUS_PURGE_INTERVAL_HOURS), 3600)
    add(JOB_PURGE_CHARACTER_METRICS, scheduled_jobs.run_purge_character_metrics,
        timedelta(hours=CHARACTER_METRIC_PURGE_INTERVAL_HOURS), 3600)
    # Idle until someone looks up a guild member, so it has no switch either.
    add(JOB_REFRESH_GUILD_ROSTERS, scheduled_jobs.run_refresh_guild_rosters,
        GUILD_ROSTER_JOB_INTERVAL, int(GUILD_ROSTER_JOB_INTERVAL.total_seconds()))
    if source_jobs:
        add(JOB_SYNC_ALL_SOURCES, scheduled_jobs.run_sync_all_sources,
            timedelta(hours=sync_interval_hours), 3600)  # syncs are not time-critical
        add(JOB_CLEANUP_DOWNLOADS, scheduled_jobs.run_cleanup_downloads,
            timedelta(hours=CLEANUP_DOWNLOADS_INTERVAL_HOURS), 1800)
        if raid_notifications:
            add(JOB_RAID_NOTIFICATIONS, scheduled_jobs.run_raid_notifications,
                timedelta(seconds=RAID_NOTIFICATIONS_INTERVAL_SECONDS), RAID_NOTIFICATIONS_INTERVAL_SECONDS)
    if price_refresh:
        add(JOB_REFRESH_WOW_PRICES, scheduled_jobs.run_refresh_wow_prices,
            timedelta(hours=price_refresh_interval_hours), 3600)
    if server_status_recording:
        add(JOB_RECORD_SERVER_STATUS, scheduled_jobs.run_record_server_status,
            SERVER_STATUS_RECORD_INTERVAL, int(SERVER_STATUS_RECORD_INTERVAL.total_seconds()))

    scheduler.start()
    _scheduler = scheduler
    logger.info(
        "scheduler_service: started — source_jobs=%s sync_interval_hours=%d raid_notifications=%s "
        "price_refresh=%s price_refresh_interval_hours=%d server_status_recording=%s",
        source_jobs, sync_interval_hours, source_jobs and raid_notifications,
        price_refresh, price_refresh_interval_hours, server_status_recording,
    )
    return scheduler


def shutdown_scheduler() -> None:
    """Stop the scheduler. Idempotent.

    ``wait=False`` so a long-running sync doesn't block the process from
    exiting; its next run resumes from the last reported next run.
    """
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("scheduler_service: shut down")
    _scheduler = None
    _running.clear()


def _require_scheduler() -> AsyncIOScheduler:
    if _scheduler is None or not _scheduler.running:
        raise SchedulerNotRunningError("scheduler_service: scheduler not started — call start_scheduler() first")
    return _scheduler


def running_job_ids() -> frozenset[str]:
    """Ids of the jobs executing right now."""
    return frozenset(_running)


def snapshot_jobs() -> list[ScheduledJobSnapshot]:
    """Every registered job's id, trigger and next run, by job id."""
    return [
        ScheduledJobSnapshot(job_id=job.id, trigger=str(job.trigger), next_run_at=job.next_run_time)
        for job in sorted(_require_scheduler().get_jobs(), key=lambda j: j.id)
    ]


def run_now(job_ids: Iterable[str]) -> RunNowOutcome:
    """Move each idle job's next run to now.

    APScheduler wakes on the change and starts the job within a second; after
    it runs, the job goes back to its interval. A job that is running already
    is left alone (``busy``): moving it would only have APScheduler skip the
    run at max_instances=1 and push its schedule a full interval out. An id
    that isn't registered is logged and dropped.
    """
    scheduler = _require_scheduler()
    now = datetime.now(timezone.utc)
    started: list[str] = []
    busy: list[str] = []
    for job_id in job_ids:
        job = scheduler.get_job(job_id)
        if job is None:
            logger.warning("scheduler_service: run requested for unregistered job %s — dropped", job_id)
        elif job_id in _running:
            busy.append(job_id)
        else:
            job.modify(next_run_time=now)
            started.append(job_id)
    return RunNowOutcome(started=started, busy=busy)
