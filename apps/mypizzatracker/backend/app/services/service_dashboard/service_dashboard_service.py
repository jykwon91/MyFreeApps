"""Operator-facing service dashboard service.

Owns:

1. The order-status state machine -- which transitions are allowed,
   what side effects each one carries (e.g., setting
   ``ready_text_sent_at`` AND firing the Twilio SMS on the
   ``ready_text_sent`` transition).
2. The slot-move policy -- target slot must belong to the same drop and
   must have enough remaining capacity for the order's pizza count.
3. The enriched dashboard payload -- a single read returns the drop +
   slots + orders with denormalized pizza/topping names so the frontend
   can render order cards without N+1 lookups.

The 6-status order state machine (from ``app/models/order/order.py``):

    not_started -> cooking | no_show
    cooking -> ready_text_sent | ready_waiting | no_show
    ready_text_sent -> ready_waiting | picked_up | no_show
    ready_waiting -> picked_up | no_show
    picked_up: terminal
    no_show: terminal

Transitioning into ``ready_text_sent`` stamps ``ready_text_sent_at`` AND,
once that change has committed, fires a Twilio SMS to the customer
(best-effort: a Twilio outage logs + returns the failure to the operator
but does NOT roll back the status change — the operator is the
authoritative record of "order is ready", the SMS is a courtesy
notification). Each mutation owns its transaction via ``unit_of_work``.

Mutations are rejected entirely if the drop is in ``closed`` status --
service is over, history is frozen.
"""
from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import unit_of_work
from app.models.customer.customer import Customer
from app.models.drop.drop import Drop
from app.models.drop.slot import Slot
from app.models.order.order import Order
from app.repositories.customer import customer_repo
from app.repositories.drop import drop_repo
from app.repositories.menu import menu_repo
from app.repositories.order import order_repo
from app.schemas.service.service_schemas import (
    DashboardCustomer,
    DashboardDrop,
    DashboardOrder,
    DashboardOrderPizza,
    DashboardOrderPizzaTopping,
    DashboardSlot,
    ServiceDashboard,
)
from app.services.service_dashboard.order_ready_text import (
    compose_ready_text,
    send_ready_text,
)
from app.services.service_dashboard.ready_text import ReadyText

# ---------------------------------------------------------------------------
# State machine
# ---------------------------------------------------------------------------

ORDER_STATUSES: tuple[str, ...] = (
    "not_started",
    "cooking",
    "ready_text_sent",
    "ready_waiting",
    "picked_up",
    "no_show",
)

TERMINAL_STATUSES: frozenset[str] = frozenset({"picked_up", "no_show"})

IN_PROGRESS_STATUSES: frozenset[str] = frozenset(
    s for s in ORDER_STATUSES if s not in TERMINAL_STATUSES
)

_ALLOWED_TRANSITIONS: frozenset[tuple[str, str]] = frozenset({
    ("not_started", "cooking"),
    ("not_started", "no_show"),
    ("cooking", "ready_text_sent"),
    ("cooking", "ready_waiting"),
    ("cooking", "no_show"),
    ("ready_text_sent", "ready_waiting"),
    ("ready_text_sent", "picked_up"),
    ("ready_text_sent", "no_show"),
    ("ready_waiting", "picked_up"),
    ("ready_waiting", "no_show"),
})


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class DashboardServiceError(Exception):
    """Base for dashboard service rule violations."""

    http_status: int = 400


class DropNotFoundError(DashboardServiceError):
    http_status = 404


class OrderNotFoundError(DashboardServiceError):
    http_status = 404


class InvalidTransitionError(DashboardServiceError):
    http_status = 409


class DropClosedForServiceError(DashboardServiceError):
    """Cannot mutate orders on a closed drop."""

    http_status = 409


class TargetSlotNotFoundError(DashboardServiceError):
    http_status = 404


class SlotNotInDropError(DashboardServiceError):
    http_status = 400


class TargetSlotCapacityError(DashboardServiceError):
    http_status = 409


# ---------------------------------------------------------------------------
# Result shapes
# ---------------------------------------------------------------------------

@dataclass
class AdvanceOrderResult:
    """Outcome of an order-status transition.

    ``sms_dispatched`` is ``None`` for every transition EXCEPT
    ``ready_text_sent`` — the only transition that attempts an SMS. A
    successful attempt sets it to True; a Twilio failure sets it to False
    and populates ``sms_error`` with a short, operator-facing message so
    the dashboard can prompt them to text manually.
    """

    order: Order
    sms_dispatched: Optional[bool] = None
    sms_error: Optional[str] = None


# ---------------------------------------------------------------------------
# Dashboard read
# ---------------------------------------------------------------------------

