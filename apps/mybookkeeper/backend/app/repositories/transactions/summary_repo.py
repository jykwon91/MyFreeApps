"""Summary repository — transaction-based financial aggregations."""
import uuid
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import select, func, and_, or_, extract, Row
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.properties.activity_period import ActivityPeriod
from app.models.properties.property import Property
from app.models.transactions.transaction import Transaction


def _build_txn_filters(
    organization_id: uuid.UUID,
    *,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    property_ids: list[uuid.UUID] | None = None,
    tax_relevant_only: bool = False,
) -> list:
    filters = [
        Transaction.organization_id == organization_id,
        Transaction.deleted_at.is_(None),
        Transaction.status == "approved",
    ]
    if start_date is not None:
        filters.append(Transaction.transaction_date >= start_date)
    if end_date is not None:
        filters.append(Transaction.transaction_date <= end_date)
    if property_ids:
        filters.append(Transaction.property_id.in_(property_ids))
    if tax_relevant_only:
        filters.append(Transaction.tax_relevant.is_(True))
    return filters


def _txn_active_property_filter() -> list:
    """Filter transactions to active properties or within activity periods."""
    has_matching_period = select(ActivityPeriod.id).where(
        ActivityPeriod.property_id == Transaction.property_id,
        Transaction.transaction_date >= ActivityPeriod.active_from,
        Transaction.transaction_date <= ActivityPeriod.active_until,
    ).correlate(Transaction).exists()

    return [
        or_(
            Property.is_active == True,  # noqa: E712
            has_matching_period,
        )
    ]


async def txn_sum_by_category(
    db: AsyncSession,
    organization_id: uuid.UUID,
    *,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    property_ids: list[uuid.UUID] | None = None,
    tax_relevant_only: bool = False,
) -> Sequence[Row]:
    filters = _build_txn_filters(
        organization_id,
        start_date=start_date,
        end_date=end_date,
        property_ids=property_ids,
        tax_relevant_only=tax_relevant_only,
    )
    result = await db.execute(
        select(
            Transaction.category.label("tag"),
            func.sum(Transaction.amount).label("total"),
        )
        .select_from(Transaction)
        .outerjoin(Property, Transaction.property_id == Property.id)
        .where(and_(*filters, *_txn_active_property_filter()))
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
    tax_relevant_only: bool = False,
) -> Sequence[Row]:
    filters = _build_txn_filters(
        organization_id, start_date=start_date, end_date=end_date, property_ids=property_ids,
        tax_relevant_only=tax_relevant_only,
    )
    result = await db.execute(
        select(
            Transaction.property_id,
            Property.name.label("property_name"),
            Transaction.category.label("tag"),
            func.sum(Transaction.amount).label("total"),
        )
        .select_from(Transaction)
        .join(Property, Transaction.property_id == Property.id)
        .where(and_(*filters, Transaction.property_id.isnot(None), *_txn_active_property_filter()))
        .group_by(Transaction.property_id, Property.name, Transaction.category)
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
        .outerjoin(Property, Transaction.property_id == Property.id)
        .where(and_(*filters, *_txn_active_property_filter()))
        .group_by("year", "month", Transaction.category)
        .order_by("year", "month")
    )
    return result.all()


async def txn_sum_by_property_month_and_category(
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
            Transaction.property_id,
            Property.name.label("property_name"),
            extract("year", Transaction.transaction_date).label("year"),
            extract("month", Transaction.transaction_date).label("month"),
            Transaction.category.label("tag"),
            func.sum(Transaction.amount).label("total"),
        )
        .select_from(Transaction)
        .join(Property, Transaction.property_id == Property.id)
        .where(and_(*filters, Transaction.property_id.isnot(None), *_txn_active_property_filter()))
        .group_by(Transaction.property_id, Property.name, "year", "month", Transaction.category)
        .order_by(Transaction.property_id, "year", "month")
    )
    return result.all()
