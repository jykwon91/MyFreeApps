"""Assembly for customer-facing (public) responses.

Acts as a view layer: takes domain models (Drop, Order, PizzaType, ...) and
returns the slimmer ``Public*`` Pydantic shapes. The order placement logic
itself lives in :mod:`app.services.order.order_service`; this module only
shapes responses.
"""
from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer.customer import Customer
from app.models.drop.drop import Drop
from app.models.menu.pizza_type import PizzaType
from app.models.menu.topping_type import ToppingType
from app.models.order.order import Order
from app.repositories.customer import customer_repo
from app.repositories.menu import menu_repo
from app.schemas.public.public_schemas import (
    PublicCustomerLookup,
    PublicDropRead,
    PublicMenuRead,
    PublicOrderConfirmation,
    PublicOrderPizzaConfirmation,
    PublicPizzaRead,
    PublicSlotRead,
    PublicTheUsualPizza,
    PublicToppingRead,
)
from app.services.customer import customer_service
from app.services.order import order_service


async def build_public_menu(db: AsyncSession) -> PublicMenuRead:
    """Return active pizzas + toppings only, alphabetized for stable display."""
    pizzas = await menu_repo.list_pizzas(db, active_only=True)
    toppings = await menu_repo.list_toppings(db, active_only=True)
    return PublicMenuRead(
        pizzas=[
            PublicPizzaRead(
                id=p.id,
                name=p.name,
                price=Decimal(p.price),
                description=p.description,
            )
            for p in sorted(pizzas, key=lambda r: r.name.lower())
        ],
        toppings=[
            PublicToppingRead(
                id=t.id,
                name=t.name,
                price_delta=Decimal(t.price_delta),
            )
            for t in sorted(toppings, key=lambda r: r.name.lower())
        ],
    )


async def build_current_drop(db: AsyncSession) -> PublicDropRead | None:
    """Return the current active drop with per-slot remaining capacity.

    Returns ``None`` when there is no active drop.
    """
    drop = await order_service.get_current_drop(db)
    if drop is None:
        return None

    slot_payloads: list[PublicSlotRead] = []
    # Sort slots by pickup_time for predictable rendering.
    for slot in sorted(drop.slots, key=lambda s: s.pickup_time):
        remaining = await order_service.slot_remaining_capacity(db, slot)
        slot_payloads.append(
            PublicSlotRead(
                id=slot.id,
                pickup_time=slot.pickup_time,
                max_pizzas=slot.max_pizzas,
                remaining_pizzas=remaining,
            ),
        )

    return PublicDropRead(
        id=drop.id,
        name=drop.name,
        date=drop.date,
        slot_window_start=drop.slot_window_start,
        slot_window_end=drop.slot_window_end,
        slots=slot_payloads,
    )


async def build_order_confirmation(
    db: AsyncSession, order: Order,
) -> PublicOrderConfirmation:
    """Assemble the post-placement confirmation payload.

    Looks up pizza + topping names by ID so the customer sees human-readable
    line items, not UUIDs.
    """
    drop = await _load_drop(db, order.drop_id)
    slot = await _load_slot_pickup_time(db, order.slot_id)
    customer = await _load_customer(db, order.customer_id)
    pizza_type_ids = {p.pizza_type_id for p in order.pizzas}
    topping_type_ids: set[uuid.UUID] = set()
    for pizza in order.pizzas:
        topping_type_ids.update(t.topping_type_id for t in pizza.toppings)
    pizza_types = await _load_pizza_types(db, pizza_type_ids)
    topping_types = await _load_topping_types(db, topping_type_ids)

    pizza_lines: list[PublicOrderPizzaConfirmation] = []
    for pizza in order.pizzas:
        pizza_type = pizza_types[pizza.pizza_type_id]
        topping_names: list[str] = []
        topping_total = Decimal("0.00")
        for topping_row in pizza.toppings:
            topping_type = topping_types[topping_row.topping_type_id]
            topping_names.append(topping_type.name)
            topping_total += topping_row.price_delta_snapshot
        line_total = (pizza.price_snapshot + topping_total) if not pizza.is_free else Decimal("0.00")
        pizza_lines.append(
            PublicOrderPizzaConfirmation(
                pizza_name=pizza_type.name,
                pizza_price=pizza.price_snapshot,
                toppings=sorted(topping_names, key=str.lower),
                toppings_price_delta_total=topping_total,
                modifications_text=pizza.modifications_text,
                line_total=line_total,
            ),
        )

    total = order_service.compute_order_total(order)

    return PublicOrderConfirmation(
        order_id=order.id,
        drop_name=drop.name,
        drop_date=drop.date,
        slot_pickup_time=slot,
        customer_name=customer.name,
        customer_phone=customer.phone,
        payment_method_tag=order.payment_method_tag,
        payment_status=order.payment_status,
        status=order.status,
        pizzas=pizza_lines,
        total=total,
        created_at=order.created_at,
    )


