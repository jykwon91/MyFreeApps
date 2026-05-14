"""Order placement service.

Owns the rules around creating a customer order:

1. The drop must exist and be in ``active`` status. Drops in planning or
   closed cannot receive orders.
2. The slot must exist and belong to the drop.
3. Every ``pizza_type_id`` must exist and be active (not 86'd). Same for
   every ``topping_type_id``.
4. Per-line price snapshots are captured from the current menu, not trusted
   from the client.
5. Slot capacity: existing pizza count in the slot (excluding ``no_show``
   orders) plus the new order's pizza count must not exceed
   ``slot.max_pizzas``.
6. At least one pizza line is required.
7. Duplicate toppings within a single pizza line are coalesced (no DB-level
   IntegrityError surfaces to the caller).

Errors are raised as :class:`OrderServiceError` subclasses; the API layer
maps them to HTTP. Validation order is deterministic (drop -> slot -> menu
references -> capacity -> create) so the customer sees the most relevant
error first.
"""
from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.drop.drop import Drop
from app.models.drop.slot import Slot
from app.models.menu.pizza_type import PizzaType
from app.models.menu.topping_type import ToppingType
from app.models.order.order import Order
from app.repositories.customer import customer_repo
from app.repositories.drop import drop_repo
from app.repositories.order import order_repo
from app.schemas.customer.customer_schemas import CustomerCreate
from app.services.customer import customer_service
from app.services.customer.customer_service import CustomerServiceError


class OrderServiceError(Exception):
    """Base for order placement rule violations."""

    http_status: int = 400


class DropNotOpenError(OrderServiceError):
    """Drop is not in ``active`` status -- orders are not accepted."""


class DropNotFoundError(OrderServiceError):
    http_status = 404


class SlotNotFoundError(OrderServiceError):
    http_status = 404


class SlotNotInDropError(OrderServiceError):
    pass


class SlotCapacityExceededError(OrderServiceError):
    """The slot does not have enough remaining pizza capacity."""


class UnknownPizzaError(OrderServiceError):
    """A referenced ``pizza_type_id`` does not exist."""


class InactivePizzaError(OrderServiceError):
    """A referenced pizza is 86'd."""


class UnknownToppingError(OrderServiceError):
    http_status = 400


class InactiveToppingError(OrderServiceError):
    pass


class EmptyOrderError(OrderServiceError):
    """At least one pizza line is required."""


# Wire shape for an inbound pizza line; the public schema layer hands these in.
PizzaLineInput = dict  # keys: pizza_type_id, modifications_text, topping_type_ids


