"""Summary repository — transaction-based financial aggregations."""
import uuid
from collections.abc import Sequence
from datetime import date, datetime

from sqlalchemy import select, func, and_, extract, Row
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.spending_category_enums import TRANSACTION_SCOPE_PERSONAL
from app.core.tags import TRANSACTION_TYPE_TRANSFER
from app.models.properties.property import Property
from app.models.transactions.transaction import Transaction


def _build_txn_filters(
    organization_id: uuid.UUID,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    property_ids: list[uuid.UUID] | None = None,
    tax_year: int | None = None,
    tax_relevant_only: bool = False,
    exclude_capital_improvements: bool = False,
) -> list:
    filters = [
        Transaction.organization_id == organization_id,
        Transaction.deleted_at.is_(None),
        Transaction.status == "approved",
        # Moving money between your own accounts is neither earned nor spent.
        # Category-set sums would skip it anyway; this keeps every figure built
        # on these filters (by-tag, by-month, years with data) honest too.
        Transaction.transaction_type != TRANSACTION_TYPE_TRANSFER,
        # Personal spending is never on a tax form; exclude it from every
        # financial summary and analytics figure.
        Transaction.transaction_scope != TRANSACTION_SCOPE_PERSONAL,
    ]
    if start_date is not None:
        filters.append(Transaction.transaction_date >= start_date)
    if end_date is not None:
        filters.append(Transaction.transaction_date <= end_date)
    if property_ids:
        filters.append(Transaction.property_id.in_(property_ids))
    if tax_year is not None:
        filters.append(Transaction.tax_year == tax_year)
    if tax_relevant_only:
        filters.append(Transaction.tax_relevant.is_(True))
    if exclude_capital_improvements:
        filters.append(Transaction.is_capital_improvement.is_(False))
    return filters


async def distinct_transaction_years(
    db: AsyncSession,
    organization_id: uuid.UUID,
) -> Sequence[int]:
    """Return the distinct years that have approved, non-deleted transactions.

    Deliberately unscoped by date range and property: the dashboard year
    dropdown must always offer every data-bearing year regardless of the
    currently selected year or property filter. Applies the same base filters
    as the month aggregation so every year returned will actually render data
    when selected.
    """
    filters = _build_txn_filters(organization_id)
    result = await db.execute(
        select(extract("year", Transaction.transaction_date).label("year"))
        .select_from(Transaction)
        .where(and_(*filters))
        .group_by("year")
        .order_by("year")
    )
    return [int(row.year) for row in result.all()]


async def txn_sum_by_category(
    db: AsyncSession,
    organization_id: uuid.UUID,
    *,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    property_ids: list[uuid.UUID] | None = None,
    tax_year: int | None = None,
    tax_relevant_only: bool = False,
    exclude_capital_improvements: bool = False,
) -> Sequence[Row]:
    filters = _build_txn_filters(
        organization_id,
        start_date=start_date,
        end_date=end_date,
        property_ids=property_ids,
        tax_year=tax_year,
        tax_relevant_only=tax_relevant_only,
        exclude_capital_improvements=exclude_capital_improvements,
    )
    result = await db.execute(
        select(
            Transaction.category.label("tag"),
            func.sum(Transaction.amount).label("total"),
        )
        .select_from(Transaction)
        .where(and_(*filters))
        .group_by(Transaction.category)
    )
    return result.all()


async def txn_sum_by_property_and_category(
    db: AsyncSession,
    organization_id: uuid.UUID,
    *,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    property_ids: list[uuid.UUID] | None = None,
    tax_year: int | None = None,
    tax_relevant_only: bool = False,
    exclude_capital_improvements: bool = False,
) -> Sequence[Row]:
    filters = _build_txn_filters(
        organization_id, start_date=start_date, end_date=end_date, property_ids=property_ids,
        tax_year=tax_year, tax_relevant_only=tax_relevant_only,
        exclude_capital_improvements=exclude_capital_improvements,
    )
    result = await db.execute(
        select(
            Transaction.property_id,
            Property.name.label("property_name"),
            Transaction.category.label("tag"),
            func.sum(Transaction.amount).label("total"),
        )
        .select_from(Transaction)
        .outerjoin(Property, Transaction.property_id == Property.id)
        .where(and_(*filters))
        .group_by(Transaction.property_id, Property.name, Transaction.category)
    )
    return result.all()


async def txn_sum_by_attributed_property_and_category(
    db: AsyncSession,
    organization_id: uuid.UUID,
    *,
    start_date: date,
    end_date: date,
) -> Sequence[Row]:
    """Approved transaction totals per (property_id, category), only for rows with a property."""
    filters = _build_txn_filters(organization_id, start_date=start_date, end_date=end_date)
    filters.append(Transaction.property_id.is_not(None))
    result = await db.execute(
        select(
            Transaction.property_id,
            Transaction.category,
            func.sum(Transaction.amount).label("total"),
        )
        .where(and_(*filters))
        .group_by(Transaction.property_id, Transaction.category)
    )
    return result.all()


async def txn_sum_by_month_and_category(
    db: AsyncSession,
    organization_id: uuid.UUID,
    *,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    property_ids: list[uuid.UUID] | None = None,
) -> Sequence[Row]:
    filters = _build_txn_filters(
        organization_id, start_date=start_date, end_date=end_date, property_ids=property_ids,
    )
    result = await db.execute(
        select(
            extract("year", Transaction.transaction_date).label("year"),
            extract("month", Transaction.transaction_date).label("month"),
            Transaction.category.label("tag"),
            func.sum(Transaction.amount).label("total"),
        )
        .select_from(Transaction)
        .where(and_(*filters))
        .group_by("year", "month", Transaction.category)
        .order_by("year", "month")
    )
    return result.all()


async def txn_sum_by_property_month_and_category(
    db: AsyncSession,
    organization_id: uuid.UUID,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    property_ids: list[uuid.UUID] | None = None,
    exclude_capital_improvements: bool = False,
) -> Sequence[Row]:
    filters = _build_txn_filters(
        organization_id, start_date=start_date, end_date=end_date, property_ids=property_ids,
        exclude_capital_improvements=exclude_capital_improvements,
    )
    result = await db.execute(
        select(
            Transaction.property_id,
            Property.name.label("property_name"),
            extract("year", Transaction.transaction_date).label("year"),
            extract("month", Transaction.transaction_date).label("month"),
            Transaction.category.label("tag"),
            func.sum(Transaction.amount).label("total"),
        )
        .select_from(Transaction)
        .outerjoin(Property, Transaction.property_id == Property.id)
        .where(and_(*filters))
        .group_by(Transaction.property_id, Property.name, "year", "month", Transaction.category)
        .order_by(Transaction.property_id, "year", "month")
    )
    return result.all()
