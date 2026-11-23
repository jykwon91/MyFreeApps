"""Deletes and slot edits that would break the database return a clear 409.

Covers:
- Deleting a pizza or topping that a past order uses -> 409 "86 it instead",
  and the item is still there
- Deleting an unused pizza / topping still works
- Removing a slot that an order points at -> 409 "move those orders", slot kept
- Removing an empty slot from an active drop still works
- Adding or moving a slot to a pickup time the drop already has -> 409,
  nothing changed
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.testing.factories import hash_test_password

from app.models.user.user import User


@pytest_asyncio.fixture
async def auth_client(client: AsyncClient, db: AsyncSession) -> AsyncClient:
    test_email = "delete-guards@example.com"
    test_password = "testpassword123!"

    result = await db.execute(select(User).where(User.email == test_email))
    if result.scalar_one_or_none() is None:
        db.add(
            User(
                email=test_email,
                hashed_password=hash_test_password(test_password),
                is_verified=True,
                is_active=True,
            ),
        )
        await db.commit()

    resp = await client.post(
        "/auth/jwt/login",
        data={"username": test_email, "password": test_password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    if resp.status_code != 200:
        pytest.fail(f"Auth failed: {resp.status_code} {resp.text}")
    client.headers["Authorization"] = f"Bearer {resp.json()['access_token']}"
    return client


async def _create_pizza(auth_client: AsyncClient, name: str = "La Clasica") -> str:
    resp = await auth_client.post(
        "/menu/pizzas", json={"name": name, "price": "17.00", "active": True},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _create_topping(auth_client: AsyncClient, name: str = "Mushrooms") -> str:
    resp = await auth_client.post(
        "/menu/toppings", json={"name": name, "price_delta": "0", "active": True},
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


async def _add_slot(auth_client: AsyncClient, drop_id: str, pickup_time: str) -> str:
    resp = await auth_client.post(
        f"/drops/{drop_id}/slots",
        json={"pickup_time": pickup_time, "max_pizzas": 6},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _activate(auth_client: AsyncClient, drop_id: str) -> None:
    resp = await auth_client.patch(f"/drops/{drop_id}", json={"status": "active"})
    assert resp.status_code == 200, resp.text


async def _place_order(
    client: AsyncClient,
    *,
    drop_id: str,
    slot_id: str,
    pizza_id: str,
    topping_ids: list[str] | None = None,
) -> None:
    resp = await client.post(
        "/public/orders",
        json={
            "drop_id": drop_id,
            "slot_id": slot_id,
            "customer_name": "Jonathan",
            "customer_phone": "5125550001",
            "payment_method_tag": "venmo",
            "pizzas": [
                {"pizza_type_id": pizza_id, "topping_type_ids": topping_ids or []},
            ],
        },
    )
    assert resp.status_code == 201, resp.text


async def _active_drop_with_order(
    auth_client: AsyncClient,
) -> tuple[str, str, str, str]:
    """An active drop with one 12:00 slot and an order using a pizza + topping."""
    pizza_id = await _create_pizza(auth_client)
    topping_id = await _create_topping(auth_client)
    drop_id = await _create_drop(auth_client)
    slot_id = await _add_slot(auth_client, drop_id, "12:00:00")
    await _activate(auth_client, drop_id)
    await _place_order(
        auth_client,
        drop_id=drop_id,
        slot_id=slot_id,
        pizza_id=pizza_id,
        topping_ids=[topping_id],
    )
    return drop_id, slot_id, pizza_id, topping_id


# ---------------------------------------------------------------------------
# Menu
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_delete_pizza_in_past_orders_returns_409(auth_client: AsyncClient):
    _, _, pizza_id, _ = await _active_drop_with_order(auth_client)

    resp = await auth_client.delete(f"/menu/pizzas/{pizza_id}")

    assert resp.status_code == 409, resp.text
    detail = resp.json()["detail"]
    assert "La Clasica is in past orders" in detail
    assert "86 it" in detail
    pizzas = (await auth_client.get("/menu/pizzas")).json()
    assert [p["id"] for p in pizzas] == [pizza_id]


@pytest.mark.asyncio
async def test_delete_topping_in_past_orders_returns_409(auth_client: AsyncClient):
    _, _, _, topping_id = await _active_drop_with_order(auth_client)

    resp = await auth_client.delete(f"/menu/toppings/{topping_id}")

    assert resp.status_code == 409, resp.text
    detail = resp.json()["detail"]
    assert "Mushrooms is in past orders" in detail
    assert "86 it" in detail
    toppings = (await auth_client.get("/menu/toppings")).json()
    assert [t["id"] for t in toppings] == [topping_id]


@pytest.mark.asyncio
async def test_delete_unused_pizza_and_topping_still_works(
    auth_client: AsyncClient,
):
    await _active_drop_with_order(auth_client)
    unused_pizza = await _create_pizza(auth_client, "Unused Pie")
    unused_topping = await _create_topping(auth_client, "Unused Topping")

    assert (await auth_client.delete(f"/menu/pizzas/{unused_pizza}")).status_code == 204
    assert (
        await auth_client.delete(f"/menu/toppings/{unused_topping}")
    ).status_code == 204


# ---------------------------------------------------------------------------
# Slots
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_remove_slot_with_orders_returns_409(auth_client: AsyncClient):
    drop_id, slot_id, _, _ = await _active_drop_with_order(auth_client)

    resp = await auth_client.delete(f"/drops/{drop_id}/slots/{slot_id}")

    assert resp.status_code == 409, resp.text
    detail = resp.json()["detail"]
    assert "12:00 slot has orders" in detail
    assert "Move those orders to another slot first" in detail
    drop = (await auth_client.get(f"/drops/{drop_id}")).json()
    assert [s["id"] for s in drop["slots"]] == [slot_id]


@pytest.mark.asyncio
async def test_remove_empty_slot_from_active_drop_still_works(
    auth_client: AsyncClient,
):
    drop_id, slot_id, _, _ = await _active_drop_with_order(auth_client)
    empty_slot = await _add_slot(auth_client, drop_id, "12:30:00")

    resp = await auth_client.delete(f"/drops/{drop_id}/slots/{empty_slot}")

    assert resp.status_code == 204, resp.text
    drop = (await auth_client.get(f"/drops/{drop_id}")).json()
    assert [s["id"] for s in drop["slots"]] == [slot_id]


@pytest.mark.asyncio
async def test_add_slot_with_taken_pickup_time_returns_409(
    auth_client: AsyncClient,
):
    drop_id = await _create_drop(auth_client)
    await _add_slot(auth_client, drop_id, "12:00:00")

    resp = await auth_client.post(
        f"/drops/{drop_id}/slots",
        json={"pickup_time": "12:00:00", "max_pizzas": 4},
    )

    assert resp.status_code == 409, resp.text
    assert "already has a 12:00 slot" in resp.json()["detail"]
    drop = (await auth_client.get(f"/drops/{drop_id}")).json()
    assert len(drop["slots"]) == 1
    assert drop["slots"][0]["max_pizzas"] == 6


@pytest.mark.asyncio
async def test_same_pickup_time_in_another_drop_is_allowed(
    auth_client: AsyncClient,
):
    first = await _create_drop(auth_client)
    second = await _create_drop(auth_client)
    await _add_slot(auth_client, first, "12:00:00")

    await _add_slot(auth_client, second, "12:00:00")


@pytest.mark.asyncio
async def test_update_slot_to_taken_pickup_time_returns_409(
    auth_client: AsyncClient,
):
    drop_id = await _create_drop(auth_client)
    await _add_slot(auth_client, drop_id, "12:00:00")
    later = await _add_slot(auth_client, drop_id, "12:30:00")

    resp = await auth_client.patch(
        f"/drops/{drop_id}/slots/{later}", json={"pickup_time": "12:00:00"},
    )

    assert resp.status_code == 409, resp.text
    assert "already has a 12:00 slot" in resp.json()["detail"]
    drop = (await auth_client.get(f"/drops/{drop_id}")).json()
    times = sorted(s["pickup_time"] for s in drop["slots"])
    assert times == ["12:00:00", "12:30:00"]


@pytest.mark.asyncio
async def test_update_slot_keeping_its_own_pickup_time_is_allowed(
    auth_client: AsyncClient,
):
    drop_id = await _create_drop(auth_client)
    slot_id = await _add_slot(auth_client, drop_id, "12:00:00")

    resp = await auth_client.patch(
        f"/drops/{drop_id}/slots/{slot_id}",
        json={"pickup_time": "12:00:00", "max_pizzas": 9},
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["max_pizzas"] == 9
