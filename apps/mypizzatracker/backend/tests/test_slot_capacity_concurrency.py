"""Two writers racing for the last place in a slot must not overbook it.

Placing an order and moving an order both count the pizzas already in the
target slot, then write. Without a lock, two requests can both count before
either commits, both pass the check, and the slot ends over its limit.

The race is made deterministic by wrapping the pizza count: each caller, after
counting, waits until the other caller has counted too (or a short timeout
passes). Without the slot lock both callers count the same empty slot, meet,
and both write, so the slot is overbooked every run. With the lock the second
caller can't count until the first commits, so the first gives up waiting
after the timeout, commits, and the second then sees the slot full.

Each call runs through the real services, each in its own transaction on its
own connection, against the test Postgres.
"""
from __future__ import annotations

import asyncio
import uuid
from collections.abc import Awaitable, Callable
from datetime import date, time
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.drop.drop import Drop
from app.models.drop.slot import Slot
from app.models.menu.pizza_type import PizzaType
from app.models.order.order import Order
from app.repositories.order import order_repo
from app.schemas.customer.customer_schemas import CustomerCreate
from app.services.order import order_service
from app.services.order.order_service import SlotCapacityExceededError
from app.services.service_dashboard import service_dashboard_service
from app.services.service_dashboard.service_dashboard_service import (
    TargetSlotCapacityError,
)

# Long enough that, without a lock, the other caller always reaches its count
# first; short enough that the locked path (which waits the full time) stays fast.
RENDEZVOUS_TIMEOUT_SECONDS = 1.0

CountFn = Callable[[AsyncSession, uuid.UUID], Awaitable[int]]


def _hold_counts_until_both_arrive(monkeypatch: pytest.MonkeyPatch) -> None:
    """Make each capacity count wait for the other racer before returning."""
    real_count: CountFn = order_repo.count_pizzas_in_slot
    arrived = 0
    both_arrived = asyncio.Event()

    async def _count_then_wait(db: AsyncSession, slot_id: uuid.UUID) -> int:
        nonlocal arrived
        count = await real_count(db, slot_id)
        arrived += 1
        if arrived >= 2:
            both_arrived.set()
        try:
            await asyncio.wait_for(both_arrived.wait(), RENDEZVOUS_TIMEOUT_SECONDS)
        except TimeoutError:
            pass
        return count

    monkeypatch.setattr(order_repo, "count_pizzas_in_slot", _count_then_wait)


async def _seed_drop(db: AsyncSession, slot_capacities: list[int]) -> tuple[Drop, list[Slot], PizzaType]:
    drop = Drop(
        date=date(2026, 12, 25),
        name="Race Drop",
        slot_window_start=time(17, 0),
        slot_window_end=time(19, 0),
        status="active",
    )
    db.add(drop)
    await db.flush()
    slots = [
        Slot(drop_id=drop.id, pickup_time=time(17, 15 * i), max_pizzas=capacity)
        for i, capacity in enumerate(slot_capacities)
    ]
    db.add_all(slots)
    pizza = PizzaType(name="La Clasica", price=Decimal("17.00"), active=True)
    db.add(pizza)
    await db.commit()
    return drop, slots, pizza


async def _place_one_pizza(
    drop: Drop, slot: Slot, pizza: PizzaType, phone: str,
) -> Order:
    return await order_service.place_order(
        drop_id=drop.id,
        slot_id=slot.id,
        customer=CustomerCreate(name="Racer", phone=phone),
        payment_method_tag="cash",
        pizza_lines=[{"pizza_type_id": pizza.id, "topping_type_ids": []}],
    )


async def _committed_pizza_count(db: AsyncSession, slot_id: uuid.UUID) -> int:
    await db.rollback()  # fresh snapshot of what the racers committed
    return await order_repo.count_pizzas_in_slot(db, slot_id)


async def test_concurrent_orders_for_last_place_book_it_once(
    db: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    drop, (slot,), pizza = await _seed_drop(db, [1])
    _hold_counts_until_both_arrive(monkeypatch)

    results = await asyncio.gather(
        _place_one_pizza(drop, slot, pizza, "5125550101"),
        _place_one_pizza(drop, slot, pizza, "5125550102"),
        return_exceptions=True,
    )

    placed = [r for r in results if isinstance(r, Order)]
    rejected = [r for r in results if isinstance(r, SlotCapacityExceededError)]
    assert len(placed) == 1, results
    assert len(rejected) == 1, results
    assert await _committed_pizza_count(db, slot.id) == 1


async def test_concurrent_moves_into_last_place_move_one(
    db: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    drop, (source, target), pizza = await _seed_drop(db, [5, 1])
    first = await _place_one_pizza(drop, source, pizza, "5125550201")
    second = await _place_one_pizza(drop, source, pizza, "5125550202")
    _hold_counts_until_both_arrive(monkeypatch)

    results = await asyncio.gather(
        service_dashboard_service.move_order_to_slot(first.id, target.id),
        service_dashboard_service.move_order_to_slot(second.id, target.id),
        return_exceptions=True,
    )

    moved = [r for r in results if isinstance(r, Order)]
    rejected = [r for r in results if isinstance(r, TargetSlotCapacityError)]
    assert len(moved) == 1, results
    assert len(rejected) == 1, results
    target_id, source_id = target.id, source.id
    assert await _committed_pizza_count(db, target_id) == 1
    assert await _committed_pizza_count(db, source_id) == 1
