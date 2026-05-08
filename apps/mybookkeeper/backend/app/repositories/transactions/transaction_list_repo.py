import uuid
from collections.abc import Sequence
from datetime import date

from sqlalchemy import Row, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.extraction.extraction import Extraction
from app.models.transactions.transaction import Transaction
from app.models.transactions.transaction_document import TransactionDocument


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