async def get_dashboard(db: AsyncSession, drop_id: uuid.UUID) -> ServiceDashboard:
    """Return the enriched dashboard payload for a single drop."""
    drop = await _get_drop(db, drop_id)

    slots = await drop_repo.list_slots_for_drop(db, drop_id)
    slot_ids = [slot.id for slot in slots]
    orders_by_slot = await _load_orders_by_slot(db, slot_ids)
    pizza_names, topping_names = await _load_menu_names(db, orders_by_slot)

    in_progress_count = 0
    dashboard_slots: list[DashboardSlot] = []
    for slot in slots:
        slot_orders = orders_by_slot.get(slot.id, [])
        dashboard_orders: list[DashboardOrder] = []
        non_no_show_pizza_count = 0
        for order in slot_orders:
            order_pizza_count = len(order.pizzas)
            if order.status != "no_show":
                non_no_show_pizza_count += order_pizza_count
            if order.status in IN_PROGRESS_STATUSES:
                in_progress_count += 1
            dashboard_orders.append(
                _build_dashboard_order(order, pizza_names, topping_names),
            )

        dashboard_slots.append(
            DashboardSlot(
                id=slot.id,
                pickup_time=slot.pickup_time,
                max_pizzas=slot.max_pizzas,
                pizza_count=non_no_show_pizza_count,
                remaining_capacity=max(slot.max_pizzas - non_no_show_pizza_count, 0),
                orders=dashboard_orders,
            ),
        )

    return ServiceDashboard(
        drop=DashboardDrop(
            id=drop.id,
            name=drop.name,
            date=drop.date,
            status=drop.status,
            slot_window_start=drop.slot_window_start,
            slot_window_end=drop.slot_window_end,
            in_progress_count=in_progress_count,
        ),
        slots=dashboard_slots,
        server_time=datetime.now(timezone.utc),
    )


# ---------------------------------------------------------------------------
# Mutations
# ---------------------------------------------------------------------------

async def advance_order_status(
    order_id: uuid.UUID, target_status: str,
) -> AdvanceOrderResult:
    """Transition an order to ``target_status``.

    Side effects for ``target_status == "ready_text_sent"``:
      1. Stamp ``ready_text_sent_at = now()``.
      2. After the status change commits, send the customer a Twilio SMS
         announcing the pickup. The SMS is best-effort — if Twilio rejects
         the message the status change stays saved and the failure is
         surfaced via ``AdvanceOrderResult.sms_error`` so the operator can
         text the customer manually.

    The order row is locked for the transition, so two concurrent advances
    can't both pass the state-machine check and text the customer twice.

    All other transitions return ``AdvanceOrderResult(order, None, None)``.
    """
    ready_text: Optional[ReadyText] = None
    async with unit_of_work() as db:
        order = await _get_order(db, order_id, for_update=True)
        drop = await _get_drop(db, order.drop_id)
        _ensure_drop_open(drop)

        if target_status not in ORDER_STATUSES:
            raise InvalidTransitionError(f"Unknown status: {target_status!r}")

        if target_status == order.status:
            # Idempotent no-op rather than 409; lets the UI safely re-fire.
            return AdvanceOrderResult(order=order)

        pair = (order.status, target_status)
        if pair not in _ALLOWED_TRANSITIONS:
            raise InvalidTransitionError(
                f"Cannot transition from {order.status!r} to {target_status!r}.",
            )

        patch: dict[str, object] = {"status": target_status}
        if target_status == "ready_text_sent":
            patch["ready_text_sent_at"] = datetime.now(timezone.utc)
        refreshed = await order_repo.update_order(db, order, patch)
        if target_status == "ready_text_sent":
            ready_text = await compose_ready_text(db, refreshed, drop)

    if ready_text is None:
        return AdvanceOrderResult(order=refreshed)

    # The status change is committed, so the text can't be undone by a
    # rollback; a Twilio outage can't undo the operator's intent either.
    # The Twilio client is synchronous; run it in a thread so a slow send
    # can't freeze the event loop for every other request.
    sms_dispatched, sms_error = await asyncio.to_thread(
        send_ready_text, ready_text, order_id,
    )
    return AdvanceOrderResult(
        order=refreshed,
        sms_dispatched=sms_dispatched,
        sms_error=sms_error,
    )


async def move_order_to_slot(
    order_id: uuid.UUID, target_slot_id: uuid.UUID,
) -> Order:
    """Move an order to a different slot within the same drop.

    Capacity is checked against non-no-show pizza counts; no-op when the
    target equals the current slot.
    """
    async with unit_of_work() as db:
        order = await _get_order(db, order_id)
        drop = await _get_drop(db, order.drop_id)
        _ensure_drop_open(drop)

        if target_slot_id == order.slot_id:
            return order

        # Lock the target slot before counting, so a concurrent order or move
        # into it waits for this one to commit. Only the target is locked: the
        # order's current slot only loses pizzas, so it needs no capacity check.
        target_slot = await _get_slot(db, target_slot_id, for_update=True)
        if target_slot.drop_id != order.drop_id:
            raise SlotNotInDropError(
                f"Slot {target_slot_id} does not belong to drop {order.drop_id}.",
            )

        # No-show orders don't consume capacity, so moving one in is free.
        if order.status != "no_show":
            existing_count = await order_repo.count_pizzas_in_slot(db, target_slot_id)
            requested = len(order.pizzas)
            if existing_count + requested > target_slot.max_pizzas:
                remaining = max(target_slot.max_pizzas - existing_count, 0)
                raise TargetSlotCapacityError(
                    f"Only {remaining} pizza(s) left in target slot. "
                    f"This order has {requested}.",
                )

        return await order_repo.update_order(db, order, {"slot_id": target_slot_id})


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_drop(db: AsyncSession, drop_id: uuid.UUID) -> Drop:
    drop = await drop_repo.get_drop(db, drop_id)
    if drop is None:
        raise DropNotFoundError(f"Drop {drop_id} not found")
    return drop