async def build_customer_lookup(
    db: AsyncSession, raw_phone: str,
) -> PublicCustomerLookup | None:
    """Return a "welcome back" + "the usual" payload for a phone, or ``None``.

    "The usual" is built from the customer's most recent non-no-show order,
    filtered to only pizzas / toppings still ``active`` in the menu. If
    every line had its pizza 86'd, the_usual is an empty list -- the
    frontend treats that as "show welcome banner, hide the usual button".
    """
    customer = await customer_service.find_by_normalized_phone(db, raw_phone)
    if customer is None:
        return None

    recent = await customer_repo.get_recent_order_for_customer(db, customer.id)
    if recent is None:
        return PublicCustomerLookup(customer_name=customer.name, the_usual=[])

    pizza_type_ids = {p.pizza_type_id for p in recent.pizzas}
    topping_type_ids: set[uuid.UUID] = set()
    for pizza in recent.pizzas:
        topping_type_ids.update(t.topping_type_id for t in pizza.toppings)

    pizza_types = await _load_pizza_types(db, pizza_type_ids)
    topping_types = await _load_topping_types(db, topping_type_ids)

    the_usual: list[PublicTheUsualPizza] = []
    for pizza in recent.pizzas:
        pizza_type = pizza_types.get(pizza.pizza_type_id)
        if pizza_type is None or not pizza_type.active:
            continue
        active_toppings: list[uuid.UUID] = []
        for topping_row in pizza.toppings:
            topping = topping_types.get(topping_row.topping_type_id)
            if topping is None or not topping.active:
                continue
            active_toppings.append(topping.id)
        the_usual.append(
            PublicTheUsualPizza(
                pizza_type_id=pizza_type.id,
                topping_type_ids=active_toppings,
                modifications_text=pizza.modifications_text,
            ),
        )

    return PublicCustomerLookup(
        customer_name=customer.name,
        the_usual=the_usual,
    )


# ---------------------------------------------------------------------------
# Internal lookups
# ---------------------------------------------------------------------------

async def _load_drop(db: AsyncSession, drop_id: uuid.UUID) -> Drop:
    from app.repositories.drop import drop_repo
    drop = await drop_repo.get_drop(db, drop_id)
    if drop is None:
        # An order's drop_id is FK RESTRICT, so this is unreachable in normal flow.
        raise RuntimeError(f"Drop {drop_id} referenced by order has vanished.")
    return drop


async def _load_slot_pickup_time(db: AsyncSession, slot_id: uuid.UUID):
    from app.repositories.drop import drop_repo
    slot = await drop_repo.get_slot(db, slot_id)
    if slot is None:
        raise RuntimeError(f"Slot {slot_id} referenced by order has vanished.")
    return slot.pickup_time


async def _load_customer(db: AsyncSession, customer_id: uuid.UUID) -> Customer:
    from app.repositories.customer import customer_repo
    customer = await customer_repo.get_customer_by_id(db, customer_id)
    if customer is None:
        raise RuntimeError(f"Customer {customer_id} referenced by order has vanished.")
    return customer


async def _load_pizza_types(
    db: AsyncSession, ids: set[uuid.UUID],
) -> dict[uuid.UUID, PizzaType]:
    if not ids:
        return {}
    stmt = select(PizzaType).where(PizzaType.id.in_(ids))
    result = await db.execute(stmt)
    return {row.id: row for row in result.scalars().all()}


async def _load_topping_types(
    db: AsyncSession, ids: set[uuid.UUID],
) -> dict[uuid.UUID, ToppingType]:
    if not ids:
        return {}
    stmt = select(ToppingType).where(ToppingType.id.in_(ids))
    result = await db.execute(stmt)
    return {row.id: row for row in result.scalars().all()}
