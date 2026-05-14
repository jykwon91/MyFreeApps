"""Order + OrderPizza + OrderPizzaTopping repository.

Read patterns:
- ``get_order(db, order_id)`` -- eager-loads pizzas + toppings for response shaping.
- ``count_pizzas_in_slot(db, slot_id)`` -- live count for capacity check (excludes
  no-show orders so a cancelled/no-show frees up capacity if the operator later
  reopens the slot).

Write patterns:
- ``create_order_with_lines`` -- atomic create of order + N pizzas + their toppings
  in a single flush. Caller is responsible for the outer transaction boundary.
"""
from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.order.order import Order
from app.models.order.order_pizza import OrderPizza
from app.models.order.order_pizza_topping import OrderPizzaTopping


async def get_order(db: AsyncSession, order_id: uuid.UUID) -> Optional[Order]:
    stmt = (
        select(Order)
        .where(Order.id == order_id)
        .options(selectinload(Order.pizzas).selectinload(OrderPizza.toppings))
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def count_pizzas_in_slot(db: AsyncSession, slot_id: uuid.UUID) -> int:
    """Sum of pizza line items in non-no-show orders for ``slot_id``."""
    stmt = (
        select(func.count(OrderPizza.id))
        .join(Order, OrderPizza.order_id == Order.id)
        .where(Order.slot_id == slot_id)
        .where(Order.status != "no_show")
    )
    result = await db.execute(stmt)
    return int(result.scalar_one())


async def create_order_with_lines(
    db: AsyncSession,
    *,
    drop_id: uuid.UUID,
    slot_id: uuid.UUID,
    customer_id: uuid.UUID,
    payment_method_tag: str,
    pizzas: list[dict],
) -> Order:
    """Atomically create an Order plus its OrderPizza + OrderPizzaTopping rows.

    Each entry in ``pizzas`` must have:
        - ``pizza_type_id``       (uuid.UUID)
        - ``price_snapshot``      (Decimal)
        - ``modifications_text``  (Optional[str])
        - ``is_free``             (bool)
        - ``toppings``            (list of dicts with ``topping_type_id`` +
                                   ``price_delta_snapshot``)
    """
    order = Order(
        drop_id=drop_id,
        slot_id=slot_id,
        customer_id=customer_id,
        payment_method_tag=payment_method_tag,
    )
    db.add(order)
    await db.flush()  # populate order.id for FK on pizzas

    for pizza_data in pizzas:
        pizza = OrderPizza(
            order_id=order.id,
            pizza_type_id=pizza_data["pizza_type_id"],
            modifications_text=pizza_data.get("modifications_text"),
            is_free=pizza_data.get("is_free", False),
            price_snapshot=pizza_data["price_snapshot"],
        )
        db.add(pizza)
        await db.flush()
        for topping_data in pizza_data.get("toppings", []):
            db.add(
                OrderPizzaTopping(
                    order_pizza_id=pizza.id,
                    topping_type_id=topping_data["topping_type_id"],
                    price_delta_snapshot=topping_data["price_delta_snapshot"],
                ),
            )
    await db.flush()
    # Re-fetch with full eager load so callers (e.g., public confirmation
    # assembly) can iterate ``pizza.toppings`` outside the session without
    # triggering async lazy-load failures.
    refreshed = await get_order(db, order.id)
    assert refreshed is not None, "Order disappeared during create"
    return refreshed
