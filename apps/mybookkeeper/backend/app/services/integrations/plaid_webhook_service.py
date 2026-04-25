"""Plaid webhook business logic — processes verified webhook payloads."""
import logging
from typing import Any  # Plaid webhook payloads are dynamic external API data with no typed schema

from app.db.session import unit_of_work
from app.repositories.integrations import plaid_repo
from app.services.integrations.plaid_sync_service import sync_plaid_item

logger = logging.getLogger(__name__)


async def handle_plaid_webhook(body: dict[str, Any]) -> None:
    """Route a verified Plaid webhook payload to the appropriate handler."""
    webhook_type = body.get("webhook_type", "")
    webhook_code = body.get("webhook_code", "")
    item_id = body.get("item_id", "")

    logger.info(
        "Plaid webhook: type=%s code=%s",
        webhook_type[:50],
        webhook_code[:50],
    )

    if webhook_type == "TRANSACTIONS" and webhook_code in (
        "SYNC_UPDATES_AVAILABLE", "DEFAULT_UPDATE", "INITIAL_UPDATE",
    ):
        await _handle_transaction_sync(item_id)
    elif webhook_type == "ITEM" and webhook_code == "ERROR":
        error = body.get("error", {})
        await _handle_item_error(item_id, error)


async def _handle_transaction_sync(plaid_item_id: str) -> None:
    """Trigger a transaction sync for the given Plaid item."""
    async with unit_of_work() as db:
        plaid_item = await plaid_repo.get_item_by_plaid_id(db, plaid_item_id)
        if plaid_item:
            await sync_plaid_item(
                db, plaid_item, plaid_item.organization_id, plaid_item.user_id,
            )
        else:
            logger.warning("Plaid webhook for unknown item")


async def _handle_item_error(
    plaid_item_id: str, error: dict[str, Any],
) -> None:
    """Mark a Plaid item as errored."""
    error_code = error.get("error_code", "UNKNOWN")[:100]
    async with unit_of_work() as db:
        plaid_item = await plaid_repo.get_item_by_plaid_id(db, plaid_item_id)
        if plaid_item:
            await plaid_repo.update_status(db, plaid_item, "error", error_code)
            logger.warning("Plaid item error: code=%s", error_code)
