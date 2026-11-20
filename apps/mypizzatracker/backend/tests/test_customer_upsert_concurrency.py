"""Two first orders from the same brand-new phone, placed at the same moment.

Both requests must succeed and share ONE customer row. Before the customer
upsert was a single atomic statement, both requests looked the phone up, both
missed, both inserted, and the second hit the unique phone constraint (a 500
that lost that customer's order).

The race is made deterministic with a barrier: neither request is allowed to
write its customer until both have reached the customer step.
"""
from __future__ import annotations

import asyncio
from datetime import date, time
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer.customer import Customer
from app.models.drop.drop import Drop
from app.models.drop.slot import Slot
from app.models.menu.pizza_type import PizzaType
from app.models.order.order import Order
from app.repositories.customer import customer_repo
from app.services.customer import customer_service

PHONE = "(512) 555-0199"
NORMALIZED_PHONE = "5125550199"
BARRIER_TIMEOUT_SECONDS = 5


@pytest_asyncio.fixture
async def open_slot(db: AsyncSession) -> tuple[str, str, str]:
    drop = Drop(
        date=date(2026, 12, 25),
        name="Dec 25th",
        slot_window_start=time(11, 0),
        slot_window_end=time(15, 30),
        status="active",
    )
    pizza = PizzaType(name="La Clasica", price=Decimal("17.00"), active=True)
    db.add_all([drop, pizza])
    await db.flush()
    slot = Slot(drop_id=drop.id, pickup_time=time(12, 0), max_pizzas=10)
    db.add(slot)
    await db.commit()
    return str(drop.id), str(slot.id), str(pizza.id)


@pytest.fixture
def both_orders_reach_customer_step(monkeypatch: pytest.MonkeyPatch) -> None:
    """Hold each request at the customer step until both have arrived.

    Wraps the lookup too, so on the old lookup-then-insert code both requests
    have already missed before either one inserts.
    """
    barrier = asyncio.Barrier(2)

    async def _meet() -> None:
        async with asyncio.timeout(BARRIER_TIMEOUT_SECONDS):
            await barrier.wait()

    real_lookup = customer_repo.get_customer_by_phone
    real_upsert = customer_service.upsert_by_phone

    async def lookup_then_wait(*args, **kwargs):
        found = await real_lookup(*args, **kwargs)
        await _meet()
        return found

    async def wait_then_upsert(*args, **kwargs):
        await _meet()
        return await real_upsert(*args, **kwargs)

    monkeypatch.setattr(customer_repo, "get_customer_by_phone", lookup_then_wait)
    monkeypatch.setattr(customer_service, "upsert_by_phone", wait_then_upsert)


def _order_body(slot: tuple[str, str, str], name: str) -> dict:
    drop_id, slot_id, pizza_id = slot
    return {
        "drop_id": drop_id,
        "slot_id": slot_id,
        "customer_name": name,
        "customer_phone": PHONE,
        "payment_method_tag": "cash",
        "pizzas": [{"pizza_type_id": pizza_id, "topping_type_ids": []}],
    }


@pytest.mark.asyncio
async def test_two_first_orders_from_same_new_phone_both_succeed(
    client: AsyncClient,
    db: AsyncSession,
    open_slot: tuple[str, str, str],
    both_orders_reach_customer_step: None,
):
    first, second = await asyncio.gather(
        client.post("/public/orders", json=_order_body(open_slot, "Jose")),
        client.post("/public/orders", json=_order_body(open_slot, "Jose P.")),
    )

    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    assert first.json()["order_id"] != second.json()["order_id"]

    customers = (
        await db.execute(select(Customer).where(Customer.phone == NORMALIZED_PHONE))
    ).scalars().all()
    assert len(customers) == 1
    assert customers[0].name in {"Jose", "Jose P."}

    order_count = (await db.execute(select(func.count(Order.id)))).scalar_one()
    assert order_count == 2
    assert {
        o.customer_id for o in (await db.execute(select(Order))).scalars().all()
    } == {customers[0].id}
