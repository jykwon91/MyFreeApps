import uuid
from datetime import datetime, timezone

from sqlalchemy import ColumnElement, Select, delete as sa_delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.repositories import soft_delete as _soft_delete

from app.core.transaction_statuses import REVIEWABLE_STATUSES
from app.models.transactions.transaction import Transaction
from app.models.transactions.transaction_document import TransactionDocument
from app.models.extraction.extraction import Extraction


def live_transactions_for_update_stmt(
    transaction_ids: list[uuid.UUID], organization_id: uuid.UUID, *criteria: ColumnElement[bool],
) -> Select[tuple[Transaction]]:
    """The org's live transactions among the ids, locked in id order.

    Locking in a fixed order means two overlapping bulk requests queue instead of deadlocking.
    """
    return (
        select(Transaction)
        .where(
            Transaction.id.in_(transaction_ids),
            Transaction.organization_id == organization_id,
            Transaction.deleted_at.is_(None),
            *criteria,
        )
        .order_by(Transaction.id)
        .with_for_update()
    )


async def lock_live_transactions(
    db: AsyncSession, transaction_ids: list[uuid.UUID], organization_id: uuid.UUID,
) -> list[Transaction]:
    """Lock and return the org's live transactions among the ids, in id order."""
    result = await db.execute(live_transactions_for_update_stmt(transaction_ids, organization_id))
    return list(result.scalars().all())


def apply_soft_delete(transaction: Transaction, now: datetime) -> None:
    """Set the soft-delete columns without flushing."""
    transaction.deleted_at = now
    transaction.status = "duplicate"


async def mark_deleted(db: AsyncSession, transaction: Transaction) -> None:
    apply_soft_delete(transaction, datetime.now(timezone.utc))
    await db.flush()


async def soft_delete_transactions(db: AsyncSession, transactions: list[Transaction]) -> None:
    """Soft-delete already-locked rows as ``mark_deleted`` does, with one shared timestamp and one flush."""
    now = datetime.now(timezone.utc)
    for txn in transactions:
        apply_soft_delete(txn, now)
    await db.flush()


async def bulk_approve(
    db: AsyncSession, transaction_ids: list[uuid.UUID], organization_id: uuid.UUID
) -> int:
    """Approve the reviewable, property-assigned transactions among the ids.

    Changes go through the ORM (not a bulk UPDATE) so the audit listener sees each row,
    exactly as it does for a single approve.
    """
    rows = (await db.execute(live_transactions_for_update_stmt(
        transaction_ids,
        organization_id,
        Transaction.property_id.isnot(None),
        Transaction.status.in_(REVIEWABLE_STATUSES),
    ))).scalars().all()
    for txn in rows:
        txn.status = "approved"
    await db.flush()
    return len(rows)


async def bulk_delete(
    db: AsyncSession, transaction_ids: list[uuid.UUID], organization_id: uuid.UUID
) -> list[uuid.UUID]:
    """Soft-delete the org's live transactions among the ids as a single delete does (same columns, via ``apply_soft_delete``).

    Returns the ids actually deleted; the rest were unknown, in another org or already deleted.
    """
    rows = await lock_live_transactions(db, transaction_ids, organization_id)
    await soft_delete_transactions(db, rows)
    return [txn.id for txn in rows]


async def delete_by_extraction_ids(
    db: AsyncSession,
    extraction_ids: list[uuid.UUID],
    organization_id: uuid.UUID,
    *,
    tax_year: int | None = None,
) -> int:
    """Hard-delete transactions linked to given extraction IDs. For clean re-extract.

    If tax_year is provided, only deletes transactions matching that year.
    """
    if not extraction_ids:
        return 0
    stmt = sa_delete(Transaction).where(
        Transaction.extraction_id.in_(extraction_ids),
        Transaction.organization_id == organization_id,
    )
    if tax_year is not None:
        stmt = stmt.where(Transaction.tax_year == tax_year)
    result = await db.execute(stmt)
    return result.rowcount  # type: ignore[return-value]


