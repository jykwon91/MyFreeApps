"""Transaction repository — basic CRUD operations.

List/filter queries:        transaction_list_repo
Bulk operations:            transaction_bulk_repo
Reconciliation/dedup:       transaction_reconciliation_repo

All three modules are re-exported here so existing callers
(`transaction_repo.<fn>`) continue to work without changes.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.extraction.extraction import Extraction
from app.models.transactions.transaction import Transaction
from app.models.transactions.transaction_document import TransactionDocument

# -- re-exports for back-compat ------------------------------------------
from app.repositories.transactions.transaction_list_repo import (
    find_by_vendor_for_retroactive,
    list_by_activity_ids,
    list_by_user,
    list_filtered,
    list_for_duplicate_scan,
    list_orphaned_tax_relevant,
    list_schedule_e_transaction_details,
    list_unassigned_tax_relevant,
    sum_schedule_e_by_property_line,
)
from app.repositories.transactions.transaction_bulk_repo import (
    bulk_approve,
    bulk_delete,
    create_transaction_document_link,
    delete_by_extraction_ids,
    get_existing_external_ids,
    get_linked_document_ids,
    soft_delete_by_document_id,
    soft_delete_by_external_id,
    transfer_document_links,
)
from app.repositories.transactions.transaction_reconciliation_repo import (
    count_by_category,
    distinct_property_ids_by_category,
    distinct_vendors_by_category,
    find_duplicate_by_vendor_date,
    find_duplicate_pairs,
    find_exact_duplicate,
    find_possible_match_by_date_amount,
    mark_duplicate_reviewed,
    schedule_e_report,
    sum_by_category,
    sum_by_normalized_vendor_year,
    sum_expenses_by_year,
    summary_by_property,
)

__all__ = [
    # CRUD
    "find_by_external_id",
    "create",
    "create_transaction",
    "get_by_id",
    "update",
    "mark_deleted",
    "flush",
    # list
    "find_by_vendor_for_retroactive",
    "list_by_activity_ids",
    "list_by_user",
    "list_filtered",
    "list_for_duplicate_scan",
    "list_orphaned_tax_relevant",
    "list_schedule_e_transaction_details",
    "list_unassigned_tax_relevant",
    "sum_schedule_e_by_property_line",
    # bulk
    "bulk_approve",
    "bulk_delete",
    "create_transaction_document_link",
    "delete_by_extraction_ids",
    "get_existing_external_ids",
    "get_linked_document_ids",
    "soft_delete_by_document_id",
    "soft_delete_by_external_id",
    "transfer_document_links",
    # reconciliation
    "count_by_category",
    "distinct_property_ids_by_category",
    "distinct_vendors_by_category",
    "find_duplicate_by_vendor_date",
    "find_duplicate_pairs",
    "find_exact_duplicate",
    "find_possible_match_by_date_amount",
    "mark_duplicate_reviewed",
    "schedule_e_report",
    "sum_by_category",
    "sum_by_normalized_vendor_year",
    "sum_expenses_by_year",
    "summary_by_property",
]


async def find_by_external_id(
    db: AsyncSession,
    organization_id: uuid.UUID,
    external_source: str,
    external_id: str,
) -> Transaction | None:
    """Find a non-deleted transaction by external source and ID."""
    result = await db.execute(
        select(Transaction).where(
            Transaction.organization_id == organization_id,
            Transaction.external_source == external_source,
            Transaction.external_id == external_id,
            Transaction.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def create(db: AsyncSession, transaction: Transaction) -> Transaction:
    db.add(transaction)
    await db.flush()
    return transaction


async def create_transaction(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    is_manual: bool = False,
    **kwargs: object,
) -> Transaction:
    txn = Transaction(
        organization_id=organization_id,
        user_id=user_id,
        is_manual=is_manual,
        **kwargs,
    )
    db.add(txn)
    await db.flush()
    return txn


async def get_by_id(
    db: AsyncSession, transaction_id: uuid.UUID, organization_id: uuid.UUID
) -> Transaction | None:
    result = await db.execute(
        select(Transaction)
        .options(
            selectinload(Transaction.extraction).selectinload(Extraction.document),
            selectinload(Transaction.linked_documents).selectinload(TransactionDocument.document),
        )
        .where(
            Transaction.id == transaction_id,
            Transaction.organization_id == organization_id,
        )
    )
    return result.scalar_one_or_none()


async def update(db: AsyncSession, transaction: Transaction) -> Transaction:
    await db.flush()
    return transaction


async def mark_deleted(db: AsyncSession, transaction: Transaction) -> None:
    transaction.deleted_at = datetime.now(timezone.utc)
    transaction.status = "duplicate"
    await db.flush()


async def flush(db: AsyncSession) -> None:
    """Flush pending changes without committing (for mid-transaction reads)."""
    await db.flush()
