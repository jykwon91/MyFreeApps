"""Per-property P&L aggregation service.

Returns revenue, expenses and a category-level expense breakdown for each
property the user owns, bounded by a date range.
"""
import uuid
from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.db.session import AsyncSessionLocal
from app.models.properties.property import Property
from app.models.transactions.transaction import Transaction
from app.schemas.transactions.attribution import (
    ExpenseBreakdown,
    PropertyPnLEntry,
    PropertyPnLResponse,
)


def _to_cents(value: Decimal | None) -> int:
    if value is None:
        return 0
    return int(value * 100)


async def get_property_pnl(
    ctx: RequestContext,
    *,
    since: date,
    until: date,
) -> PropertyPnLResponse:
    """Compute per-property P&L for a date range.

    Only includes transactions with status='approved' and deleted_at IS NULL.
    Uses integer cents for all monetary values (avoids floating-point drift).
    """
    async with AsyncSessionLocal() as db:
        return await _compute_pnl(db, ctx.organization_id, since=since, until=until)


async def _compute_pnl(
    db: AsyncSession,
    organization_id: uuid.UUID,
    *,
    since: date,
    until: date,
) -> PropertyPnLResponse:
    # Fetch all matching properties
    props_result = await db.execute(
        select(Property)
        .where(
            Property.organization_id == organization_id,
        )
        .order_by(Property.name)
    )
    properties = list(props_result.scalars().all())

    # Single aggregate query: (property_id, transaction_type, category, SUM(amount))
    rows_result = await db.execute(
        select(
            Transaction.property_id,
            Transaction.transaction_type,
            Transaction.category,
            func.sum(Transaction.amount).label("total"),
        )
        .where(
            Transaction.organization_id == organization_id,
            Transaction.deleted_at.is_(None),
            Transaction.status == "approved",
            Transaction.property_id.is_not(None),
            Transaction.transaction_date >= since,
            Transaction.transaction_date <= until,
        )
        .group_by(Transaction.property_id, Transaction.transaction_type, Transaction.category)
    )

    # Index by property_id
    # revenue_by_prop: property_id → Decimal
    # expense_by_prop: property_id → Decimal
    # expense_cat_by_prop: property_id → {category → Decimal}
    revenue_by_prop: dict[uuid.UUID, Decimal] = defaultdict(Decimal)
    expense_by_prop: dict[uuid.UUID, Decimal] = defaultdict(Decimal)
    expense_cat_by_prop: dict[uuid.UUID, dict[str, Decimal]] = defaultdict(lambda: defaultdict(Decimal))

    for row in rows_result:
        prop_id = row.property_id
        if prop_id is None:
            continue
        total: Decimal = row.total or Decimal("0")
        if row.transaction_type == "income":
            revenue_by_prop[prop_id] += total
        else:
            expense_by_prop[prop_id] += total
            expense_cat_by_prop[prop_id][row.category] += total

    # Build response
    prop_id_map = {p.id: p.name for p in properties}
    all_property_ids = set(revenue_by_prop.keys()) | set(expense_by_prop.keys())

    entries: list[PropertyPnLEntry] = []
    total_revenue = 0
    total_expenses = 0

    for prop_id in all_property_ids:
        name = prop_id_map.get(prop_id, "Unknown Property")
        revenue_cents = _to_cents(revenue_by_prop.get(prop_id))
        expenses_cents = _to_cents(expense_by_prop.get(prop_id))
        net_cents = revenue_cents - expenses_cents

        breakdown = [
            ExpenseBreakdown(category=cat, amount_cents=_to_cents(amt))
            for cat, amt in sorted(expense_cat_by_prop[prop_id].items())
        ]

        entries.append(PropertyPnLEntry(
            property_id=prop_id,
            name=name,
            revenue_cents=revenue_cents,
            expenses_cents=expenses_cents,
            net_cents=net_cents,
            expense_breakdown=breakdown,
        ))

        total_revenue += revenue_cents
        total_expenses += expenses_cents

    # Sort by net descending (most profitable first)
    entries.sort(key=lambda e: e.net_cents, reverse=True)

    return PropertyPnLResponse(
        since=since,
        until=until,
        properties=entries,
        total_revenue_cents=total_revenue,
        total_expenses_cents=total_expenses,
        total_net_cents=total_revenue - total_expenses,
    )
