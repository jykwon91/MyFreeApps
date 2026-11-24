"""Pull a bank connection's new, changed and withdrawn transactions.

Every trigger ends here: "Sync now", the ``SYNC_UPDATES_AVAILABLE`` webhook,
the daily scheduler, and the first sync after connecting.

The item row is locked for the whole run, so two triggers firing together
apply one batch, not the same batch twice; the second then finds nothing new
from the stored cursor. The cursor only advances in the same transaction that
writes the batch, so a crash part-way re-pulls the batch rather than losing it.

A refusal from Plaid is not raised out of the transaction (that would roll
back the record of it): it is stored on the item — ``error_type`` /
``error_code`` always, and the status when the item itself is broken — and
the result reports the status.
"""
from __future__ import annotations

import datetime as _dt
import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.plaid_item_enums import PLAID_ITEM_STATUS_ACTIVE, PLAID_ITEM_STATUS_LOGIN_REQUIRED
from app.core.plaid_not_configured_error import PlaidNotConfiguredError
from app.db.session import unit_of_work
from app.repositories.financial_accounts import financial_account_repo
from app.repositories.plaid import plaid_item_repo
from app.repositories.transactions import spending_category_repo
from app.schemas.plaid.plaid_sync_result import PlaidSyncResult
from app.services.plaid import plaid_client, plaid_item_status_rules, plaid_transaction_applier
from app.services.plaid.plaid_api_error import PlaidApiError
from app.services.plaid.plaid_item_not_found_error import PlaidItemNotFoundError
from app.services.plaid.plaid_login_required_error import PlaidLoginRequiredError

logger = logging.getLogger(__name__)

async def sync_item(item_id: uuid.UUID) -> PlaidSyncResult:
    """Sync one connection. Raises ``PlaidItemNotFoundError`` if it is gone."""
    async with unit_of_work() as db:
        item = await plaid_item_repo.lock(db, item_id)
        if item is None:
            raise PlaidItemNotFoundError(str(item_id))
        try:
            batch = await plaid_client.sync_transactions(item.access_token, item.transactions_cursor)
        except PlaidApiError as exc:
            plaid_item_status_rules.record_error(
                item, error_type=exc.error_type, error_code=exc.error_code,
            )
            logger.warning(
                "Plaid sync refused for item %s: error_type=%s error_code=%s request_id=%s",
                item.id, exc.error_type, exc.error_code, exc.request_id,
            )
            await db.flush()
            return PlaidSyncResult(status=item.status)

        accounts = await financial_account_repo.list_by_plaid_item(db, item.id)
        counts = await plaid_transaction_applier.apply_batch(
            db,
            item=item,
            batch=batch,
            accounts_by_plaid_id={a.plaid_account_id: a for a in accounts if a.plaid_account_id},
            linked_account_ids=await financial_account_repo.list_plaid_linked_ids(
                db, user_id=item.user_id, organization_id=item.organization_id,
            ),
            spending_category_ids=await _spending_category_ids(db, item.organization_id),
            today=_dt.date.today(),
        )
        item.transactions_cursor = batch.next_cursor
        item.status = PLAID_ITEM_STATUS_ACTIVE
        item.error_type = None
        item.error_code = None
        item.last_synced_at = _dt.datetime.now(_dt.timezone.utc)
        await db.flush()
        logger.info(
            "Plaid sync for item %s: added=%d modified=%d removed=%d matched=%d transfers=%d",
            item.id, counts.added, counts.modified, counts.removed,
            counts.matched_existing, counts.transfers_matched,
        )
        return PlaidSyncResult(
            added=counts.added,
            modified=counts.modified,
            removed=counts.removed,
            matched_existing=counts.matched_existing,
            transfers_matched=counts.transfers_matched,
            status=item.status,
        )


async def sync_for_user(
    *, item_id: uuid.UUID, user_id: uuid.UUID, organization_id: uuid.UUID,
) -> PlaidSyncResult:
    """"Sync now" from the Accounts page: the person's own connection only."""
    async with unit_of_work() as db:
        item = await plaid_item_repo.get_for_user(
            db, item_id=item_id, user_id=user_id, organization_id=organization_id,
        )
        if item is None:
            raise PlaidItemNotFoundError(str(item_id))
        if item.status == PLAID_ITEM_STATUS_LOGIN_REQUIRED:
            raise PlaidLoginRequiredError(str(item_id))
    return await sync_item(item_id)


async def sync_item_in_background(item_id: uuid.UUID) -> None:
    """For background tasks and the webhook: never raises, always logs."""
    try:
        await sync_item(item_id)
    except PlaidItemNotFoundError:
        logger.info("Plaid item %s was disconnected before its sync ran", item_id)
    except PlaidNotConfiguredError:
        logger.error("Plaid sync skipped for item %s: Plaid is not configured", item_id)
    except Exception:
        logger.exception("Plaid sync failed for item %s", item_id)


async def sync_all_active() -> int:
    """The daily sync: every connection that isn't waiting on its owner.
    One failing never stops the rest. Returns how many were attempted."""
    async with unit_of_work() as db:
        item_ids = await plaid_item_repo.list_active_ids(db)
    for item_id in item_ids:
        await sync_item_in_background(item_id)
    return len(item_ids)


async def _spending_category_ids(db: AsyncSession, organization_id: uuid.UUID) -> dict[str, uuid.UUID]:
    categories = await spending_category_repo.list_for_org(db, organization_id=organization_id)
    return {category.name: category.id for category in categories}
