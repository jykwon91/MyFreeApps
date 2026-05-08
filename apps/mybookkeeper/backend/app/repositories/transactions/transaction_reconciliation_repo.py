import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import Integer, Row, func, or_, select, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import aliased, selectinload
from sqlalchemy.sql.expression import FunctionElement

from app.core.vendors import normalize_vendor
from app.models.extraction.extraction import Extraction
from app.models.transactions.transaction import Transaction


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


async def summary_by_property(
    db: AsyncSession,
    organization_id: uuid.UUID,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    tax_year: int | None = None,
) -> list[Row]:
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
) -> list[Row]:
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
