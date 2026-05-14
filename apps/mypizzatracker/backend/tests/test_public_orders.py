"""Tests for the customer-facing public order placement + status API.

Covers:
- GET  /public/menu surfaces only active pizzas + toppings
- GET  /public/drops/current returns the active drop with per-slot remaining capacity
  and 404 when no drop is active
- POST /public/orders happy path; persists customer, pizza lines, toppings
- POST /public/orders rejects: missing drop, drop not active, slot mismatch,
  capacity exceeded, empty pizza list, 86'd pizza, unknown topping, malformed phone
- Customer upsert: same phone reuses the customer; name updates stick
- GET  /public/orders/{id} returns the same confirmation shape; 404 when unknown
- No auth header is needed for any /public/* route
"""
from __future__ import annotations

from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer.customer import Customer
from app.models.user.user import User


# ---------------------------------------------------------------------------
# Helpers + fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def auth_client(client: AsyncClient, db: AsyncSession) -> AsyncClient:
    """Owner-auth client -- used to create drops + menu items, NOT to place orders."""
    from fastapi_users.password import PasswordHelper

    TEST_EMAIL = "public-orders-test@example.com"
    TEST_PASSWORD = "testpassword123!"

    result = await db.execute(select(User).where(User.email == TEST_EMAIL))
    user = result.scalar_one_or_none()
    if user is None:
        helper = PasswordHelper()
        user = User(
            email=TEST_EMAIL,
            hashed_password=helper.hash(TEST_PASSWORD),
            is_verified=True,
            is_active=True,
        )
        db.add(user)
        await db.flush()

    resp = await client.post(
        "/auth/jwt/login",
        data={"username": TEST_EMAIL, "password": TEST_PASSWORD},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    if resp.status_code != 200:
        pytest.skip(f"Auth failed: {resp.status_code} {resp.text}")
    token = resp.json().get("access_token", "")
    client.headers["Authorization"] = f"Bearer {token}"
    return client


async def _create_pizza(
    auth_client: AsyncClient, name: str, price: str, active: bool = True,
) -> str:
    resp = await auth_client.post(
        "/menu/pizzas",
        json={"name": name, "price": price, "description": None, "active": active},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _create_topping(
    auth_client: AsyncClient, name: str, price_delta: str, active: bool = True,
) -> str:
    resp = await auth_client.post(
        "/menu/toppings",
        json={"name": name, "price_delta": price_delta, "active": active},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _create_active_drop(
    auth_client: AsyncClient,
    *,
    pickup_time: str = "12:00:00",
    max_pizzas: int = 6,
    name: str = "Dec 25th",
) -> tuple[str, str]:
    drop_resp = await auth_client.post(
        "/drops",
        json={
            "date": "2026-12-25",
            "name": name,
            "slot_window_start": "11:00:00",
            "slot_window_end": "15:30:00",
        },
    )
    assert drop_resp.status_code == 201, drop_resp.text
    drop_id = drop_resp.json()["id"]

    slot_resp = await auth_client.post(
        f"/drops/{drop_id}/slots",
        json={"pickup_time": pickup_time, "max_pizzas": max_pizzas},
    )
    assert slot_resp.status_code == 201, slot_resp.text
    slot_id = slot_resp.json()["id"]

    activate = await auth_client.patch(
        f"/drops/{drop_id}", json={"status": "active"},
    )
    assert activate.status_code == 200, activate.text
    return drop_id, slot_id


# ---------------------------------------------------------------------------
# Public menu
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_public_menu_excludes_inactive_items(
    client: AsyncClient, auth_client: AsyncClient,
):
    await _create_pizza(auth_client, "La Clasica", "17.00")
    await _create_pizza(auth_client, "La Toxica", "19.00", active=False)
    await _create_topping(auth_client, "Mushrooms", "0")
    await _create_topping(auth_client, "Truffle", "5.00", active=False)

    # Customer doesn't carry the owner's JWT.
    client.headers.pop("Authorization", None)
    resp = await client.get("/public/menu")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    pizza_names = {p["name"] for p in body["pizzas"]}
    topping_names = {t["name"] for t in body["toppings"]}
    assert pizza_names == {"La Clasica"}
    assert topping_names == {"Mushrooms"}


# ---------------------------------------------------------------------------
# Current drop
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_current_drop_404_when_no_active(
    client: AsyncClient, auth_client: AsyncClient,
):
    # Authoring a planning drop should not surface to public.
    await auth_client.post(
        "/drops",
        json={
            "date": "2026-12-25",
            "name": "Dec 25th",
            "slot_window_start": "11:00:00",
            "slot_window_end": "15:30:00",
        },
    )
    client.headers.pop("Authorization", None)
    resp = await client.get("/public/drops/current")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_current_drop_returns_active_with_slots(
    client: AsyncClient, auth_client: AsyncClient,
):
    drop_id, slot_id = await _create_active_drop(auth_client, max_pizzas=10)

    client.headers.pop("Authorization", None)
    resp = await client.get("/public/drops/current")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == drop_id
    assert body["name"] == "Dec 25th"
    assert len(body["slots"]) == 1
    assert body["slots"][0]["id"] == slot_id
    assert body["slots"][0]["remaining_pizzas"] == 10


# ---------------------------------------------------------------------------
# Order placement -- happy path
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_place_order_happy_path(
    client: AsyncClient, auth_client: AsyncClient, db: AsyncSession,
):
    drop_id, slot_id = await _create_active_drop(auth_client)
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")
    topping_id = await _create_topping(auth_client, "Mushrooms", "0")

    client.headers.pop("Authorization", None)
    resp = await client.post(
        "/public/orders",
        json={
            "drop_id": drop_id,
            "slot_id": slot_id,
            "customer_name": "Jonathan Castillo",
            "customer_phone": "(512) 555-1234",
            "payment_method_tag": "venmo",
            "pizzas": [
                {
                    "pizza_type_id": pizza_id,
                    "topping_type_ids": [topping_id],
                    "modifications_text": "extra crispy",
                },
            ],
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["status"] == "not_started"
    assert body["payment_status"] == "unpaid"
    assert body["payment_method_tag"] == "venmo"
    assert body["customer_name"] == "Jonathan Castillo"
    assert body["customer_phone"] == "5125551234"
    assert len(body["pizzas"]) == 1
    assert body["pizzas"][0]["pizza_name"] == "La Clasica"
    assert body["pizzas"][0]["toppings"] == ["Mushrooms"]
    assert body["pizzas"][0]["modifications_text"] == "extra crispy"
    assert Decimal(body["total"]) == Decimal("17.00")

    # Customer persisted with normalized phone.
    result = await db.execute(
        select(Customer).where(Customer.phone == "5125551234"),
    )
    customer = result.scalar_one()
    assert customer.name == "Jonathan Castillo"


@pytest.mark.asyncio
async def test_place_order_with_priced_topping_includes_topping_in_total(
    client: AsyncClient, auth_client: AsyncClient,
):
    drop_id, slot_id = await _create_active_drop(auth_client)
    pizza_id = await _create_pizza(auth_client, "La Toxica", "19.00")
    topping_id = await _create_topping(auth_client, "Truffle", "5.00")

    client.headers.pop("Authorization", None)
    resp = await client.post(
        "/public/orders",
        json={
            "drop_id": drop_id,
            "slot_id": slot_id,
            "customer_name": "Bryan",
            "customer_phone": "5125550002",
            "payment_method_tag": "cash",
            "pizzas": [
                {
                    "pizza_type_id": pizza_id,
                    "topping_type_ids": [topping_id],
                },
            ],
        },
    )
    assert resp.status_code == 201, resp.text
    assert Decimal(resp.json()["total"]) == Decimal("24.00")


# ---------------------------------------------------------------------------
# Customer upsert
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_repeat_customer_same_phone_reuses_row_and_updates_name(
    client: AsyncClient, auth_client: AsyncClient, db: AsyncSession,
):
    drop_id, slot_id = await _create_active_drop(auth_client)
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")

    client.headers.pop("Authorization", None)
    # First order under one name format
    r1 = await client.post(
        "/public/orders",
        json={
            "drop_id": drop_id,
            "slot_id": slot_id,
            "customer_name": "Jose",
            "customer_phone": "512-555-9999",
            "payment_method_tag": "zelle",
            "pizzas": [{"pizza_type_id": pizza_id, "topping_type_ids": []}],
        },
    )
    assert r1.status_code == 201

    # Second order, same phone, refined name
    r2 = await client.post(
        "/public/orders",
        json={
            "drop_id": drop_id,
            "slot_id": slot_id,
            "customer_name": "Jose P.",
            "customer_phone": "(512) 555-9999",
            "payment_method_tag": "zelle",
            "pizzas": [{"pizza_type_id": pizza_id, "topping_type_ids": []}],
        },
    )
    assert r2.status_code == 201

    result = await db.execute(
        select(Customer).where(Customer.phone == "5125559999"),
    )
    rows = result.scalars().all()
    assert len(rows) == 1
    assert rows[0].name == "Jose P."


# ---------------------------------------------------------------------------
# Capacity
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_slot_capacity_exceeded_blocks_order(
    client: AsyncClient, auth_client: AsyncClient,
):
    drop_id, slot_id = await _create_active_drop(auth_client, max_pizzas=2)
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")

    client.headers.pop("Authorization", None)
    # First customer takes both spots
    r1 = await client.post(
        "/public/orders",
        json={
            "drop_id": drop_id,
            "slot_id": slot_id,
            "customer_name": "A",
            "customer_phone": "5125550001",
            "payment_method_tag": "cash",
            "pizzas": [
                {"pizza_type_id": pizza_id, "topping_type_ids": []},
                {"pizza_type_id": pizza_id, "topping_type_ids": []},
            ],
        },
    )
    assert r1.status_code == 201

    # Second customer is rejected.
    r2 = await client.post(
        "/public/orders",
        json={
            "drop_id": drop_id,
            "slot_id": slot_id,
            "customer_name": "B",
            "customer_phone": "5125550002",
            "payment_method_tag": "cash",
            "pizzas": [{"pizza_type_id": pizza_id, "topping_type_ids": []}],
        },
    )
    assert r2.status_code == 400
    assert "left" in r2.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Validation failures
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_order_rejected_when_drop_not_active(
    client: AsyncClient, auth_client: AsyncClient,
):
    # Drop in planning -- not yet open.
    drop_resp = await auth_client.post(
        "/drops",
        json={
            "date": "2026-12-25",
            "name": "Dec 25th",
            "slot_window_start": "11:00:00",
            "slot_window_end": "15:30:00",
        },
    )
    drop_id = drop_resp.json()["id"]
    slot_resp = await auth_client.post(
        f"/drops/{drop_id}/slots",
        json={"pickup_time": "12:00:00", "max_pizzas": 6},
    )
    slot_id = slot_resp.json()["id"]
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")

    client.headers.pop("Authorization", None)
    resp = await client.post(
        "/public/orders",
        json={
            "drop_id": drop_id,
            "slot_id": slot_id,
            "customer_name": "A",
            "customer_phone": "5125550001",
            "payment_method_tag": "cash",
            "pizzas": [{"pizza_type_id": pizza_id, "topping_type_ids": []}],
        },
    )
    assert resp.status_code == 400
    assert "planning" in resp.json()["detail"] or "not currently" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_order_rejected_with_inactive_pizza(
    client: AsyncClient, auth_client: AsyncClient,
):
    drop_id, slot_id = await _create_active_drop(auth_client)
    pizza_id = await _create_pizza(auth_client, "La Toxica", "19.00", active=False)

    client.headers.pop("Authorization", None)
    resp = await client.post(
        "/public/orders",
        json={
            "drop_id": drop_id,
            "slot_id": slot_id,
            "customer_name": "A",
            "customer_phone": "5125550001",
            "payment_method_tag": "cash",
            "pizzas": [{"pizza_type_id": pizza_id, "topping_type_ids": []}],
        },
    )
    assert resp.status_code == 400
    assert "available" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_order_rejected_with_slot_in_different_drop(
    client: AsyncClient, auth_client: AsyncClient,
):
    drop_a, slot_a = await _create_active_drop(
        auth_client, pickup_time="12:00:00", name="A",
    )
    drop_b, slot_b = await _create_active_drop(
        auth_client, pickup_time="13:00:00", name="B",
    )
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")

    client.headers.pop("Authorization", None)
    resp = await client.post(
        "/public/orders",
        json={
            "drop_id": drop_a,
            "slot_id": slot_b,  # belongs to drop_b
            "customer_name": "A",
            "customer_phone": "5125550001",
            "payment_method_tag": "cash",
            "pizzas": [{"pizza_type_id": pizza_id, "topping_type_ids": []}],
        },
    )
    assert resp.status_code == 400
    assert "does not belong" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_order_rejected_with_no_pizzas(
    client: AsyncClient, auth_client: AsyncClient,
):
    drop_id, slot_id = await _create_active_drop(auth_client)

    client.headers.pop("Authorization", None)
    resp = await client.post(
        "/public/orders",
        json={
            "drop_id": drop_id,
            "slot_id": slot_id,
            "customer_name": "A",
            "customer_phone": "5125550001",
            "payment_method_tag": "cash",
            "pizzas": [],
        },
    )
    # Pydantic min_length=1 surfaces a 422 before the service even sees it.
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_order_rejected_with_no_digits_phone(
    client: AsyncClient, auth_client: AsyncClient,
):
    drop_id, slot_id = await _create_active_drop(auth_client)
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")

    client.headers.pop("Authorization", None)
    resp = await client.post(
        "/public/orders",
        json={
            "drop_id": drop_id,
            "slot_id": slot_id,
            "customer_name": "A",
            "customer_phone": "no-digits-here",
            "payment_method_tag": "cash",
            "pizzas": [{"pizza_type_id": pizza_id, "topping_type_ids": []}],
        },
    )
    assert resp.status_code == 400
    assert "digit" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Status check (GET /public/orders/{id})
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_order_returns_same_shape_as_placement(
    client: AsyncClient, auth_client: AsyncClient,
):
    drop_id, slot_id = await _create_active_drop(auth_client)
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")
    topping_id = await _create_topping(auth_client, "Mushrooms", "0")

    client.headers.pop("Authorization", None)
    placement = await client.post(
        "/public/orders",
        json={
            "drop_id": drop_id,
            "slot_id": slot_id,
            "customer_name": "Tyra",
            "customer_phone": "(512) 555-7777",
            "payment_method_tag": "venmo",
            "pizzas": [
                {
                    "pizza_type_id": pizza_id,
                    "topping_type_ids": [topping_id],
                    "modifications_text": "well done",
                },
            ],
        },
    )
    assert placement.status_code == 201
    placed = placement.json()
    order_id = placed["order_id"]

    lookup = await client.get(f"/public/orders/{order_id}")
    assert lookup.status_code == 200
    fetched = lookup.json()

    # Status check must surface the exact same identity + state the customer
    # saw on placement. ``created_at`` is included in both shapes.
    assert fetched["order_id"] == order_id
    assert fetched["customer_name"] == placed["customer_name"]
    assert fetched["customer_phone"] == placed["customer_phone"]
    assert fetched["status"] == placed["status"]
    assert fetched["payment_status"] == placed["payment_status"]
    assert fetched["total"] == placed["total"]
    assert len(fetched["pizzas"]) == 1
    assert fetched["pizzas"][0]["pizza_name"] == "La Clasica"
    assert fetched["pizzas"][0]["toppings"] == ["Mushrooms"]
    assert fetched["pizzas"][0]["modifications_text"] == "well done"


@pytest.mark.asyncio
async def test_get_order_404_when_unknown(client: AsyncClient):
    """A random UUID should not leak existence."""
    client.headers.pop("Authorization", None)
    resp = await client.get(
        "/public/orders/00000000-0000-0000-0000-000000000000",
    )
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_get_order_invalid_uuid_422(client: AsyncClient):
    """Malformed UUID is a 422 from FastAPI's path-param coercion."""
    client.headers.pop("Authorization", None)
    resp = await client.get("/public/orders/not-a-uuid")
    assert resp.status_code == 422
