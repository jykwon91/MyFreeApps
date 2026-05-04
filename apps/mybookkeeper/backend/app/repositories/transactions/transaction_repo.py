import uuid
from collections.abc import Sequence
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import Integer, Row, delete as sa_delete, func, or_, select, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import aliased, selectinload
from sqlalchemy.sql.expression import FunctionElement

from app.core.vendors import normalize_vendor
from app.models.extraction.extraction import Extraction
from app.models.transactions.transaction import Transaction
from app.models.transactions.transaction_document import TransactionDocument


class _date_diff_days(FunctionElement):
    """Dialect-aware absolute date difference in days."""
    type = Integer()
    name = "date_diff_days"
    inherit_cache = True


@compiles(_date_diff_days, "postgresql")
def _pg_date_diff(element, compiler, **kw):  # type: ignore[no-untyped-def]
    args = [compiler.process(arg, **kw) for arg in element.clauses]
    return f"ABS({args[0]} - {args[1]})"


@compiles(_date_diff_days, "sqlite")
def _sqlite_date_diff(element, compiler, **kw):  # type: ignore[no-untyped-def]
    args = [compiler.process(arg, **kw) for arg in element.clauses]
    return f"CAST(ABS(julianday({args[0]}) - julianday({args[1]})) AS INTEGER)"


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


async def soft_delete_by_document_id(
    db: AsyncSession,
    document_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> list[Transaction]:
    """Soft-delete all transactions linked to a document via extractions.

    Returns the list of deleted transactions for UX confirmation.
    """
    # Find transactions via extraction → transaction link
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

    now = datetime.now(timezone.utc)
    for txn in transactions:
        txn.deleted_at = now
        txn.status = "duplicate"

    return transactions


async def soft_delete_by_external_id(
    db: AsyncSession,
    organization_id: uuid.UUID,
    external_source: str,
    external_id: str,
) -> None:
    """Soft-delete a transaction by external source and ID."""
    txn = await find_by_external_id(db, organization_id, external_source, external_id)
    if txn:
        txn.deleted_at = datetime.now(timezone.utc)
        txn.status = "duplicate"


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


async def list_filtered(
    db: AsyncSession,
    organization_id: uuid.UUID,
    *,
    property_id: uuid.UUID | None = None,
    applicant_id: uuid.UUID | None = None,
    status: str | None = None,
    transaction_type: str | None = None,
    category: str | None = None,
    vendor: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    tax_year: int | None = None,
    limit: int | None = None,
    offset: int | None = None,
) -> Sequence[Transaction]:
    stmt = (
        select(Transaction)
        .options(
            selectinload(Transaction.extraction).selectinload(Extraction.document),
            selectinload(Transaction.linked_documents).selectinload(TransactionDocument.document),
        )
        .where(
            Transaction.organization_id == organization_id,
            Transaction.deleted_at.is_(None),
        )
    )

    if property_id is not None:
        stmt = stmt.where(Transaction.property_id == property_id)
    if applicant_id is not None:
        stmt = stmt.where(Transaction.applicant_id == applicant_id)
    if status is not None:
        stmt = stmt.where(Transaction.status == status)
    if transaction_type is not None:
        stmt = stmt.where(Transaction.transaction_type == transaction_type)
    if category is not None:
        stmt = stmt.where(Transaction.category == category)
    if vendor is not None:
        stmt = stmt.where(Transaction.vendor.ilike(f"%{vendor}%"))
    if start_date is not None:
        stmt = stmt.where(Transaction.transaction_date >= start_date)
    if end_date is not None:
        stmt = stmt.where(Transaction.transaction_date <= end_date)
    if tax_year is not None:
        stmt = stmt.where(Transaction.tax_year == tax_year)

    stmt = stmt.order_by(Transaction.transaction_date.desc())

    if offset is not None:
        stmt = stmt.offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)

    result = await db.execute(stmt)
    return result.scalars().all()


async def update(db: AsyncSession, transaction: Transaction) -> Transaction:
    await db.flush()
    return transaction


