"""
Run with: python -m app.workers.scheduler
Polls Gmail and Plaid for all connected integrations every N minutes.
"""
import asyncio
import logging
import time

from app.core.config import settings
from app.db.session import AsyncSessionLocal, unit_of_work
from app.repositories import integration_repo, plaid_repo
from app.services.integrations.plaid_sync_service import sync_plaid_item
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


async def run_sync_cycle() -> None:
    """Run one full sync cycle for all integration types."""
    gmail_user_ids = await get_gmail_user_ids()
    for user_id in gmail_user_ids:
        logger.info("Running Gmail sync for user %s", user_id)
        await sync_gmail_for_user(user_id)

    await sync_all_plaid_items()


def run() -> None:
    interval = settings.gmail_poll_interval_minutes * 60
    logger.info("Scheduler started — polling every %d minutes", settings.gmail_poll_interval_minutes)
    while True:
        asyncio.run(run_sync_cycle())
        time.sleep(interval)


if __name__ == "__main__":
    run()
