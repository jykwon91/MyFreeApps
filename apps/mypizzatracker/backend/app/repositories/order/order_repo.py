"""Order + OrderPizza + OrderPizzaTopping repository.

Read patterns:
- ``get_order(db, order_id)`` -- eager-loads pizzas + toppings for response shaping.
- ``count_pizzas_in_slot(db, slot_id)`` -- live count for capacity check (excludes
  no-show orders so a cancelled/no-show frees up capacity if the operator later
  reopens the slot).
- ``count_pizzas_by_slot(db, slot_ids)`` -- the same count for many slots in one
  grouped query (slots with no pizzas map to 0).

Write patterns:
- ``create_order_with_lines`` -- atomic create of order + N pizzas + their toppings
  in a single flush. Caller is responsible for the outer transaction boundary.
"""
from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.order.order import Order
from app.models.order.order_pizza import OrderPizza
from app.models.order.order_pizza_topping import OrderPizzaTopping


async def get_order(
    db: AsyncSession, order_id: uuid.UUID, *, for_update: bool = False,
) -> Optional[Order]:
    """``for_update`` locks the order row until the transaction ends."""
    stmt = (
        select(Order)
        .where(Order.id == order_id)
        .options(selectinload(Order.pizzas).selectinload(OrderPizza.toppings))
    )
    if for_update:
        stmt = stmt.with_for_update(of=Order)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def update_order(db: AsyncSession, order: Order, patch: dict) -> Order:
    """Apply ``patch`` and return the order re-read with pizzas + toppings."""
    for key, value in patch.items():
        setattr(order, key, value)
    await db.flush()
    refreshed = await get_order(db, order.id)
    assert refreshed is not None, "Order disappeared during update"
    return refreshed


async def list_counted_orders_for_drop(
    db: AsyncSession, drop_id: uuid.UUID,
) -> list[Order]:
    """Non-no-show orders for a drop, with pizzas + toppings loaded."""
    stmt = (
        select(Order)
        .where(Order.drop_id == drop_id)
        .where(Order.status != "no_show")
        .options(selectinload(Order.pizzas).selectinload(OrderPizza.toppings))
    )
    return list((await db.execute(stmt)).scalars().all())


async def list_orders_for_slots(
    db: AsyncSession, slot_ids: list[uuid.UUID],
) -> list[Order]:
    """Orders in any of ``slot_ids``, oldest first, with pizzas + toppings."""
    stmt = (
        select(Order)
        .where(Order.slot_id.in_(slot_ids))
        .options(selectinload(Order.pizzas).selectinload(OrderPizza.toppings))
        .order_by(Order.created_at.asc())
    )
    return list((await db.execute(stmt)).scalars().all())


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


async def count_pizzas_by_slot(
    db: AsyncSession, slot_ids: list[uuid.UUID],
) -> dict[uuid.UUID, int]:
    """Per-slot pizza counts (same rules as ``count_pizzas_in_slot``) in one query.

    Every id in ``slot_ids`` is present in the result; slots with no counted
    pizzas map to 0.
    """
    if not slot_ids:
        return {}
    stmt = (
        select(Order.slot_id, func.count(OrderPizza.id))
        .join(OrderPizza, OrderPizza.order_id == Order.id)
        .where(Order.slot_id.in_(slot_ids))
        .where(Order.status != "no_show")
        .group_by(Order.slot_id)
    )
    counts = {slot_id: int(n) for slot_id, n in (await db.execute(stmt)).all()}
    return {slot_id: counts.get(slot_id, 0) for slot_id in slot_ids}


async def slot_has_orders(db: AsyncSession, slot_id: uuid.UUID) -> bool:
    """Whether any order (of any status, no-shows included) points at ``slot_id``."""
    stmt = select(exists().where(Order.slot_id == slot_id))
    return bool((await db.execute(stmt)).scalar_one())


async def pizza_type_has_orders(db: AsyncSession, pizza_type_id: uuid.UUID) -> bool:
    """Whether any order line uses ``pizza_type_id``."""
    stmt = select(exists().where(OrderPizza.pizza_type_id == pizza_type_id))
    return bool((await db.execute(stmt)).scalar_one())


async def topping_type_has_orders(
    db: AsyncSession, topping_type_id: uuid.UUID,
) -> bool:
    """Whether any order line has ``topping_type_id`` on it."""
    stmt = select(
        exists().where(OrderPizzaTopping.topping_type_id == topping_type_id),
    )
    return bool((await db.execute(stmt)).scalar_one())


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


async def list_all_orders(db: AsyncSession) -> list[Order]:
    """Every order with its pizzas and toppings, oldest first (used by the data export)."""
    stmt = (
        select(Order)
        .options(selectinload(Order.pizzas).selectinload(OrderPizza.toppings))
        .order_by(Order.created_at.asc(), Order.id.asc())
    )
    return list((await db.execute(stmt)).scalars().all())
