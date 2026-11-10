"""
Run with: python -m app.workers.scheduler_worker
Polls Gmail and channel iCal feeds for all connected integrations, sends
rent reminders, and — when this deployment is the transparency primary — runs
the platform-wide daily cost sync.

The loop wakes every ``REMINDER_TICK_MINUTES`` (hourly) to send rent reminders
— a reminder promised for "Saturday about 6pm" cannot wait for a daily cycle.
The full sync cycle keeps its own cadence, ``gmail_poll_interval_minutes``
(default 1440, i.e. once a day), and runs on whichever tick it falls due. The channel-iCal poll runs on every cycle — the
operator's per-channel feeds are tiny and the upstream channels poll us
on their own cadence regardless, so over-polling MBK side has no
amplification cost. PR 1.4 keeps it simple by piggy-backing on the
existing scheduler loop; a dedicated 15-minute timer can be split out
in a follow-up if cycle drift becomes an issue.

The transparency cost sync lives here, not in the API lifespan, because it
must run in exactly one process: the API runs one process per uvicorn worker,
while this container is a single replica. It runs on the first tick (startup
catch-up, so a fresh deploy fills the shared object) and then on the first
tick after each daily 00:15 UTC slot — i.e. within one tick of the slot. A
failed run is logged (to Sentry, via ``init_sentry``) and retried on the next
tick until one succeeds; it never stops the loop or delays the rent reminders.

Every part of a tick is isolated: each org's Gmail sync, the channel-iCal
poll, lease auto-end, the utility-plan check, the rent reminders and the cost
sync each log their own failure and never stop the parts after them — and a
tick that still raises is logged and the loop carries on. Nothing here exits
the worker on a job failure: a restart would re-run the full Gmail sync and
the cost sync (both run on the first tick), so the loop survives instead.
Ticks start every ``REMINDER_TICK_MINUTES`` measured from the previous
tick's start, so a slow tick doesn't push every later one back.

Liveness: the container healthcheck (``app.workers.scheduler_healthcheck``)
reads a heartbeat file that a background task touches for as long as the
process and its event loop are alive. It says nothing about whether jobs are
succeeding (their failures go to the logs / Sentry); it goes stale only when
the worker has died or something is blocking its event loop. That is why
document parsing and the transparency object's MinIO round trip run in
threads, and why the MinIO client's timeouts are bounded (a MinIO call made
directly on the loop can block it for at most a few minutes). The first
heartbeat is written right after Sentry init and the boot guard pass, so the
deploy's healthcheck wait fails if the worker crash-loops at boot.

SIGTERM / SIGINT end the loop once the current tick (if any) finishes. The
compose ``stop_grace_period`` (app.yaml) gives a reminders-only or cost-sync
tick time to finish; a full Gmail sync that outlasts it is killed, and its
next full cycle picks its queue back up (discovery resets email items
left mid-extraction).
"""
import asyncio
import datetime as _dt
import logging
import time

from platform_shared.core.boot_guards import check_transparency_sync_configured
from platform_shared.services.transparency.scheduler import (
    is_daily_sync_due,
    run_cost_sync_once,
)
from platform_shared.workers.entrypoint import run_until_signalled, run_worker
from platform_shared.workers.heartbeat import clear_heartbeat
from platform_shared.workers.heartbeat_beater import keep_heartbeat_fresh
from platform_shared.workers.wait_or_stop import wait_or_stop

from app.core.config import settings
from app.core.observability import init_sentry
from app.core.rent_reminder_constants import REMINDER_TICK_MINUTES
from app.core.scheduler_worker_constants import HEARTBEAT_INTERVAL_SECONDS, HEARTBEAT_PATH
from app.db.session import AsyncSessionLocal, engine, unit_of_work
from app.models.integrations.gmail_sync_target import GmailSyncTarget
from app.repositories import integration_repo
from app.repositories.leases import signed_lease_repo
from app.services.listings.channel_sync_service import poll_all as poll_all_channels
from app.services.properties import utility_plan_service
from app.services.rent import rent_reminder_dispatch_service
from app.workers.email_sync_worker import sync_gmail_connection