async def _get_slot(
    db: AsyncSession, slot_id: uuid.UUID, *, for_update: bool = False,
) -> Slot:
    slot = await drop_repo.get_slot(db, slot_id, for_update=for_update)
    if slot is None:
        raise TargetSlotNotFoundError(f"Slot {slot_id} not found")
    return slot


async def _get_order(
    db: AsyncSession, order_id: uuid.UUID, *, for_update: bool = False,
) -> Order:
    order = await order_repo.get_order(db, order_id, for_update=for_update)
    if order is None:
        raise OrderNotFoundError(f"Order {order_id} not found")
    return order


def _ensure_drop_open(drop: Drop) -> None:
    if drop.status == "closed":
        raise DropClosedForServiceError(
            "Drop is closed; orders are read-only.",
        )


async def _load_orders_by_slot(
    db: AsyncSession, slot_ids: list[uuid.UUID],
) -> dict[uuid.UUID, list[Order]]:
    if not slot_ids:
        return {}
    rows = await order_repo.list_orders_for_slots(db, slot_ids)

    # Eager-load customers in one batch.
    customer_ids = {row.customer_id for row in rows}
    customers_by_id: dict[uuid.UUID, Customer] = {}
    if customer_ids:
        for cust in await customer_repo.list_customers_by_ids(db, customer_ids):
            customers_by_id[cust.id] = cust
    # Attach to a transient attr so the builder can use them without
    # touching the relationship (which would lazy-load).
    for row in rows:
        setattr(row, "_customer_obj", customers_by_id.get(row.customer_id))

    grouped: dict[uuid.UUID, list[Order]] = {}
    for row in rows:
        grouped.setdefault(row.slot_id, []).append(row)
    return grouped


async def _load_menu_names(
    db: AsyncSession, orders_by_slot: dict[uuid.UUID, list[Order]],
) -> tuple[dict[uuid.UUID, str], dict[uuid.UUID, str]]:
    pizza_type_ids: set[uuid.UUID] = set()
    topping_type_ids: set[uuid.UUID] = set()
    for slot_orders in orders_by_slot.values():
        for order in slot_orders:
            for pizza in order.pizzas:
                pizza_type_ids.add(pizza.pizza_type_id)
                for topping in pizza.toppings:
                    topping_type_ids.add(topping.topping_type_id)

    pizza_names: dict[uuid.UUID, str] = {}
    if pizza_type_ids:
        pizza_names = await menu_repo.get_pizza_names(db, pizza_type_ids)

    topping_names: dict[uuid.UUID, str] = {}
    if topping_type_ids:
        topping_names = await menu_repo.get_topping_names(db, topping_type_ids)

    return pizza_names, topping_names


def _build_dashboard_order(
    order: Order,
    pizza_names: dict[uuid.UUID, str],
    topping_names: dict[uuid.UUID, str],
) -> DashboardOrder:
    customer_obj: Optional[Customer] = getattr(order, "_customer_obj", None)
    if customer_obj is None:
        # Defensive: should never happen because we batch-load above.
        customer = DashboardCustomer(
            id=order.customer_id, name="(unknown)", phone="",
        )
    else:
        customer = DashboardCustomer(
            id=customer_obj.id,
            name=customer_obj.name,
            phone=customer_obj.phone,
        )

    pizzas: list[DashboardOrderPizza] = []
    total = Decimal("0.00")
    for pizza in order.pizzas:
        line_toppings: list[DashboardOrderPizzaTopping] = []
        for topping in pizza.toppings:
            line_toppings.append(
                DashboardOrderPizzaTopping(
                    topping_type_id=topping.topping_type_id,
                    name=topping_names.get(topping.topping_type_id, "(unknown)"),
                    price_delta_snapshot=topping.price_delta_snapshot,
                ),
            )
        pizzas.append(
            DashboardOrderPizza(
                id=pizza.id,
                pizza_type_id=pizza.pizza_type_id,
                name=pizza_names.get(pizza.pizza_type_id, "(unknown)"),
                modifications_text=pizza.modifications_text,
                is_free=pizza.is_free,
                price_snapshot=pizza.price_snapshot,
                toppings=line_toppings,
            ),
        )
        if not pizza.is_free:
            total += pizza.price_snapshot
            for topping in pizza.toppings:
                total += topping.price_delta_snapshot

    return DashboardOrder(
        id=order.id,
        slot_id=order.slot_id,
        status=order.status,
        payment_method_tag=order.payment_method_tag,
        payment_status=order.payment_status,
        ready_text_sent_at=order.ready_text_sent_at,
        created_at=order.created_at,
        updated_at=order.updated_at,
        customer=customer,
        pizzas=pizzas,
        total=total,
        pizza_count=len(order.pizzas),
    )
