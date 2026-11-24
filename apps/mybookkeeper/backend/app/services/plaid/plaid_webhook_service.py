"""Act on a verified Plaid webhook.

Returns the id of a connection to sync in the background, or None. The
handler only records state; the sync itself runs after the response so Plaid
gets its 200 quickly (it retries slow answers).

``NEW_ACCOUNTS_AVAILABLE`` is only logged: adding an account needs the person
to choose it in Link update mode, which is not offered yet.
"""
from __future__ import annotations

import logging
import uuid

from pydantic import ValidationError

from app.core.plaid_constants import (
    PLAID_WEBHOOK_ITEM_ERROR,
    PLAID_WEBHOOK_ITEM_REAUTH_CODES,
    PLAID_WEBHOOK_LOGIN_REPAIRED,
    PLAID_WEBHOOK_SYNC_UPDATES_AVAILABLE,
    PLAID_WEBHOOK_TYPE_ITEM,
    PLAID_WEBHOOK_TYPE_TRANSACTIONS,
    PLAID_WEBHOOK_USER_PERMISSION_REVOKED,
)
from app.core.plaid_item_enums import (
    PLAID_ITEM_STATUS_ACTIVE,
    PLAID_ITEM_STATUS_ERROR,
    PLAID_ITEM_STATUS_LOGIN_REQUIRED,
)
from app.db.session import unit_of_work
from app.models.integrations.plaid_item import PlaidItem
from app.repositories.plaid import plaid_item_repo
from app.schemas.plaid.wire.plaid_wire_webhook import PlaidWireWebhook
from app.services.plaid import plaid_item_status_rules

logger = logging.getLogger(__name__)


async def handle(body: bytes) -> uuid.UUID | None:
    try:
        webhook = PlaidWireWebhook.model_validate_json(body)
    except ValidationError:
        logger.warning("Plaid webhook body has no webhook_type/webhook_code; ignored")
        return None
    if webhook.item_id is None:
        logger.info("Plaid webhook %s/%s names no item; ignored", webhook.webhook_type, webhook.webhook_code)
        return None

    async with unit_of_work() as db:
        item = await plaid_item_repo.get_by_plaid_item_id(db, webhook.item_id)
        if item is None:
            logger.info(
                "Plaid webhook %s/%s for an item not on file; ignored",
                webhook.webhook_type, webhook.webhook_code,
            )
            return None
        if webhook.webhook_type == PLAID_WEBHOOK_TYPE_TRANSACTIONS:
            if webhook.webhook_code == PLAID_WEBHOOK_SYNC_UPDATES_AVAILABLE:
                return item.id
            return None
        if webhook.webhook_type == PLAID_WEBHOOK_TYPE_ITEM:
            _apply_item_webhook(item, webhook)
            await db.flush()
        return None


def _apply_item_webhook(item: PlaidItem, webhook: PlaidWireWebhook) -> None:
    code = webhook.webhook_code
    if code == PLAID_WEBHOOK_ITEM_ERROR and webhook.error is not None:
        plaid_item_status_rules.record_error(
            item, error_type=webhook.error.error_type, error_code=webhook.error.error_code,
        )
        logger.warning(
            "Plaid item %s error webhook: error_type=%s error_code=%s",
            item.id, webhook.error.error_type, webhook.error.error_code,
        )
    elif code in PLAID_WEBHOOK_ITEM_REAUTH_CODES:
        item.status = PLAID_ITEM_STATUS_LOGIN_REQUIRED
        item.error_code = code
        logger.info("Plaid item %s needs its owner to sign in again: %s", item.id, code)
    elif code == PLAID_WEBHOOK_LOGIN_REPAIRED:
        item.status = PLAID_ITEM_STATUS_ACTIVE
        item.error_type = None
        item.error_code = None
    elif code == PLAID_WEBHOOK_USER_PERMISSION_REVOKED:
        item.status = PLAID_ITEM_STATUS_ERROR
        item.error_code = code
        logger.info("Plaid item %s: the person revoked access at their bank", item.id)
    else:
        logger.info("Plaid item webhook %s for item %s; no action", code, item.id)
