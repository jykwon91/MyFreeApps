"""Plaid transaction sync — fetches bank transactions and upserts them as Transactions."""
import logging
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decrypt_token
from app.core.tags import CATEGORY_TO_SCHEDULE_E
from app.integrations.plaid_client import sync_transactions, PlaidSyncResult
from app.models.integrations.plaid_account import PlaidAccount
from app.models.integrations.plaid_item import PlaidItem
from app.models.transactions.transaction import Transaction
from app.repositories import plaid_repo, sync_log_repo, transaction_repo

logger = logging.getLogger(__name__)

PLAID_CATEGORY_MAP: dict[str, str | None] = {
    "TRANSFER_IN": None,
    "TRANSFER_OUT": None,
    "RENT": "rental_revenue",
    "INCOME": "rental_revenue",
    "INSURANCE": "insurance",
    "UTILITIES": "utilities",
    "HOME_IMPROVEMENT": "maintenance",
    "TAX_PAYMENT": "taxes",
    "GENERAL_SERVICES": "other_expense",
    "TRANSPORTATION": "travel",
    "LOAN_PAYMENTS": "mortgage_interest",
}

SKIP_CATEGORIES = frozenset({
    "TRANSFER_IN", "TRANSFER_OUT",
})


def map_plaid_category(plaid_category: str | None) -> tuple[str, str]:
    """Map a Plaid personal_finance_category to (our_category, transaction_type).

    Returns ('category', 'income'|'expense').
    """
    if not plaid_category:
        return "uncategorized", "expense"

    normalized = plaid_category.upper().replace(" ", "_")

    if normalized in SKIP_CATEGORIES:
        return "uncategorized", "expense"

    if normalized in ("RENT", "INCOME"):
        mapped = PLAID_CATEGORY_MAP.get(normalized, "uncategorized")
        return mapped or "uncategorized", "income"

    mapped = PLAID_CATEGORY_MAP.get(normalized, "other_expense")
    return mapped or "other_expense", "expense"


def should_skip_transaction(plaid_category: str | None) -> bool:
    """Return True if a Plaid transaction should be skipped (internal transfers)."""
    if not plaid_category:
        return False
    return plaid_category.upper().replace(" ", "_") in SKIP_CATEGORIES


async def sync_plaid_item(
    db: AsyncSession,
    plaid_item: PlaidItem,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
) -> int:
    """Sync transactions for a single Plaid item. Returns number of records added."""
    access_token = decrypt_token(plaid_item.access_token)
    cursor = plaid_item.cursor

    log = await sync_log_repo.create(
        db, org_id, user_id, "plaid", "running",
        started_at=datetime.now(timezone.utc),
    )

    try:
        result: PlaidSyncResult | None = sync_transactions(access_token, cursor)
        if result is None:
            await sync_log_repo.mark_completed(db, log, "failed", error="Plaid client unavailable")
            return 0

        account_map = await _build_account_map(db, plaid_item.id)

        records_added = 0
        for txn_data in result.added:
            added = await _upsert_plaid_transaction(db, txn_data, org_id, user_id, account_map)
            if added:
                records_added += 1

        for txn_data in result.modified:
            await _update_plaid_transaction(db, txn_data, org_id)

        for removed_id in result.removed:
            await _soft_delete_plaid_transaction(db, removed_id, org_id)

        plaid_item.cursor = result.next_cursor
        plaid_item.last_synced_at = datetime.now(timezone.utc)
        plaid_item.status = "active"
        plaid_item.error_code = None

        log.records_added = records_added
        await sync_log_repo.mark_completed(db, log, "success")
        logger.info("Plaid sync complete for item %s: %d added, %d modified, %d removed",
                     plaid_item.plaid_item_id, records_added, len(result.modified), len(result.removed))
        return records_added

    except Exception as exc:
        plaid_item.status = "error"
        plaid_item.error_code = type(exc).__name__
        await sync_log_repo.mark_completed(db, log, "failed", error=str(exc)[:1000])
        logger.exception("Plaid sync failed for item %s", plaid_item.plaid_item_id)
        return 0


