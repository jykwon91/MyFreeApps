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

Transitioning into ``ready_text_sent`` stamps ``ready_text_sent_at`` AND
fires a Twilio SMS to the customer (best-effort: a Twilio outage logs +
returns the failure to the operator but does NOT roll back the status
change — the operator is the authoritative record of "order is ready",
the SMS is a courtesy notification).

Mutations are rejected entirely if the drop is in ``closed`` status --
service is over, history is frozen.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.customer.customer import Customer
from app.models.drop.drop import Drop
from app.models.drop.slot import Slot
from app.models.menu.pizza_type import PizzaType
from app.models.menu.topping_type import ToppingType
from app.models.order.order import Order
from app.models.order.order_pizza import OrderPizza
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
from app.services.sms import sms_sender
from app.services.sms.order_ready_notification import render_order_ready_body
from platform_shared.services.sms_service import (
    SmsNotConfiguredError,
    SmsSendError,
)

logger = logging.getLogger(__name__)

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

    slots = await _load_slots(db, drop_id)
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
    db: AsyncSession, order_id: uuid.UUID, target_status: str,
) -> AdvanceOrderResult:
    """Transition an order to ``target_status``.

    Side effects for ``target_status == "ready_text_sent"``:
      1. Stamp ``ready_text_sent_at = now()``.
      2. Send the customer a Twilio SMS announcing the pickup. The SMS is
         best-effort — if Twilio rejects the message, the status change
         still commits and the failure is surfaced via
         ``AdvanceOrderResult.sms_error`` so the operator can text the
         customer manually.

    All other transitions return ``AdvanceOrderResult(order, None, None)``.
    """
    order = await _get_order(db, order_id)
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

    order.status = target_status
    if target_status == "ready_text_sent":
        order.ready_text_sent_at = datetime.now(timezone.utc)

    await db.flush()
    refreshed = await order_repo.get_order(db, order.id)
    assert refreshed is not None, "Order disappeared during transition"

    if target_status != "ready_text_sent":
        return AdvanceOrderResult(order=refreshed)

    # Fire the SMS AFTER the flush so a Twilio outage doesn't roll back
    # the operator's intent. The status is the source of truth; the SMS
    # is a courtesy.
    sms_dispatched, sms_error = await _send_ready_text(db, refreshed, drop)
    return AdvanceOrderResult(
        order=refreshed,
        sms_dispatched=sms_dispatched,
        sms_error=sms_error,
    )


async def _send_ready_text(
    db: AsyncSession, order: Order, drop: Drop,
) -> tuple[bool, Optional[str]]:
    """Dispatch the order-ready SMS. Returns (sent_ok, error_message).

    Best-effort: every failure path returns ``(False, "<reason>")`` and
    logs at WARNING; the caller surfaces ``error_message`` to the
    operator. We never re-raise — the operator already advanced the
    order and a Twilio outage shouldn't block the dashboard.
    """
    customer = await db.get(Customer, order.customer_id)
    slot = await db.get(Slot, order.slot_id)
    if customer is None or slot is None:
        # Should be impossible given the FK constraints, but the SMS
        # path is best-effort by design — log + return rather than
        # raise.
        logger.warning(
            "Skipping ready-text SMS: missing customer or slot for order %s",
            order.id,
        )
        return False, "Customer or slot missing; cannot text"
    if not customer.phone:
        return False, "Customer has no phone number on file"

    body = render_order_ready_body(
        customer_name=customer.name,
        drop_name=drop.name,
        pickup_time=slot.pickup_time,
    )
    try:
        sms_sender.send_sms_or_raise(customer.phone, body)
    except SmsNotConfiguredError as e:
        logger.warning(
            "Ready-text SMS skipped (Twilio not configured) for order %s: %s",
            order.id, e,
        )
        return False, "SMS service is not configured"
    except SmsSendError as e:
        logger.warning(
            "Ready-text SMS rejected by Twilio for order %s: %s",
            order.id, e,
        )
        return False, str(e)
    except ValueError as e:
        logger.warning(
            "Ready-text SMS rejected (invalid args) for order %s: %s",
            order.id, e,
        )
        return False, str(e)
    return True, None


async def move_order_to_slot(
    db: AsyncSession, order_id: uuid.UUID, target_slot_id: uuid.UUID,
) -> Order:
    """Move an order to a different slot within the same drop.

    Capacity is checked against non-no-show pizza counts; no-op when the
    target equals the current slot.
    """
    order = await _get_order(db, order_id)
    drop = await _get_drop(db, order.drop_id)
    _ensure_drop_open(drop)

    if target_slot_id == order.slot_id:
        return order

    target_slot = await _get_slot(db, target_slot_id)
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

    order.slot_id = target_slot_id
    await db.flush()
    refreshed = await order_repo.get_order(db, order.id)
    assert refreshed is not None, "Order disappeared during move"
    return refreshed


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_drop(db: AsyncSession, drop_id: uuid.UUID) -> Drop:
    drop = await db.get(Drop, drop_id)
    if drop is None:
        raise DropNotFoundError(f"Drop {drop_id} not found")
    return drop


async def _get_slot(db: AsyncSession, slot_id: uuid.UUID) -> Slot:
    slot = await db.get(Slot, slot_id)
    if slot is None:
        raise TargetSlotNotFoundError(f"Slot {slot_id} not found")
    return slot


async def _get_order(db: AsyncSession, order_id: uuid.UUID) -> Order:
    order = await order_repo.get_order(db, order_id)
    if order is None:
        raise OrderNotFoundError(f"Order {order_id} not found")
    return order


def _ensure_drop_open(drop: Drop) -> None:
    if drop.status == "closed":
        raise DropClosedForServiceError(
            "Drop is closed; orders are read-only.",
        )


async def _load_slots(db: AsyncSession, drop_id: uuid.UUID) -> list[Slot]:
    stmt = (
        select(Slot)
        .where(Slot.drop_id == drop_id)
        .order_by(Slot.pickup_time.asc())
    )
    return list((await db.execute(stmt)).scalars().all())


async def _load_orders_by_slot(
    db: AsyncSession, slot_ids: list[uuid.UUID],
) -> dict[uuid.UUID, list[Order]]:
    if not slot_ids:
        return {}
    stmt = (
        select(Order)
        .where(Order.slot_id.in_(slot_ids))
        .options(
            selectinload(Order.pizzas).selectinload(OrderPizza.toppings),
        )
        .order_by(Order.created_at.asc())
    )
    rows: list[Order] = list((await db.execute(stmt)).scalars().all())

    # Eager-load customers in one batch.
    customer_ids = {row.customer_id for row in rows}
    customers_by_id: dict[uuid.UUID, Customer] = {}
    if customer_ids:
        cust_stmt = select(Customer).where(Customer.id.in_(customer_ids))
        for cust in (await db.execute(cust_stmt)).scalars().all():
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
        stmt = select(PizzaType.id, PizzaType.name).where(
            PizzaType.id.in_(pizza_type_ids),
        )
        for pid, pname in (await db.execute(stmt)).all():
            pizza_names[pid] = pname

    topping_names: dict[uuid.UUID, str] = {}
    if topping_type_ids:
        stmt = select(ToppingType.id, ToppingType.name).where(
            ToppingType.id.in_(topping_type_ids),
        )
        for tid, tname in (await db.execute(stmt)).all():
            topping_names[tid] = tname

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
