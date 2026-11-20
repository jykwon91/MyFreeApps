"""``count_pizzas_by_slot`` must agree with ``count_pizzas_in_slot`` for every slot."""
from __future__ import annotations

import uuid
from datetime import date, time
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer.customer import Customer
from app.models.drop.drop import Drop
from app.models.drop.slot import Slot
from app.models.menu.pizza_type import PizzaType
from app.repositories.order import order_repo

pytestmark = pytest.mark.asyncio


async def _seed(db: AsyncSession) -> tuple[Drop, list[Slot], PizzaType, Customer]:
    drop = Drop(
        date=date(2026, 12, 25),
        name="Counts Drop",
        slot_window_start=time(17, 0),
        slot_window_end=time(19, 0),
        status="active",
    )
    db.add(drop)
    await db.flush()
    slots = [
        Slot(drop_id=drop.id, pickup_time=time(17, 15 * i), max_pizzas=10)
        for i in range(4)
    ]
    pizza = PizzaType(name="La Clasica", price=Decimal("17.00"), active=True)
    customer = Customer(name="Counter", phone="5125550300")
    db.add_all([*slots, pizza, customer])
    await db.commit()
    return drop, slots, pizza, customer


async def _order(
    db: AsyncSession,
    drop: Drop,
    slot: Slot,
    pizza: PizzaType,
    customer: Customer,
    *,
    pizzas: int,
    status: str = "not_started",
) -> None:
    order = await order_repo.create_order_with_lines(
        db,
        drop_id=drop.id,
        slot_id=slot.id,
        customer_id=customer.id,
        payment_method_tag="cash",
        pizzas=[
            {"pizza_type_id": pizza.id, "price_snapshot": Decimal("17.00")}
            for _ in range(pizzas)
        ],
    )
    order.status = status
    await db.commit()


async def test_counts_each_slot_and_zero_for_empty_slots(db: AsyncSession) -> None:
    drop, (a, b, c, empty), pizza, customer = await _seed(db)
    await _order(db, drop, a, pizza, customer, pizzas=2)
    await _order(db, drop, a, pizza, customer, pizzas=1, status="picked_up")
    await _order(db, drop, b, pizza, customer, pizzas=3)
    await _order(db, drop, c, pizza, customer, pizzas=4, status="no_show")

    counts = await order_repo.count_pizzas_by_slot(db, [a.id, b.id, c.id, empty.id])

    assert counts == {a.id: 3, b.id: 3, c.id: 0, empty.id: 0}
    for slot in (a, b, c, empty):
        assert counts[slot.id] == await order_repo.count_pizzas_in_slot(db, slot.id)


async def test_only_requested_slots_are_returned(db: AsyncSession) -> None:
    drop, (a, b, _c, _d), pizza, customer = await _seed(db)
    await _order(db, drop, a, pizza, customer, pizzas=1)
    await _order(db, drop, b, pizza, customer, pizzas=2)

    assert await order_repo.count_pizzas_by_slot(db, [b.id]) == {b.id: 2}


async def test_no_slot_ids_returns_empty_and_unknown_slot_is_zero(
    db: AsyncSession,
) -> None:
    unknown = uuid.uuid4()
    assert await order_repo.count_pizzas_by_slot(db, []) == {}
    assert await order_repo.count_pizzas_by_slot(db, [unknown]) == {unknown: 0}
