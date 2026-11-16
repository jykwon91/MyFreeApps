import uuid
from collections.abc import Sequence
from typing import Any, Unpack

from sqlalchemy import ColumnElement, Row, Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from app.core.property_constants import UNASSIGNED_PROPERTY_ID
from app.core.tags import EXPENSE_TAGS, NON_DEDUCTIBLE_TAGS, REVENUE_TAGS
from app.core.transaction_sort_constants import (
    DEFAULT_SORT_DIRECTION,
    DEFAULT_TRANSACTION_SORT_FIELD,
    TransactionSortField,
)
from app.core.transaction_statuses import REVIEWABLE_STATUSES
from app.models.extraction.extraction import Extraction
from app.models.properties.property import Property
from app.models.transactions.transaction import Transaction
from app.models.transactions.transaction_document import TransactionDocument
from app.repositories.transactions.summary_repo import txn_active_property_filter
from app.repositories.transactions.transaction_filter_args import TransactionFilterArgs
from app.schemas.transactions.transaction_sort_key import TransactionSortKey

# Case-insensitive, and a blank vendor counts as a missing one. Not normalized_vendor:
# it drops company suffixes and is only filled by ORM events, not every write path.
_VENDOR_SORT_KEY = func.lower(func.nullif(func.trim(Transaction.vendor), ""))

# Joined only to order by the property's name; aliased so it can't clash with the
# active_properties_only join. A row with no property sorts as an empty name, first
# ascending, as the web table always sorted it.
_SORT_PROPERTY = aliased(Property)
_PROPERTY_SORT_KEY = func.lower(func.coalesce(_SORT_PROPERTY.name, ""))

_SORT_COLUMNS: dict[TransactionSortField, ColumnElement[Any]] = {
    "transaction_date": Transaction.transaction_date,
    "amount": Transaction.amount,
    "vendor": _VENDOR_SORT_KEY,
    "category": Transaction.category,
    "status": Transaction.status,
    "transaction_type": Transaction.transaction_type,
    "property_id": _PROPERTY_SORT_KEY,
    "tax_relevant": Transaction.tax_relevant,
}

_NULLABLE_SORT_FIELDS: frozenset[TransactionSortField] = frozenset({"vendor"})

_DEFAULT_SORT = (TransactionSortKey(DEFAULT_TRANSACTION_SORT_FIELD, DEFAULT_SORT_DIRECTION),)


def _order_term(key: TransactionSortKey) -> ColumnElement[Any]:
    column = _SORT_COLUMNS[key.field]
    term = column.asc() if key.direction == "asc" else column.desc()
    if key.field in _NULLABLE_SORT_FIELDS:
        # A missing vendor sorts last either way. Not applied to NOT NULL columns,
        # where it would keep Postgres from using ix_txn_org_date for the default order.
        term = term.nulls_last()
    return term


def _any_property(property_ids: Sequence[uuid.UUID | str]) -> ColumnElement[bool]:
    """Rows of any of these properties; UNASSIGNED_PROPERTY_ID stands for rows with no property."""
    ids = [p for p in property_ids if isinstance(p, uuid.UUID)]
    conditions: list[ColumnElement[bool]] = []
    if ids:
        conditions.append(Transaction.property_id.in_(ids))
    if UNASSIGNED_PROPERTY_ID in property_ids:
        conditions.append(Transaction.property_id.is_(None))
    return or_(*conditions)