async def place_order(
    db: AsyncSession,
    *,
    drop_id: uuid.UUID,
    slot_id: uuid.UUID,
    customer: CustomerCreate,
    payment_method_tag: str,
    pizza_lines: list[PizzaLineInput],
) -> Order:
    """Create a customer order in the given drop+slot.

    Returns the created Order with pizzas + toppings eagerly loaded.
    """
    if not pizza_lines:
        raise EmptyOrderError("At least one pizza is required.")

    if not (payment_method_tag or "").strip():
        raise OrderServiceError("Payment method is required.")

    # 1. Drop must exist and be active.
    drop = await drop_repo.get_drop(db, drop_id)
    if drop is None:
        raise DropNotFoundError(f"Drop {drop_id} not found")
    if drop.status != "active":
        raise DropNotOpenError(
            f"Drop is not currently accepting orders (status={drop.status!r}).",
        )

    # 2. Slot must exist and belong to the drop.
    slot = await drop_repo.get_slot(db, slot_id)
    if slot is None:
        raise SlotNotFoundError(f"Slot {slot_id} not found")
    if slot.drop_id != drop_id:
        raise SlotNotInDropError(
            f"Slot {slot_id} does not belong to drop {drop_id}.",
        )

    # 3. Resolve + validate menu references; capture price snapshots.
    pizza_type_ids = {line["pizza_type_id"] for line in pizza_lines}
    pizza_types_by_id = await _load_pizza_types(db, pizza_type_ids)

    topping_type_ids: set[uuid.UUID] = set()
    for line in pizza_lines:
        topping_type_ids.update(line.get("topping_type_ids") or [])
    topping_types_by_id = await _load_topping_types(db, topping_type_ids)

    resolved_lines: list[dict] = []
    for line in pizza_lines:
        pizza_type = pizza_types_by_id.get(line["pizza_type_id"])
        if pizza_type is None:
            raise UnknownPizzaError(
                f"Pizza {line['pizza_type_id']} not found.",
            )
        if not pizza_type.active:
            raise InactivePizzaError(
                f"{pizza_type.name!r} is not currently available.",
            )

        seen_topping_ids: set[uuid.UUID] = set()
        resolved_toppings: list[dict] = []
        for topping_id in line.get("topping_type_ids") or []:
            if topping_id in seen_topping_ids:
                continue
            seen_topping_ids.add(topping_id)
            topping = topping_types_by_id.get(topping_id)
            if topping is None:
                raise UnknownToppingError(
                    f"Topping {topping_id} not found.",
                )
            if not topping.active:
                raise InactiveToppingError(
                    f"Topping {topping.name!r} is not currently available.",
                )
            resolved_toppings.append({
                "topping_type_id": topping.id,
                "price_delta_snapshot": Decimal(topping.price_delta),
            })

        resolved_lines.append({
            "pizza_type_id": pizza_type.id,
            "modifications_text": (line.get("modifications_text") or None),
            "is_free": False,  # owner-only flag; not customer-settable
            "price_snapshot": Decimal(pizza_type.price),
            "toppings": resolved_toppings,
        })

    # 4. Slot capacity check.
    existing_count = await order_repo.count_pizzas_in_slot(db, slot_id)
    requested_count = len(resolved_lines)
    if existing_count + requested_count > slot.max_pizzas:
        remaining = max(slot.max_pizzas - existing_count, 0)
        raise SlotCapacityExceededError(
            f"Only {remaining} pizza(s) left in this slot. "
            f"Requested {requested_count}.",
        )

    # 5. Upsert the customer (by phone) -- after validation so we don't pollute
    # the customer table with orphan rows on a rejected order.
    try:
        customer_row = await customer_service.upsert_by_phone(db, customer)
    except CustomerServiceError as exc:
        raise OrderServiceError(str(exc)) from exc

    # 6. Create order + line items atomically.
    return await order_repo.create_order_with_lines(
        db,
        drop_id=drop_id,
        slot_id=slot_id,
        customer_id=customer_row.id,
        payment_method_tag=payment_method_tag.strip(),
        pizzas=resolved_lines,
    )


def compute_order_total(order: Order) -> Decimal:
    """Sum price snapshots across pizzas + their toppings.

    Free pizzas (``is_free=True``) are excluded from the total. Tip is not
    included here -- it's a drop-level field set by the operator post-service.
    """
    total = Decimal("0.00")
    for pizza in order.pizzas:
        if pizza.is_free:
            continue
        total += pizza.price_snapshot
        for topping in pizza.toppings:
            total += topping.price_delta_snapshot
    return total


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


async def get_current_drop(db: AsyncSession) -> Drop | None:
    """Return the most recent ``active`` drop, with slots loaded.

    Used by the public landing page. Returns ``None`` if no active drop
    exists -- the route maps that to a 404.
    """
    stmt = (
        select(Drop)
        .where(Drop.status == "active")
        .options(selectinload(Drop.slots))
        .order_by(Drop.date.desc(), Drop.created_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def slot_remaining_capacity(
    db: AsyncSession, slot: Slot,
) -> int:
    """Return remaining pizza capacity for a single slot."""
    count = await order_repo.count_pizzas_in_slot(db, slot.id)
    return max(slot.max_pizzas - count, 0)