async def _build_account_map(db: AsyncSession, plaid_item_id: uuid.UUID) -> dict[str, PlaidAccount]:
    """Build a lookup from plaid_account_id -> PlaidAccount for property mapping."""
    return await plaid_repo.get_active_accounts_by_item(db, plaid_item_id)


async def _upsert_plaid_transaction(
    db: AsyncSession,
    txn_data: dict,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    account_map: dict[str, PlaidAccount],
) -> bool:
    """Create a transaction from Plaid data. Returns True if created, False if skipped/duplicate."""
    plaid_category = txn_data.get("personal_finance_category")
    if should_skip_transaction(plaid_category):
        return False

    external_id = txn_data["transaction_id"]
    existing = await transaction_repo.find_by_external_id(db, org_id, "plaid", external_id)
    if existing:
        return False

    category, txn_type = map_plaid_category(plaid_category)

    account = account_map.get(txn_data.get("account_id", ""))
    property_id = account.property_id if account else None

    raw_amount = txn_data.get("amount", 0)
    amount = abs(Decimal(str(raw_amount)))
    if amount == 0:
        return False

    txn_date = date.fromisoformat(txn_data["date"])
    vendor = txn_data.get("merchant_name") or txn_data.get("name", "")

    txn = Transaction(
        organization_id=org_id,
        user_id=user_id,
        property_id=property_id,
        transaction_date=txn_date,
        tax_year=txn_date.year,
        vendor=vendor[:255] if vendor else None,
        description=txn_data.get("name"),
        amount=amount,
        transaction_type=txn_type,
        category=category,
        tags=[category] if category != "uncategorized" else [],
        tax_relevant=category != "uncategorized",
        schedule_e_line=CATEGORY_TO_SCHEDULE_E.get(category),
        payment_method=_map_payment_channel(txn_data.get("payment_channel")),
        status="pending" if txn_data.get("pending") else "approved",
        external_id=external_id,
        external_source="plaid",
        is_pending=bool(txn_data.get("pending")),
    )
    await transaction_repo.create(db, txn)
    return True


async def _update_plaid_transaction(
    db: AsyncSession,
    txn_data: dict,
    org_id: uuid.UUID,
) -> None:
    """Update an existing Plaid-sourced transaction (e.g. pending -> settled)."""
    external_id = txn_data["transaction_id"]
    txn = await transaction_repo.find_by_external_id(db, org_id, "plaid", external_id)
    if not txn:
        return

    raw_amount = txn_data.get("amount", 0)
    amount = abs(Decimal(str(raw_amount)))
    if amount > 0:
        txn.amount = amount

    new_date = txn_data.get("date")
    if new_date:
        txn.transaction_date = date.fromisoformat(new_date)
        txn.tax_year = txn.transaction_date.year

    vendor = txn_data.get("merchant_name") or txn_data.get("name")
    if vendor:
        txn.vendor = vendor[:255]

    was_pending = txn.is_pending
    is_now_pending = bool(txn_data.get("pending"))
    txn.is_pending = is_now_pending

    if was_pending and not is_now_pending:
        txn.status = "approved"

    txn.updated_at = datetime.now(timezone.utc)


async def _soft_delete_plaid_transaction(
    db: AsyncSession,
    external_id: str,
    org_id: uuid.UUID,
) -> None:
    """Soft-delete a transaction removed by Plaid."""
    await transaction_repo.soft_delete_by_external_id(db, org_id, "plaid", external_id)


def _map_payment_channel(channel: str | None) -> str | None:
    """Map Plaid payment_channel to our payment_method values."""
    if not channel:
        return None
    mapping = {
        "online": "bank_transfer",
        "in store": "credit_card",
        "other": "other",
    }
    return mapping.get(channel.lower())
