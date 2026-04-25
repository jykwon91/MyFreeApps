"""Analytics repository — utility trend aggregations."""
import uuid
from collections.abc import Sequence
from datetime import date

from sqlalchemy import select, func, and_, Row, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.properties.property import Property
from app.models.transactions.transaction import Transaction


def _build_utility_filters(
    organization_id: uuid.UUID,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    property_ids: list[uuid.UUID] | None = None,
) -> list:
    filters = [
        Transaction.organization_id == organization_id,
        Transaction.deleted_at.is_(None),
        Transaction.status == "approved",
        Transaction.category == "utilities",
        Transaction.sub_category.isnot(None),
    ]
    if start_date is not None:
        filters.append(Transaction.transaction_date >= start_date)
    if end_date is not None:
        filters.append(Transaction.transaction_date <= end_date)
    if property_ids:
        filters.append(Transaction.property_id.in_(property_ids))
    return filters


async def get_utility_trends(
    db: AsyncSession,
    organization_id: uuid.UUID,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    property_ids: list[uuid.UUID] | None = None,
    granularity: str = "monthly",
) -> Sequence[Row]:
    """Return utility spend grouped by time bucket, sub_category, and property.

    Uses extract(year/month/quarter) so the query works on both PostgreSQL
    (production) and SQLite (tests).  The service layer formats these numeric
    fields into the final period string (e.g. "2025-01" or "2025-Q1").
    """
    filters = _build_utility_filters(
        organization_id,
        start_date=start_date,
        end_date=end_date,
        property_ids=property_ids,
    )

    year_col = func.extract("year", Transaction.transaction_date).label("year")

    if granularity == "quarterly":
        # Map month → quarter number using a CASE expression (portable across DBs)
        quarter_col = case(
            (func.extract("month", Transaction.transaction_date).in_([1, 2, 3]), 1),
            (func.extract("month", Transaction.transaction_date).in_([4, 5, 6]), 2),
            (func.extract("month", Transaction.transaction_date).in_([7, 8, 9]), 3),
            else_=4,
        ).label("quarter")
        group_col = quarter_col
    else:
        group_col = func.extract("month", Transaction.transaction_date).label("month")

    result = await db.execute(
        select(
            year_col,
            group_col,
            Transaction.sub_category,
            Transaction.property_id,
            Property.name.label("property_name"),
            func.sum(Transaction.amount).label("total"),
        )
        .select_from(Transaction)
        .outerjoin(Property, Transaction.property_id == Property.id)
        .where(and_(*filters))
        .group_by(
            year_col,
            group_col,
            Transaction.sub_category,
            Transaction.property_id,
            Property.name,
        )
        .order_by(year_col, group_col)
    )
    return result.all()


async def get_utility_summary(
    db: AsyncSession,
    organization_id: uuid.UUID,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    property_ids: list[uuid.UUID] | None = None,
) -> Sequence[Row]:
    """Return total utility spend per sub_category (no time dimension)."""
    filters = _build_utility_filters(
        organization_id,
        start_date=start_date,
        end_date=end_date,
        property_ids=property_ids,
    )
    result = await db.execute(
        select(
            Transaction.sub_category,
            func.sum(Transaction.amount).label("total"),
        )
        .select_from(Transaction)
        .where(and_(*filters))
        .group_by(Transaction.sub_category)
    )
    return result.all()