async def soft_delete_by_document_id(
    db: AsyncSession,
    document_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> list[Transaction]:
    """Soft-delete all transactions linked to a document via extractions.

    Returns the list of deleted transactions for UX confirmation.
    """
    stmt = (
        select(Transaction)
        .join(Extraction, Transaction.extraction_id == Extraction.id)
        .where(
            Extraction.document_id == document_id,
            Transaction.organization_id == organization_id,
            Transaction.deleted_at.is_(None),
        )
    )
    result = await db.execute(stmt)
    transactions = list(result.scalars().all())

    for txn in transactions:
        txn.status = "duplicate"
        await _soft_delete(db, txn)

    return transactions


async def soft_delete_by_external_id(
    db: AsyncSession,
    organization_id: uuid.UUID,
    external_source: str,
    external_id: str,
) -> None:
    """Soft-delete a transaction by external source and ID."""
    result = await db.execute(
        select(Transaction).where(
            Transaction.organization_id == organization_id,
            Transaction.external_source == external_source,
            Transaction.external_id == external_id,
            Transaction.deleted_at.is_(None),
        )
    )
    txn = result.scalar_one_or_none()
    if txn:
        txn.status = "duplicate"
        await _soft_delete(db, txn)


async def get_existing_external_ids(
    db: AsyncSession,
    organization_id: uuid.UUID,
    external_source: str,
    external_ids: list[str | None],
) -> set[str | None]:
    """Return the subset of external_ids that already exist for this org/source."""
    if not external_ids:
        return set()
    result = await db.execute(
        select(Transaction.external_id).where(
            Transaction.organization_id == organization_id,
            Transaction.external_source == external_source,
            Transaction.external_id.in_(external_ids),
        )
    )
    return {row[0] for row in result.all()}


async def get_linked_document_ids(
    db: AsyncSession, transaction_ids: list[uuid.UUID],
) -> dict[uuid.UUID, list[uuid.UUID]]:
    """Get linked document IDs for a set of transactions."""
    if not transaction_ids:
        return {}
    stmt = select(
        TransactionDocument.transaction_id,
        TransactionDocument.document_id,
    ).where(TransactionDocument.transaction_id.in_(transaction_ids))
    rows = (await db.execute(stmt)).all()
    result: dict[uuid.UUID, list[uuid.UUID]] = {}
    for txn_id, doc_id in rows:
        result.setdefault(txn_id, []).append(doc_id)
    return result


async def create_transaction_document_link(
    db: AsyncSession,
    transaction_id: uuid.UUID,
    document_id: uuid.UUID,
    extraction_id: uuid.UUID | None,
    link_type: str,
) -> None:
    """Create a TransactionDocument junction record."""
    link = TransactionDocument(
        transaction_id=transaction_id,
        document_id=document_id,
        extraction_id=extraction_id,
        link_type=link_type,
    )
    db.add(link)


async def transfer_document_links(
    db: AsyncSession,
    from_transaction_id: uuid.UUID,
    to_transaction_id: uuid.UUID,
) -> None:
    """Transfer all document links from one transaction to another (for keep action).

    Skips links where the target already has a link to the same document (uq_txn_doc).
    """
    existing_doc_ids = {
        row[0]
        for row in (
            await db.execute(
                select(TransactionDocument.document_id).where(
                    TransactionDocument.transaction_id == to_transaction_id,
                )
            )
        ).all()
    }

    stmt = select(TransactionDocument).where(
        TransactionDocument.transaction_id == from_transaction_id,
    )
    links = (await db.execute(stmt)).scalars().all()
    for link in links:
        if link.document_id not in existing_doc_ids:
            new_link = TransactionDocument(
                transaction_id=to_transaction_id,
                document_id=link.document_id,
                extraction_id=link.extraction_id,
                link_type=link.link_type,
            )
            db.add(new_link)
