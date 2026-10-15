"""
Run with: python -m app.workers.scheduler
Polls Gmail and channel iCal feeds for all connected integrations, and sends
rent reminders.

The loop wakes every ``REMINDER_TICK_MINUTES`` (hourly) to send rent reminders
— a reminder promised for "Saturday about 6pm" cannot wait for a daily cycle.
The full sync cycle keeps its own cadence, ``gmail_poll_interval_minutes``
(default 1440, i.e. once a day), and runs on whichever tick it falls due. The channel-iCal poll runs on every cycle â€” the
operator's per-channel feeds are tiny and the upstream channels poll us
on their own cadence regardless, so over-polling MBK side has no
amplification cost. PR 1.4 keeps it simple by piggy-backing on the
existing scheduler loop; a dedicated 15-minute timer can be split out
in a follow-up if cycle drift becomes an issue.
"""
import asyncio
import datetime as _dt
import logging
import time

from app.core.config import settings
from app.core.rent_reminder_constants import REMINDER_TICK_MINUTES
from app.db.session import AsyncSessionLocal, engine, unit_of_work
from app.repositories import integration_repo
from app.repositories.leases import signed_lease_repo
from app.services.listings.channel_sync_service import poll_all as poll_all_channels
from app.services.properties import utility_plan_service
from app.services.rent import rent_reminder_dispatch_service
from app.workers.email_sync_worker import sync_gmail_for_user

logger = logging.getLogger(__name__)


async def get_gmail_user_ids() -> list[str]:
    """Return only user IDs whose Gmail token is still active (not in needs_reauth state)."""
    async with AsyncSessionLocal() as db:
        return await integration_repo.get_active_gmail_user_ids(db)


async def sync_all_channel_calendars() -> None:
    """Poll every channel_listing with a non-NULL ical_import_url.

    Errors on individual feeds are logged + recorded on the row by
    ``channel_sync_service.poll_one``; this wrapper only catches the
    catastrophic case where ``poll_all`` itself blows up (DB outage,
    etc.) â€” we log and move on, never crashing the scheduler.
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
    â€” runs across every user. Errors on individual rows are logged but
    do not stop the cycle (one bad row should never block the rest).
    """
    today = _dt.date.today()
    now = _dt.datetime.now(_dt.timezone.utc)
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
                        "Failed to auto-end lease %s â€” leaving for next cycle",
                        parent.id,
                    )
    except Exception:
        logger.exception("auto_end_replaced_leases cycle failed")
    return transitioned


async def flag_expiring_utility_plans() -> int:
    """Log every current utility plan whose fixed term has lapsed or is about to.

    Read-only â€” it changes no rows. The dashboard card is the operator-facing
    surface; this exists so the same condition is visible server-side (journald
    / Sentry) without anyone having to open the app, which is precisely the
    failure mode a silently-lapsed rate plan exploits.

    Returns the number of plans flagged. Never raises: a failure here must not
    stop the Gmail or lease steps in the same cycle.
    """
    try:
        flagged = await utility_plan_service.sweep_plans_needing_renewal()
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


async def run_sync_cycle() -> None:
    """Run one full sync cycle for all integration types."""
    gmail_user_ids = await get_gmail_user_ids()
    for user_id in gmail_user_ids:
        logger.info("Running Gmail sync for user %s", user_id)
        await sync_gmail_for_user(user_id)

    await sync_all_channel_calendars()
    await auto_end_replaced_leases()
    await flag_expiring_utility_plans()


async def run_tick(*, full_cycle: bool) -> None:
    """One wake-up: rent reminders always, the full sync when it is due.

    Each wake-up is its own ``asyncio.run``, so the engine's pooled
    connections are disposed at the end — asyncpg connections are bound to the
    event loop that opened them and cannot be reused by the next one.
    """
    try:
        if full_cycle:
            await run_sync_cycle()
        await rent_reminder_dispatch_service.run_tick()
    finally:
        await engine.dispose()


def run() -> None:
    full_interval = settings.gmail_poll_interval_minutes * 60
    tick = min(REMINDER_TICK_MINUTES * 60, full_interval)
    logger.info(
        "Scheduler started — full sync every %d minutes, reminders every %d minutes",
        settings.gmail_poll_interval_minutes, tick // 60,
    )
    last_full: float | None = None
    while True:
        started = time.monotonic()
        full_cycle = last_full is None or started - last_full >= full_interval
        if full_cycle:
            last_full = started
        try:
            asyncio.run(run_tick(full_cycle=full_cycle))
        except Exception:  # noqa: BLE001 — the scheduler must outlive any one cycle
            logger.exception("Scheduler cycle failed")
        time.sleep(tick)


if __name__ == "__main__":
    run()