logger = logging.getLogger(__name__)


async def get_gmail_sync_targets() -> list[GmailSyncTarget]:
    """Gmail connections whose token is still active (not in needs_reauth state)."""
    async with AsyncSessionLocal() as db:
        return await integration_repo.list_active_gmail_sync_targets(db)


async def sync_all_channel_calendars() -> None:
    """Poll every channel_listing with a non-NULL ical_import_url.

    Errors on individual feeds are logged + recorded on the row by
    ``channel_sync_service.poll_one``; this wrapper only catches the
    catastrophic case where ``poll_all`` itself blows up (DB outage,
    etc.) — we log and move on, never crashing the scheduler.
    """
    try:
        polled = await poll_all_channels()
        if polled:
            logger.info("Polled %d channel iCal feeds", polled)
    except Exception:
        logger.exception("Channel iCal sync cycle failed")


async def auto_end_replaced_leases() -> int:
    """Transition signed/active parent leases to ``ended`` when their
    successor's ``starts_on`` has arrived.

    Returns the number of leases that were transitioned. Tenancy-agnostic
    — runs across every user. Errors on individual rows are logged but
    do not stop the cycle (one bad row should never block the rest).
    """
    now = _dt.datetime.now(_dt.timezone.utc)
    # The server stores no host time zone, so a lease hands over on the UTC date.
    today = now.date()
    transitioned = 0
    try:
        async with unit_of_work() as db:
            rows = await signed_lease_repo.list_replaced_by_successor_starting_on_or_before(
                db, cutoff=today,
            )
            for parent in rows:
                try:
                    await signed_lease_repo.update_lease(
                        db,
                        lease_id=parent.id,
                        user_id=parent.user_id,
                        organization_id=parent.organization_id,
                        fields={
                            "status": "ended",
                            "ended_at": now,
                            "updated_at": now,
                        },
                    )
                    transitioned += 1
                    logger.info(
                        "Auto-ended lease %s (successor's starts_on reached)",
                        parent.id,
                    )
                except Exception:  # noqa: BLE001
                    logger.exception(
                        "Failed to auto-end lease %s — leaving for next cycle",
                        parent.id,
                    )
    except Exception:
        logger.exception("auto_end_replaced_leases cycle failed")
    return transitioned


async def flag_expiring_utility_plans() -> int:
    """Log every current utility plan whose fixed term has lapsed or is about to.

    Read-only — it changes no rows. The dashboard card is the operator-facing
    surface; this exists so the same condition is visible server-side (journald
    / Sentry) without anyone having to open the app, which is precisely the
    failure mode a silently-lapsed rate plan exploits.

    Returns the number of plans flagged. Never raises: a failure here must not
    stop the Gmail or lease steps in the same cycle.
    """
    try:
        flagged = await utility_plan_service.sweep_plans_needing_renewal(
            today=_dt.datetime.now(_dt.timezone.utc).date(),
        )
    except Exception:
        logger.exception("flag_expiring_utility_plans cycle failed")
        return 0

    for plan in flagged:
        logger.warning(
            "Utility plan needs renewal: property=%s provider=%s service=%s "
            "term_end=%s days_remaining=%s status=%s",
            plan.property_name,
            plan.provider_name,
            plan.service_type,
            plan.term_end_date,
            plan.days_until_term_end,
            plan.renewal_status,
        )
    return len(flagged)


async def sync_all_gmail() -> None:
    """Sync every connected org's Gmail; one org's failure never skips the rest."""
    try:
        targets = await get_gmail_sync_targets()
    except Exception:  # noqa: BLE001 — the rest of the cycle must still run
        logger.exception("Listing Gmail sync targets failed — skipping Gmail this cycle")
        return
    for target in targets:
        logger.info("Running Gmail sync for org %s", target.organization_id)
        try:
            await sync_gmail_connection(target)
        except Exception:  # noqa: BLE001 — one org's mailbox must not block the others
            logger.exception("Gmail sync failed for org %s", target.organization_id)


