"""Every write must be committed, not just flushed and rolled back.

Each test makes a change through the API and then reads it back in a brand
new session on its own connection. A change that was only flushed inside the
request's session is invisible there, so these fail if a route ever stops
committing — the bug where every save looked successful and vanished.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from platform_shared.testing.factories import hash_test_password

from app.models.customer.customer import Customer
from app.models.drop.drop import Drop
from app.models.drop.slot import Slot
from app.models.expense.expense import Expense
from app.models.menu.pizza_type import PizzaType
from app.models.menu.topping_type import ToppingType
from app.models.order.order import Order
from app.models.order.order_pizza import OrderPizza
from app.models.user.user import User

TEST_EMAIL = "commit-test@example.com"
TEST_PASSWORD = "testpassword123!"


FreshSession = Callable[[], AbstractAsyncContextManager[AsyncSession]]


@pytest_asyncio.fixture
async def auth_client(client: AsyncClient, db: AsyncSession) -> AsyncClient:
    db.add(User(
        email=TEST_EMAIL,
        hashed_password=hash_test_password(TEST_PASSWORD),
        is_verified=True,
        is_active=True,
    ))
    await db.commit()
    resp = await client.post(
        "/auth/jwt/login",
        data={"username": TEST_EMAIL, "password": TEST_PASSWORD},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert resp.status_code == 200, resp.text
    client.headers["Authorization"] = f"Bearer {resp.json()['access_token']}"
    return client


@pytest.fixture
def fresh(db_engine: AsyncEngine) -> FreshSession:
    """Open a new session on a new connection, unrelated to any request."""
    @asynccontextmanager
    async def _open() -> AsyncIterator[AsyncSession]:
        async with AsyncSession(db_engine) as session:
            yield session
    return _open


async def _create_pizza(auth_client: AsyncClient, name: str = "La Clasica") -> str:
    resp = await auth_client.post(
        "/menu/pizzas",
        json={"name": name, "price": "17.00", "description": None, "active": True},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _create_drop(auth_client: AsyncClient) -> str:
    resp = await auth_client.post(
        "/drops",
        json={
            "date": "2026-12-25",
            "name": "Dec 25th",
            "slot_window_start": "11:00:00",
            "slot_window_end": "15:30:00",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _add_slot(auth_client: AsyncClient, drop_id: str, pickup_time: str = "12:00:00") -> str:
    resp = await auth_client.post(
        f"/drops/{drop_id}/slots",
        json={"pickup_time": pickup_time, "max_pizzas": 6},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _active_drop(auth_client: AsyncClient) -> tuple[str, str]:
    drop_id = await _create_drop(auth_client)
    slot_id = await _add_slot(auth_client, drop_id)
    resp = await auth_client.patch(f"/drops/{drop_id}", json={"status": "active"})
    assert resp.status_code == 200, resp.text
    return drop_id, slot_id


async def _place_order(client: AsyncClient, drop_id: str, slot_id: str, pizza_id: str) -> str:
    resp = await client.post(
        "/public/orders",
        json={
            "drop_id": drop_id,
            "slot_id": slot_id,
            "customer_name": "Jonathan",
            "customer_phone": "(512) 555-0001",
            "payment_method_tag": "venmo",
            "pizzas": [{"pizza_type_id": pizza_id, "topping_type_ids": []}],
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["order_id"]


async def _advance(auth_client: AsyncClient, order_id: str, status: str) -> dict:
    resp = await auth_client.post(
        f"/service/orders/{order_id}/advance", json={"target_status": status},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _order_status(fresh: FreshSession, order_id: str) -> str:
    async with fresh() as s:
        return (await s.get(Order, uuid.UUID(order_id))).status


# ---------------------------------------------------------------------------
# Drops + slots
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_drop_create_slot_and_activate_are_saved(
    auth_client: AsyncClient, fresh: FreshSession,
) -> None:
    drop_id, slot_id = await _active_drop(auth_client)

    async with fresh() as s:
        drop = await s.get(Drop, uuid.UUID(drop_id))
        assert drop is not None
        assert drop.status == "active"
        assert await s.get(Slot, uuid.UUID(slot_id)) is not None


@pytest.mark.asyncio
async def test_drop_edit_slot_edit_and_deletes_are_saved(
    auth_client: AsyncClient, fresh: FreshSession,
) -> None:
    drop_id = await _create_drop(auth_client)
    keep_slot = await _add_slot(auth_client, drop_id, "12:00:00")
    gone_slot = await _add_slot(auth_client, drop_id, "13:00:00")

    assert (await auth_client.patch(f"/drops/{drop_id}", json={"name": "Renamed"})).status_code == 200
    assert (await auth_client.patch(
        f"/drops/{drop_id}/slots/{keep_slot}", json={"max_pizzas": 9},
    )).status_code == 200
    assert (await auth_client.delete(f"/drops/{drop_id}/slots/{gone_slot}")).status_code == 204

    async with fresh() as s:
        assert (await s.get(Drop, uuid.UUID(drop_id))).name == "Renamed"
        assert (await s.get(Slot, uuid.UUID(keep_slot))).max_pizzas == 9
        assert await s.get(Slot, uuid.UUID(gone_slot)) is None

    assert (await auth_client.delete(f"/drops/{drop_id}")).status_code == 204
    async with fresh() as s:
        assert await s.get(Drop, uuid.UUID(drop_id)) is None


@pytest.mark.asyncio
async def test_rejected_drop_edit_saves_nothing(
    auth_client: AsyncClient, fresh: FreshSession,
) -> None:
    """A rule violation rolls back the whole change, not part of it."""
    drop_id = await _create_drop(auth_client)
    resp = await auth_client.patch(
        f"/drops/{drop_id}", json={"name": "Half saved", "status": "active"},
    )
    assert resp.status_code == 400  # no slots yet

    async with fresh() as s:
        drop = await s.get(Drop, uuid.UUID(drop_id))
        assert drop.name == "Dec 25th"
        assert drop.status == "planning"


# ---------------------------------------------------------------------------
# Menu
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_menu_create_edit_and_delete_are_saved(
    auth_client: AsyncClient, fresh: FreshSession,
) -> None:
    pizza_id = await _create_pizza(auth_client)
    resp = await auth_client.post(
        "/menu/toppings", json={"name": "Basil", "price_delta": "1.00", "active": True},
    )
    assert resp.status_code == 201, resp.text
    topping_id = resp.json()["id"]

    async with fresh() as s:
        assert (await s.get(PizzaType, uuid.UUID(pizza_id))).name == "La Clasica"
        assert (await s.get(ToppingType, uuid.UUID(topping_id))).name == "Basil"

    # 86 the pizza and rename the topping.
    assert (await auth_client.patch(f"/menu/pizzas/{pizza_id}", json={"active": False})).status_code == 200
    assert (await auth_client.patch(
        f"/menu/toppings/{topping_id}", json={"name": "Fresh basil"},
    )).status_code == 200
    async with fresh() as s:
        assert (await s.get(PizzaType, uuid.UUID(pizza_id))).active is False
        assert (await s.get(ToppingType, uuid.UUID(topping_id))).name == "Fresh basil"

    assert (await auth_client.delete(f"/menu/pizzas/{pizza_id}")).status_code == 204
    assert (await auth_client.delete(f"/menu/toppings/{topping_id}")).status_code == 204
    async with fresh() as s:
        assert await s.get(PizzaType, uuid.UUID(pizza_id)) is None
        assert await s.get(ToppingType, uuid.UUID(topping_id)) is None


# ---------------------------------------------------------------------------
# Public order placement
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_public_order_saves_customer_order_and_pizzas(
    client: AsyncClient, auth_client: AsyncClient, fresh: FreshSession,
) -> None:
    drop_id, slot_id = await _active_drop(auth_client)
    pizza_id = await _create_pizza(auth_client)
    order_id = await _place_order(client, drop_id, slot_id, pizza_id)

    async with fresh() as s:
        order = await s.get(Order, uuid.UUID(order_id))
        assert order is not None
        assert order.status == "not_started"
        customer = await s.get(Customer, order.customer_id)
        assert customer.phone == "5125550001"
        pizza_count = await s.scalar(
            select(func.count(OrderPizza.id)).where(OrderPizza.order_id == order.id),
        )
        assert pizza_count == 1

    # The customer-facing status page reads it back on a later request too.
    resp = await client.get(f"/public/orders/{order_id}")
    assert resp.status_code == 200, resp.text


# ---------------------------------------------------------------------------
# Service dashboard
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_order_status_change_and_slot_move_are_saved(
    client: AsyncClient, auth_client: AsyncClient, fresh: FreshSession,
) -> None:
    drop_id, slot_id = await _active_drop(auth_client)
    other_slot = await _add_slot(auth_client, drop_id, "13:00:00")
    pizza_id = await _create_pizza(auth_client)
    order_id = await _place_order(client, drop_id, slot_id, pizza_id)

    await _advance(auth_client, order_id, "cooking")
    assert await _order_status(fresh, order_id) == "cooking"

    resp = await auth_client.post(
        f"/service/orders/{order_id}/move", json={"slot_id": other_slot},
    )
    assert resp.status_code == 200, resp.text
    async with fresh() as s:
        assert (await s.get(Order, uuid.UUID(order_id))).slot_id == uuid.UUID(other_slot)

    await _advance(auth_client, order_id, "no_show")
    assert await _order_status(fresh, order_id) == "no_show"


@pytest.mark.asyncio
async def test_ready_text_is_sent_once_and_after_the_status_is_saved(
    client: AsyncClient,
    auth_client: AsyncClient,
    fresh: FreshSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The customer is texted exactly once, and only for a saved change.

    Before the fix the status rolled back after the text went out, so the
    operator advancing the order again texted the customer a second time.
    """
    from app.services.sms import sms_sender

    drop_id, slot_id = await _active_drop(auth_client)
    pizza_id = await _create_pizza(auth_client)
    order_id = await _place_order(client, drop_id, slot_id, pizza_id)
    await _advance(auth_client, order_id, "cooking")

    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(
        sms_sender, "send_sms_or_raise", lambda to, body: sent.append((to, body)),
    )

    first = await _advance(auth_client, order_id, "ready_text_sent")
    assert first["sms_dispatched"] is True
    assert len(sent) == 1
    assert sent[0][0] == "5125550001"

    async with fresh() as s:
        order = await s.get(Order, uuid.UUID(order_id))
        assert order.status == "ready_text_sent"
        assert order.ready_text_sent_at is not None

    # The operator taps "ready" again: no second text.
    again = await _advance(auth_client, order_id, "ready_text_sent")
    assert again["order"]["status"] == "ready_text_sent"
    assert again["sms_dispatched"] is None
    assert len(sent) == 1