def _filtered(
    stmt: Select[Any],
    organization_id: uuid.UUID,
    **filters: Unpack[TransactionFilterArgs],
) -> Select[Any]:
    """Narrows a select over Transaction the one way the list and its count both read."""
    stmt = stmt.where(
        Transaction.organization_id == organization_id,
        Transaction.deleted_at.is_(None),
    )
    if (property_id := filters.get("property_id")) is not None:
        stmt = stmt.where(Transaction.property_id == property_id)
    if filters.get("unassigned"):
        stmt = stmt.where(Transaction.property_id.is_(None))
    if (applicant_id := filters.get("applicant_id")) is not None:
        stmt = stmt.where(Transaction.applicant_id == applicant_id)
    if (status := filters.get("status")) is not None:
        stmt = stmt.where(Transaction.status == status)
    if filters.get("to_review"):
        stmt = stmt.where(Transaction.status.in_(REVIEWABLE_STATUSES))
    if (transaction_type := filters.get("transaction_type")) is not None:
        stmt = stmt.where(Transaction.transaction_type == transaction_type)
    if (category := filters.get("category")) is not None:
        stmt = stmt.where(Transaction.category == category)
    if (vendor := filters.get("vendor")) is not None:
        stmt = stmt.where(Transaction.vendor.icontains(vendor, autoescape=True))
    if (start_date := filters.get("start_date")) is not None:
        stmt = stmt.where(Transaction.transaction_date >= start_date)
    if (end_date := filters.get("end_date")) is not None:
        stmt = stmt.where(Transaction.transaction_date <= end_date)
    if (tax_year := filters.get("tax_year")) is not None:
        stmt = stmt.where(Transaction.tax_year == tax_year)
    if (tax_relevant := filters.get("tax_relevant")) is not None:
        stmt = stmt.where(Transaction.tax_relevant.is_(tax_relevant))
    if (summary_kind := filters.get("summary_kind")) is not None:
        stmt = stmt.where(Transaction.category.in_(REVENUE_TAGS if summary_kind == "revenue" else EXPENSE_TAGS))
    if statuses := filters.get("statuses"):
        stmt = stmt.where(Transaction.status.in_(statuses))
    if transaction_types := filters.get("transaction_types"):
        stmt = stmt.where(Transaction.transaction_type.in_(transaction_types))
    if categories := filters.get("categories"):
        stmt = stmt.where(Transaction.category.in_(categories))
    if property_ids := filters.get("property_ids"):
        stmt = stmt.where(_any_property(property_ids))
    if filters.get("active_properties_only"):
        stmt = stmt.outerjoin(Property, Transaction.property_id == Property.id).where(*txn_active_property_filter())
    return stmt


async def list_filtered(
    db: AsyncSession,
    organization_id: uuid.UUID,
    *,
    sort: Sequence[TransactionSortKey] = _DEFAULT_SORT,
    limit: int | None = None,
    offset: int | None = None,
    **filters: Unpack[TransactionFilterArgs],
) -> Sequence[Transaction]:
    """The matching rows in ``sort`` order, most significant key first."""
    stmt = _filtered(
        select(Transaction).options(
            selectinload(Transaction.extraction).selectinload(Extraction.document),
            selectinload(Transaction.linked_documents).selectinload(TransactionDocument.document),
        ),
        organization_id,
        **filters,
    )

    if any(key.field == "property_id" for key in sort):
        stmt = stmt.outerjoin(_SORT_PROPERTY, Transaction.property_id == _SORT_PROPERTY.id)
    # Newest first, then id, break ties: rows sharing every sort value would
    # otherwise repeat or go missing between pages.
    stmt = stmt.order_by(*(_order_term(key) for key in sort), Transaction.transaction_date.desc(), Transaction.id.desc())

    if offset is not None:
        stmt = stmt.offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)

    result = await db.execute(stmt)
    return result.scalars().all()


async def count_filtered(
    db: AsyncSession,
    organization_id: uuid.UUID,
    **filters: Unpack[TransactionFilterArgs],
) -> int:
    """How many rows ``list_filtered`` would return across every page for the same filters."""
    stmt = _filtered(select(func.count()).select_from(Transaction), organization_id, **filters)
    result = await db.execute(stmt)
    return result.scalar_one()


async def list_selection_refs(
    db: AsyncSession,
    organization_id: uuid.UUID,
    **filters: Unpack[TransactionFilterArgs],
) -> Sequence[Row[tuple[uuid.UUID, uuid.UUID | None, str]]]:
    """(id, property_id, status) of every row the filters match: what "select all" ticks."""
    stmt = _filtered(select(Transaction.id, Transaction.property_id, Transaction.status), organization_id, **filters)
    result = await db.execute(stmt)
    return result.all()


async def list_distinct_categories(
    db: AsyncSession,
    organization_id: uuid.UUID,
    **filters: Unpack[TransactionFilterArgs],
) -> list[str]:
    """The categories at least one matching row has, alphabetically."""
    stmt = _filtered(select(Transaction.category).distinct(), organization_id, **filters).order_by(Transaction.category)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def count_to_review(db: AsyncSession, organization_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(Transaction)
        .where(
            Transaction.organization_id == organization_id,
            Transaction.deleted_at.is_(None),
            Transaction.status.in_(REVIEWABLE_STATUSES),
        )
    )
    return result.scalar_one()


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
            Transaction.category.notin_(NON_DEDUCTIBLE_TAGS),
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
            Transaction.category.notin_(NON_DEDUCTIBLE_TAGS),
        )
        .group_by(Transaction.property_id, Transaction.schedule_e_line)
    )
    result = await db.execute(stmt)
    return result.all()
