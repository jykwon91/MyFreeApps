"""Analytics repository — utility trend aggregations.

A bill split across properties counts each share for its own property
(``property_allocation``).
"""
import uuid
from collections.abc import Sequence
from datetime import date

from sqlalchemy import select, func, and_, Row, case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import Label

from app.core.tags import UTILITY_UNTYPED_BUCKET
from app.models.properties.property import Property
from app.models.transactions.transaction import Transaction
from app.repositories.transactions.property_allocation import (
    ALLOCATED_AMOUNT,
    ALLOCATED_PROPERTY_ID,
    allocated,
)


def _utility_bucket() -> Label[str]:
    return func.coalesce(Transaction.sub_category, UTILITY_UNTYPED_BUCKET).label("sub_category")


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
    ]
    if start_date is not None:
        filters.append(Transaction.transaction_date >= start_date)
    if end_date is not None:
        filters.append(Transaction.transaction_date <= end_date)
    if property_ids:
        filters.append(ALLOCATED_PROPERTY_ID.in_(property_ids))
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
    bucket_col = _utility_bucket()

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
        allocated(select(
            year_col,
            group_col,
            bucket_col,
            ALLOCATED_PROPERTY_ID.label("property_id"),
            Property.name.label("property_name"),
            func.sum(ALLOCATED_AMOUNT).label("total"),
        )
        .select_from(Transaction))
        .outerjoin(Property, ALLOCATED_PROPERTY_ID == Property.id)
        .where(and_(*filters))
        .group_by(
            year_col,
            group_col,
            bucket_col,
            ALLOCATED_PROPERTY_ID,
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
    bucket_col = _utility_bucket()
    result = await db.execute(
        allocated(select(
            bucket_col,
            func.sum(ALLOCATED_AMOUNT).label("total"),
        )
        .select_from(Transaction))
        .where(and_(*filters))
        .group_by(bucket_col)
    )
    return result.all()
