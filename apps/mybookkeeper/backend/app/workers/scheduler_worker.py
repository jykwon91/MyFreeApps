"""
Run with: python -m app.workers.scheduler
Polls Gmail, Plaid, and channel iCal feeds for all connected integrations.

Cycle cadence is driven by ``gmail_poll_interval_minutes`` (default 1440,
i.e. once a day). The channel-iCal poll runs on every cycle — the
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
from app.db.session import AsyncSessionLocal, unit_of_work
from app.repositories import integration_repo, plaid_repo
from app.repositories.leases import signed_lease_repo
from app.services.integrations.plaid_sync_service import sync_plaid_item
from app.services.listings.channel_sync_service import poll_all as poll_all_channels
from app.workers.email_sync_worker import sync_gmail_for_user

logger = logging.getLogger(__name__)


async def get_gmail_user_ids() -> list[str]:
    """Return only user IDs whose Gmail token is still active (not in needs_reauth state)."""
    async with AsyncSessionLocal() as db:
        return await integration_repo.get_active_gmail_user_ids(db)


async def sync_all_plaid_items() -> None:
    async with unit_of_work() as db:
        items = await plaid_repo.get_active_items(db)
        for item in items:
            try:
                await sync_plaid_item(db, item, item.organization_id, item.user_id)
            except Exception:
                logger.exception("Plaid sync failed for item %s", item.plaid_item_id)


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
                        "Failed to auto-end lease %s — leaving for next cycle",
                        parent.id,
                    )
    except Exception:
        logger.exception("auto_end_replaced_leases cycle failed")
    return transitioned


async def run_sync_cycle() -> None:
    """Run one full sync cycle for all integration types."""
    gmail_user_ids = await get_gmail_user_ids()
    for user_id in gmail_user_ids:
        logger.info("Running Gmail sync for user %s", user_id)
        await sync_gmail_for_user(user_id)

    await sync_all_plaid_items()
    await sync_all_channel_calendars()
    await auto_end_replaced_leases()


def run() -> None:
    interval = settings.gmail_poll_interval_minutes * 60
    logger.info("Scheduler started — polling every %d minutes", settings.gmail_poll_interval_minutes)
    while True:
        asyncio.run(run_sync_cycle())
        time.sleep(interval)


if __name__ == "__main__":
    run()
