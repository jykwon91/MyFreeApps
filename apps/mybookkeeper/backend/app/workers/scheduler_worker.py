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
import logging
import time

from app.core.config import settings
from app.db.session import AsyncSessionLocal, unit_of_work
from app.repositories import integration_repo, plaid_repo
from app.services.integrations.plaid_sync_service import sync_plaid_item
from app.services.listings.channel_sync_service import poll_all as poll_all_channels
from app.workers.email_sync_worker import sync_gmail_for_user

logger = logging.getLogger(__name__)


async def get_gmail_user_ids() -> list[str]:
    async with AsyncSessionLocal() as db:
        return await integration_repo.get_gmail_user_ids(db)


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


async def run_sync_cycle() -> None:
    """Run one full sync cycle for all integration types."""
    gmail_user_ids = await get_gmail_user_ids()
    for user_id in gmail_user_ids:
        logger.info("Running Gmail sync for user %s", user_id)
        await sync_gmail_for_user(user_id)

    await sync_all_plaid_items()
    await sync_all_channel_calendars()


def run() -> None:
    interval = settings.gmail_poll_interval_minutes * 60
    logger.info("Scheduler started — polling every %d minutes", settings.gmail_poll_interval_minutes)
    while True:
        asyncio.run(run_sync_cycle())
        time.sleep(interval)


if __name__ == "__main__":
    run()
