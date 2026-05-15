"""Customer repository.

Thin ORM layer: lookup-by-phone + insert. Phone normalization is the service's
responsibility -- the repo just takes the already-normalized value.
"""
from __future__ import annotations

import re
import uuid
from typing import Optional

from sqlalchemy import func, or_, select
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


async def create_customer(db: AsyncSession, data: dict) -> Customer:
    customer = Customer(**data)
    db.add(customer)
    await db.flush()
    return customer


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


async def list_customers_with_stats(
    db: AsyncSession,
    *,
    search: Optional[str] = None,
    limit: int = 200,
) -> list[dict]:
    """Return customers with order_count + last_order_at.

    Sorted by most-recent-order desc (customers who never ordered come last,
    alphabetised by name within each bucket).

    ``search`` matches case-insensitively against name and against the
    digits-only phone substring, so ``"512"`` matches both ``"512-555-1234"``
    and a customer named ``"512 Pizza Co"``.

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
    )

    if search and search.strip():
        digits = re.sub(r"\D+", "", search)
        clauses = [Customer.name.ilike(f"%{search.strip()}%")]
        if digits:
            clauses.append(Customer.phone.like(f"%{digits}%"))
        stmt = stmt.where(or_(*clauses))

    stmt = stmt.order_by(
        order_agg.c.last_order_at.desc().nullslast(),
        Customer.name,
    ).limit(limit)

    result = await db.execute(stmt)
    return [
        {
            "customer": row[0],
            "order_count": int(row[1] or 0),
            "last_order_at": row[2],
        }
        for row in result.all()
    ]