async def run_sync_cycle() -> None:
    """Run one full sync cycle for all integration types.

    Never raises: each step logs and contains its own failure (the three
    after Gmail do so inside their own ``try``), so one failing step never
    skips the steps after it.
    """
    await sync_all_gmail()
    await sync_all_channel_calendars()
    await auto_end_replaced_leases()
    await flag_expiring_utility_plans()


async def send_due_rent_reminders() -> None:
    """Run the rent-reminder tick; a failure is logged, never raised."""
    try:
        await rent_reminder_dispatch_service.run_tick()
    except Exception:  # noqa: BLE001 — must not skip the cost sync
        logger.exception("Rent reminder tick failed")


async def run_tick(*, full_cycle: bool, transparency_sync: bool) -> bool:
    """One wake-up: rent reminders always, the full sync and the transparency
    cost sync when each is due. Returns whether the cost sync ran and succeeded.

    The cost sync goes last so a slow Anthropic call never delays the
    reminders. Every part contains its own failure, so none skips another.
    """
    if full_cycle:
        await run_sync_cycle()
    await send_due_rent_reminders()
    if not transparency_sync:
        return False
    return await run_cost_sync_once(settings)


def _now() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc)


async def tick_until_stopped(
    stop: asyncio.Event, *, full_interval_seconds: int, tick_seconds: int,
) -> None:
    """Tick now and then every ``tick_seconds`` (start to start) until ``stop`` is set.

    A tick that raises is logged and the loop carries on — the worker is
    never exited over a job failure (see the module docstring).
    """
    last_full: float | None = None
    last_transparency_sync: _dt.datetime | None = None
    while not stop.is_set():
        started = time.monotonic()
        full_cycle = last_full is None or started - last_full >= full_interval_seconds
        if full_cycle:
            last_full = started
        now = _now()
        transparency_sync = settings.transparency_primary and is_daily_sync_due(
            last_run=last_transparency_sync, now=now,
        )
        try:
            synced = await run_tick(full_cycle=full_cycle, transparency_sync=transparency_sync)
        except Exception:  # noqa: BLE001 — the scheduler must outlive any one tick
            logger.exception("Scheduler tick failed")
        else:
            # Only a successful sync counts: a failed one is retried next tick.
            if synced:
                last_transparency_sync = now
        elapsed = time.monotonic() - started
        await wait_or_stop(stop, max(0.0, tick_seconds - elapsed))


async def run_scheduler(stop: asyncio.Event) -> None:
    """Boot (fail loud), then tick with a fresh heartbeat until ``stop`` is set."""
    clear_heartbeat(HEARTBEAT_PATH)
    init_sentry()
    check_transparency_sync_configured(
        transparency_primary=settings.transparency_primary,
        minio_endpoint=settings.minio_endpoint,
        minio_access_key=settings.minio_access_key,
        minio_secret_key=settings.minio_secret_key,
        transparency_shared_bucket=settings.transparency_shared_bucket,
        environment=settings.environment,
    )
    full_interval = settings.gmail_poll_interval_minutes * 60
    tick = min(REMINDER_TICK_MINUTES * 60, full_interval)
    logger.info(
        "Scheduler started — full sync every %d minutes, reminders every %d minutes",
        settings.gmail_poll_interval_minutes, tick // 60,
    )
    try:
        async with keep_heartbeat_fresh(HEARTBEAT_PATH, interval_seconds=HEARTBEAT_INTERVAL_SECONDS):
            await tick_until_stopped(stop, full_interval_seconds=full_interval, tick_seconds=tick)
    finally:
        await engine.dispose()
        logger.info("Scheduler stopped")


async def main() -> None:
    await run_until_signalled(run_scheduler)


def run() -> None:
    run_worker(main)


if __name__ == "__main__":
    run()