async def list_by_user(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> Sequence[Transaction]:
    """Return all non-deleted transactions owned by a user (for data export)."""
    result = await db.execute(
        select(Transaction)
        .where(Transaction.user_id == user_id, Transaction.deleted_at.is_(None))
        .order_by(Transaction.transaction_date.desc())
    )
    return result.scalars().all()


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


async def mark_deleted(db: AsyncSession, transaction: Transaction) -> None:
    transaction.deleted_at = datetime.now(timezone.utc)
    transaction.status = "duplicate"
    await db.flush()


async def find_exact_duplicate(
    db: AsyncSession,
    organization_id: uuid.UUID,
    vendor: str,
    transaction_date: date,
    amount: Decimal,
    property_id: uuid.UUID | None = None,
    exclude_id: uuid.UUID | None = None,
) -> Transaction | None:
    """Find a transaction matching vendor + date + amount + property (all four).

    This is the strictest dedup check — an exact match means the new
    transaction is almost certainly a duplicate.
    """
    normalized = normalize_vendor(vendor)
    stmt = (
        select(Transaction)
        .where(
            Transaction.organization_id == organization_id,
            Transaction.vendor.isnot(None),
            Transaction.transaction_date == transaction_date,
            Transaction.amount == amount,
            Transaction.deleted_at.is_(None),
        )
    )
    if exclude_id:
        stmt = stmt.where(Transaction.id != exclude_id)
    if property_id is not None:
        stmt = stmt.where(Transaction.property_id == property_id)
    else:
        stmt = stmt.where(Transaction.property_id.is_(None))
    result = await db.execute(stmt.limit(10))
    candidates = result.scalars().all()
    for candidate in candidates:
        if normalize_vendor(candidate.vendor) == normalized:
            return candidate
    return None


async def find_duplicate_by_vendor_date(
    db: AsyncSession,
    organization_id: uuid.UUID,
    vendor: str,
    transaction_date: date,
    property_id: uuid.UUID | None = None,
    exclude_id: uuid.UUID | None = None,
) -> Transaction | None:
    """Find a transaction matching vendor + date, optionally scoped by property.

    When property_id is provided, first searches for that specific property,
    then falls back to transactions with no property assigned.
    When property_id is None, only searches transactions with no property.
    """
    normalized = normalize_vendor(vendor)
    stmt = (
        select(Transaction)
        .where(
            Transaction.organization_id == organization_id,
            Transaction.vendor.isnot(None),
            Transaction.transaction_date == transaction_date,
            Transaction.deleted_at.is_(None),
        )
    )
    if exclude_id:
        stmt = stmt.where(Transaction.id != exclude_id)
    if property_id is not None:
        stmt = stmt.where(
            or_(Transaction.property_id == property_id, Transaction.property_id.is_(None))
        )
    else:
        stmt = stmt.where(Transaction.property_id.is_(None))
    result = await db.execute(stmt.limit(10))
    candidates = result.scalars().all()
    for candidate in candidates:
        if normalize_vendor(candidate.vendor) == normalized:
            return candidate
    return None


async def find_possible_match_by_date_amount(
    db: AsyncSession,
    organization_id: uuid.UUID,
    transaction_date: date,
    amount: Decimal,
    property_id: uuid.UUID | None = None,
    exclude_id: uuid.UUID | None = None,
    date_window_days: int = 14,
) -> Transaction | None:
    """Find a transaction with the same amount within a date window.

    Catches duplicates from different sources (e.g., invoice on Mar 2 vs
    bank payment on Mar 8 for the same work).
    """
    date_start = transaction_date - timedelta(days=date_window_days)
    date_end = transaction_date + timedelta(days=date_window_days)
    stmt = (
        select(Transaction)
        .where(
            Transaction.organization_id == organization_id,
            Transaction.transaction_date >= date_start,
            Transaction.transaction_date <= date_end,
            Transaction.amount == amount,
            Transaction.deleted_at.is_(None),
        )
    )
    if exclude_id:
        stmt = stmt.where(Transaction.id != exclude_id)
    if property_id is not None:
        stmt = stmt.where(
            or_(Transaction.property_id == property_id, Transaction.property_id.is_(None))
        )
    else:
        stmt = stmt.where(Transaction.property_id.is_(None))
    result = await db.execute(stmt.limit(1))
    return result.scalar_one_or_none()


async def summary_by_property(
    db: AsyncSession,
    organization_id: uuid.UUID,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    tax_year: int | None = None,
) -> Sequence[Row]:
    stmt = (
        select(
            Transaction.property_id,
            Transaction.transaction_type,
            func.sum(Transaction.amount).label("total_amount"),
        )
        .where(
            Transaction.organization_id == organization_id,
            Transaction.deleted_at.is_(None),
            Transaction.status == "approved",
        )
        .group_by(Transaction.property_id, Transaction.transaction_type)
    )

    if start_date is not None:
        stmt = stmt.where(Transaction.transaction_date >= start_date)
    if end_date is not None:
        stmt = stmt.where(Transaction.transaction_date <= end_date)
    if tax_year is not None:
        stmt = stmt.where(Transaction.tax_year == tax_year)

    result = await db.execute(stmt)
    return result.all()


async def schedule_e_report(
    db: AsyncSession,
    organization_id: uuid.UUID,
    tax_year: int,
) -> Sequence[Row]:
    stmt = (
        select(
            Transaction.property_id,
            Transaction.schedule_e_line,
            func.sum(Transaction.amount).label("total_amount"),
        )
        .where(
            Transaction.organization_id == organization_id,
            Transaction.deleted_at.is_(None),
            Transaction.status == "approved",
            Transaction.tax_relevant.is_(True),
            Transaction.tax_year == tax_year,
        )
        .group_by(Transaction.property_id, Transaction.schedule_e_line)
    )
    result = await db.execute(stmt)
    return result.all()


async def find_duplicate_pairs(
    db: AsyncSession,
    organization_id: uuid.UUID,
    *,
    date_window_days: int = 14,
    limit: int = 100,
) -> list[tuple[Transaction, Transaction, int]]:
    """Find pairs of transactions that look like duplicates.

    Returns list of (txn_a, txn_b, date_diff_days).
    Criteria: same amount, same type, same/null property, date within window.
    """
    t1 = aliased(Transaction, name="t1")
    t2 = aliased(Transaction, name="t2")

    date_diff = _date_diff_days(t1.transaction_date, t2.transaction_date)

    stmt = (
        select(t1.id.label("id_a"), t2.id.label("id_b"), date_diff.label("date_diff"))
        .where(
            t1.id < t2.id,
            t1.organization_id == organization_id,
            t2.organization_id == organization_id,
            t1.amount == t2.amount,
            t1.transaction_type == t2.transaction_type,
            date_diff <= date_window_days,
            or_(
                t1.property_id == t2.property_id,
                t1.property_id.is_(None),
                t2.property_id.is_(None),
            ),
            t1.deleted_at.is_(None),
            t2.deleted_at.is_(None),
            t1.status != "duplicate",
            t2.status != "duplicate",
            t1.duplicate_reviewed_at.is_(None),
            t2.duplicate_reviewed_at.is_(None),
        )
        .order_by(t1.transaction_date.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()

    if not rows:
        return []

    all_ids = {r.id_a for r in rows} | {r.id_b for r in rows}
    txn_stmt = (
        select(Transaction)
        .options(selectinload(Transaction.extraction).selectinload(Extraction.document))
        .where(Transaction.id.in_(all_ids))
    )
    txn_map = {t.id: t for t in (await db.execute(txn_stmt)).scalars().all()}

    result: list[tuple[Transaction, Transaction, int]] = []
    for row in rows:
        a = txn_map.get(row.id_a)
        b = txn_map.get(row.id_b)
        if a and b:
            result.append((a, b, row.date_diff))
    return result


async def mark_duplicate_reviewed(
    db: AsyncSession,
    transaction_ids: list[uuid.UUID],
    organization_id: uuid.UUID,
) -> int:
    """Mark transactions as reviewed (not duplicates). Returns count updated."""
    result = await db.execute(
        sa_update(Transaction)
        .where(
            Transaction.id.in_(transaction_ids),
            Transaction.organization_id == organization_id,
            Transaction.deleted_at.is_(None),
        )
        .values(duplicate_reviewed_at=datetime.now(timezone.utc))
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


async def sum_schedule_e_by_property_line(
    db: AsyncSession,
    organization_id: uuid.UUID,
    tax_year: int,
) -> list[Row]:
    """Return (property_id, schedule_e_line, total) for tax-relevant approved transactions."""
    stmt = (
        select(
            Transaction.property_id,
            Transaction.schedule_e_line,
            func.sum(Transaction.amount).label("total"),
        )
        .where(
            Transaction.organization_id == organization_id,
            Transaction.tax_year == tax_year,
            Transaction.status == "approved",
            Transaction.tax_relevant.is_(True),
            Transaction.deleted_at.is_(None),
            Transaction.property_id.isnot(None),
            Transaction.schedule_e_line.isnot(None),
        )
        .group_by(Transaction.property_id, Transaction.schedule_e_line)
    )
    result = await db.execute(stmt)
    return result.all()


async def list_schedule_e_transaction_details(
    db: AsyncSession,
    organization_id: uuid.UUID,
    tax_year: int,
) -> list[Row]:
    """Return (id, property_id, schedule_e_line, amount) for audit-trail use."""
    stmt = (
        select(
            Transaction.id,
            Transaction.property_id,
            Transaction.schedule_e_line,
            Transaction.amount,
        )
        .where(
            Transaction.organization_id == organization_id,
            Transaction.tax_year == tax_year,
            Transaction.status == "approved",
            Transaction.tax_relevant.is_(True),
            Transaction.deleted_at.is_(None),
            Transaction.property_id.isnot(None),
            Transaction.schedule_e_line.isnot(None),
        )
    )
    result = await db.execute(stmt)
    return result.all()


async def list_by_activity_ids(
    db: AsyncSession,
    organization_id: uuid.UUID,
    tax_year: int,
    activity_ids: list[uuid.UUID],
) -> list[Row]:
    """Return (activity_id, category, amount, id) for Schedule C computation."""
    if not activity_ids:
        return []
    stmt = (
        select(
            Transaction.activity_id,
            Transaction.category,
            Transaction.amount,
            Transaction.id,
        )
        .where(
            Transaction.organization_id == organization_id,
            Transaction.tax_year == tax_year,
            Transaction.status == "approved",
            Transaction.tax_relevant.is_(True),
            Transaction.deleted_at.is_(None),
            Transaction.activity_id.in_(activity_ids),
        )
    )
    result = await db.execute(stmt)
    return result.all()


async def sum_by_category(
    db: AsyncSession,
    organization_id: uuid.UUID,
    tax_year: int,
    category: str,
) -> Decimal:
    """Sum approved, non-deleted transaction amounts for a given category and tax year."""
    stmt = (
        select(func.sum(Transaction.amount))
        .where(
            Transaction.organization_id == organization_id,
            Transaction.tax_year == tax_year,
            Transaction.status == "approved",
            Transaction.deleted_at.is_(None),
            Transaction.category == category,
            Transaction.tax_relevant.is_(True),
        )
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none() or Decimal("0")


async def count_by_category(
    db: AsyncSession,
    organization_id: uuid.UUID,
    tax_year: int,
    category: str,
) -> int:
    """Count approved, non-deleted transactions for a given category and tax year."""
    stmt = (
        select(func.count())
        .select_from(Transaction)
        .where(
            Transaction.organization_id == organization_id,
            Transaction.tax_year == tax_year,
            Transaction.category == category,
            Transaction.status == "approved",
            Transaction.deleted_at.is_(None),
        )
    )
    result = await db.execute(stmt)
    return result.scalar_one()


async def distinct_vendors_by_category(
    db: AsyncSession,
    organization_id: uuid.UUID,
    tax_year: int,
    category: str,
) -> list[str]:
    """Return distinct non-null vendor values for a given category and tax year."""
    stmt = (
        select(Transaction.vendor)
        .where(
            Transaction.organization_id == organization_id,
            Transaction.tax_year == tax_year,
            Transaction.category == category,
            Transaction.deleted_at.is_(None),
            Transaction.vendor.isnot(None),
        )
        .group_by(Transaction.vendor)
    )
    result = await db.execute(stmt)
    return [row[0] for row in result.all()]


async def distinct_property_ids_by_category(
    db: AsyncSession,
    organization_id: uuid.UUID,
    tax_year: int,
    category: str,
) -> list[uuid.UUID]:
    """Return distinct non-null property_ids for a given category and tax year."""
    stmt = (
        select(Transaction.property_id)
        .where(
            Transaction.organization_id == organization_id,
            Transaction.tax_year == tax_year,
            Transaction.category == category,
            Transaction.deleted_at.is_(None),
            Transaction.property_id.isnot(None),
        )
        .group_by(Transaction.property_id)
    )
    result = await db.execute(stmt)
    return [row[0] for row in result.all()]


async def list_unassigned_tax_relevant(
    db: AsyncSession,
    organization_id: uuid.UUID,
    tax_year: int,
    *,
    limit: int = 50,
) -> list[Transaction]:
    """Return approved, tax-relevant transactions with no property assignment."""
    stmt = (
        select(Transaction)
        .where(
            Transaction.organization_id == organization_id,
            Transaction.tax_year == tax_year,
            Transaction.property_id.is_(None),
            Transaction.tax_relevant.is_(True),
            Transaction.deleted_at.is_(None),
            Transaction.status == "approved",
        )
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def find_by_vendor_for_retroactive(
    db: AsyncSession,
    organization_id: uuid.UUID,
    exclude_id: uuid.UUID,
    *,
    categories: set[str] | None = None,
    require_address: bool = False,
    limit: int = 500,
) -> list[Transaction]:
    """Find non-deleted transactions for retroactive rule application."""
    stmt = (
        select(Transaction)
        .where(
            Transaction.organization_id == organization_id,
            Transaction.vendor.isnot(None),
            Transaction.deleted_at.is_(None),
            Transaction.id != exclude_id,
        )
        .limit(limit)
    )
    if categories:
        stmt = stmt.where(Transaction.category.in_(categories))
    if require_address:
        stmt = stmt.where(Transaction.address.isnot(None))
    result = await db.execute(stmt)
    return list(result.scalars().all())


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


async def list_orphaned_tax_relevant(
    db: AsyncSession,
    organization_id: uuid.UUID,
    tax_year: int,
) -> list[Transaction]:
    """Return approved, tax-relevant transactions with no property and no activity assignment."""
    stmt = (
        select(Transaction)
        .where(
            Transaction.organization_id == organization_id,
            Transaction.tax_year == tax_year,
            Transaction.property_id.is_(None),
            Transaction.activity_id.is_(None),
            Transaction.tax_relevant.is_(True),
            Transaction.deleted_at.is_(None),
            Transaction.status == "approved",
        )
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def sum_by_normalized_vendor_year(
    db: AsyncSession,
    organization_id: uuid.UUID,
    tax_year: int,
) -> list[tuple[str, Decimal]]:
    """Return (normalized_vendor, sum_amount) for approved, tax-relevant transactions.

    Only includes rows where normalized_vendor is non-null.
    """
    stmt = (
        select(
            Transaction.normalized_vendor,
            func.sum(Transaction.amount).label("total"),
        )
        .where(
            Transaction.organization_id == organization_id,
            Transaction.tax_year == tax_year,
            Transaction.status == "approved",
            Transaction.tax_relevant.is_(True),
            Transaction.deleted_at.is_(None),
            Transaction.normalized_vendor.isnot(None),
        )
        .group_by(Transaction.normalized_vendor)
    )
    result = await db.execute(stmt)
    return [(row.normalized_vendor, row.total) for row in result.all()]


async def list_for_duplicate_scan(
    db: AsyncSession,
    organization_id: uuid.UUID,
    tax_year: int,
) -> list[Row]:
    """Return (id, normalized_vendor, amount, property_id, transaction_date) for duplicate scanning."""
    stmt = (
        select(
            Transaction.id,
            Transaction.normalized_vendor,
            Transaction.amount,
            Transaction.property_id,
            Transaction.transaction_date,
        )
        .where(
            Transaction.organization_id == organization_id,
            Transaction.tax_year == tax_year,
            Transaction.status == "approved",
            Transaction.deleted_at.is_(None),
            Transaction.normalized_vendor.isnot(None),
        )
        .order_by(Transaction.normalized_vendor, Transaction.amount, Transaction.transaction_date)
    )
    result = await db.execute(stmt)
    return result.all()


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


async def sum_expenses_by_year(
    db: AsyncSession,
    organization_id: uuid.UUID,
    tax_year: int,
) -> Decimal:
    """Sum all approved expense transactions for a given tax year (negative amounts)."""
    stmt = (
        select(func.coalesce(func.sum(func.abs(Transaction.amount)), Decimal("0")))
        .where(
            Transaction.organization_id == organization_id,
            Transaction.tax_year == tax_year,
            Transaction.status == "approved",
            Transaction.deleted_at.is_(None),
            Transaction.tax_relevant.is_(True),
            Transaction.amount < 0,
        )
    )
    result = await db.execute(stmt)
    return result.scalar_one()


async def flush(db: AsyncSession) -> None:
    """Flush pending changes without committing (for mid-transaction reads)."""
    await db.flush()
