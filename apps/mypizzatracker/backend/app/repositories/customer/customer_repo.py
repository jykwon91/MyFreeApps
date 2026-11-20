"""Customer repository.

Thin ORM layer: lookup-by-phone + atomic upsert. Phone normalization is the service's
responsibility -- the repo just takes the already-normalized value.
"""
from __future__ import annotations

import re
import uuid
from typing import Optional

from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.customer.customer import Customer
from app.models.order.order import Order
from app.models.order.order_pizza import OrderPizza


async def get_customer_by_phone(
    db: AsyncSession, phone: str,
) -> Optional[Customer]:
    stmt = select(Customer).where(Customer.phone == phone)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_customer_by_id(
    db: AsyncSession, customer_id: uuid.UUID,
) -> Optional[Customer]:
    stmt = select(Customer).where(Customer.id == customer_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_customers_by_ids(
    db: AsyncSession, ids: set[uuid.UUID],
) -> list[Customer]:
    stmt = select(Customer).where(Customer.id.in_(ids))
    return list((await db.execute(stmt)).scalars().all())


async def upsert_customer_by_phone(
    db: AsyncSession, *, name: str, phone: str,
) -> Customer:
    """Create the customer for ``phone`` or update its name, in one atomic statement.

    ``INSERT ... ON CONFLICT (phone)`` closes the lookup-then-insert race: two
    first orders from the same new phone both succeed and share one customer
    row instead of the second hitting the unique constraint. The name is only
    rewritten (and ``updated_at`` bumped) when it actually changed.
    """
    stmt = pg_insert(Customer).values(name=name, phone=phone)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_customer_phone",
        set_={"name": stmt.excluded.name, "updated_at": func.now()},
        where=Customer.name.is_distinct_from(stmt.excluded.name),
    )
    await db.execute(stmt)
    # populate_existing so a customer already in the session shows the new name.
    result = await db.execute(
        select(Customer)
        .where(Customer.phone == phone)
        .execution_options(populate_existing=True),
    )
    return result.scalar_one()


async def update_customer(
    db: AsyncSession, customer: Customer, patch: dict,
) -> Customer:
    for key, value in patch.items():
        setattr(customer, key, value)
    await db.flush()
    return customer


async def get_recent_order_for_customer(
    db: AsyncSession, customer_id: uuid.UUID,
) -> Optional[Order]:
    """Return the customer's most recent non-no-show order, eager-loaded.

    ``no_show`` orders are excluded so "the usual" reflects pizzas the
    customer actually picked up, not ones they ghosted on.
    """
    stmt = (
        select(Order)
        .where(Order.customer_id == customer_id)
        .where(Order.status != "no_show")
        .options(selectinload(Order.pizzas).selectinload(OrderPizza.toppings))
        .order_by(Order.created_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


def _search_clauses(search: Optional[str]) -> list:
    """WHERE clauses for the operator's search box (empty when there is no search).

    Matches case-insensitively against name and against the digits-only phone
    substring, so ``"512"`` matches both ``"512-555-1234"`` and a customer
    named ``"512 Pizza Co"``.
    """
    if not search or not search.strip():
        return []
    digits = re.sub(r"\D+", "", search)
    clauses = [Customer.name.icontains(search.strip(), autoescape=True)]
    if digits:
        clauses.append(Customer.phone.like(f"%{digits}%"))
    return [or_(*clauses)]


async def count_customers(
    db: AsyncSession, *, search: Optional[str] = None,
) -> int:
    """How many customers match ``search`` across every page."""
    stmt = select(func.count(Customer.id)).where(*_search_clauses(search))
    result = await db.execute(stmt)
    return int(result.scalar_one())


async def list_customers_with_stats(
    db: AsyncSession,
    *,
    search: Optional[str] = None,
    limit: int,
    offset: int = 0,
) -> list[dict]:
    """Return one page of customers with order_count + last_order_at.

    Sorted by most-recent-order desc (customers who never ordered come last,
    alphabetised by name within each bucket). ``Customer.id`` breaks remaining
    ties so ``offset`` paging never repeats or skips a row.

    The shape is a list of dicts (not Customer rows) so callers don't need
    to know about the underlying join + subquery.
    """
    order_agg = (
        select(
            Order.customer_id.label("customer_id"),
            func.count(Order.id).label("order_count"),
            func.max(Order.created_at).label("last_order_at"),
        )
        .group_by(Order.customer_id)
        .subquery()
    )

    stmt = (
        select(
            Customer,
            order_agg.c.order_count,
            order_agg.c.last_order_at,
        )
        .outerjoin(order_agg, Customer.id == order_agg.c.customer_id)
        .where(*_search_clauses(search))
        .order_by(
            order_agg.c.last_order_at.desc().nullslast(),
            Customer.name,
            Customer.id,
        )
        .limit(limit)
        .offset(offset)
    )

    result = await db.execute(stmt)
    return [
        {
            "customer": row[0],
            "order_count": int(row[1] or 0),
            "last_order_at": row[2],
        }
        for row in result.all()
    ]


async def list_all_customers(db: AsyncSession) -> list[Customer]:
    """Every customer, oldest first (used by the data export)."""
    stmt = select(Customer).order_by(Customer.created_at.asc(), Customer.id.asc())
    return list((await db.execute(stmt)).scalars().all())