@pytest.mark.asyncio
async def test_no_text_when_the_ready_transition_is_rejected(
    client: AsyncClient, auth_client: AsyncClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.services.sms import sms_sender

    drop_id, slot_id = await _active_drop(auth_client)
    pizza_id = await _create_pizza(auth_client)
    order_id = await _place_order(client, drop_id, slot_id, pizza_id)

    sent: list[str] = []
    monkeypatch.setattr(sms_sender, "send_sms_or_raise", lambda to, body: sent.append(to))

    # not_started -> ready_text_sent skips "cooking" and is refused.
    resp = await auth_client.post(
        f"/service/orders/{order_id}/advance", json={"target_status": "ready_text_sent"},
    )
    assert resp.status_code == 409
    assert sent == []


# ---------------------------------------------------------------------------
# Financials + customers
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tip_and_expense_changes_are_saved(
    auth_client: AsyncClient, fresh: FreshSession,
) -> None:
    drop_id, _ = await _active_drop(auth_client)

    assert (await auth_client.patch(
        f"/financials/drops/{drop_id}/tip", json={"tip_total": "25.00"},
    )).status_code == 200
    resp = await auth_client.post(
        f"/financials/drops/{drop_id}/expenses",
        json={"vendor": "Costco", "category": "ingredients", "amount": "12.50"},
    )
    assert resp.status_code == 201, resp.text
    expense_id = uuid.UUID(resp.json()["id"])

    async with fresh() as s:
        assert str((await s.get(Drop, uuid.UUID(drop_id))).tip_total) == "25.00"
        assert str((await s.get(Expense, expense_id)).amount) == "12.50"

    assert (await auth_client.patch(
        f"/financials/expenses/{expense_id}", json={"amount": "14.00"},
    )).status_code == 200
    async with fresh() as s:
        assert str((await s.get(Expense, expense_id)).amount) == "14.00"

    assert (await auth_client.delete(f"/financials/expenses/{expense_id}")).status_code == 204
    async with fresh() as s:
        assert await s.get(Expense, expense_id) is None


@pytest.mark.asyncio
async def test_customer_notes_are_saved(
    client: AsyncClient, auth_client: AsyncClient, fresh: FreshSession,
) -> None:
    drop_id, slot_id = await _active_drop(auth_client)
    pizza_id = await _create_pizza(auth_client)
    order_id = await _place_order(client, drop_id, slot_id, pizza_id)
    async with fresh() as s:
        customer_id = (await s.get(Order, uuid.UUID(order_id))).customer_id

    resp = await auth_client.patch(
        f"/customers/{customer_id}/notes", json={"notes": "extra crispy"},
    )
    assert resp.status_code == 200, resp.text
    async with fresh() as s:
        assert (await s.get(Customer, customer_id)).notes == "extra crispy"
