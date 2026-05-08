import uuid
from datetime import datetime, timezone

from sqlalchemy import delete as sa_delete, select, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.repositories import soft_delete as _soft_delete

from app.models.transactions.transaction import Transaction
from app.models.transactions.transaction_document import TransactionDocument
from app.models.extraction.extraction import Extraction


async def bulk_approve(
    db: AsyncSession, transaction_ids: list[uuid.UUID], organization_id: uuid.UUID
) -> int:
    result = await db.execute(
        sa_update(Transaction)
        .where(
            Transaction.id.in_(transaction_ids),
            Transaction.organization_id == organization_id,
            Transaction.property_id.isnot(None),
            Transaction.status.in_(["pending", "needs_review", "unverified"]),
            Transaction.deleted_at.is_(None),
        )
        .values(status="approved")
    )
    return result.rowcount  # type: ignore[return-value]


async def bulk_delete(
    db: AsyncSession, transaction_ids: list[uuid.UUID], organization_id: uuid.UUID
) -> int:
    result = await db.execute(
        sa_update(Transaction)
        .where(
            Transaction.id.in_(transaction_ids),
            Transaction.organization_id == organization_id,
            Transaction.deleted_at.is_(None),
        )
        .values(status="duplicate", deleted_at=datetime.now(timezone.utc))
    )
    return result.rowcount  # type: ignore[return-value]


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
