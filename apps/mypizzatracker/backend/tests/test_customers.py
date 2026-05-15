"""Tests for the operator-facing /customers routes + the public
/public/customers/lookup endpoint that drives the order page's "the usual"
button.

Covers:
- GET    /customers requires auth
- GET    /customers returns rows with order_count + last_order_at
- GET    /customers?search=... matches name (case-insensitive) and phone digits
- GET    /customers returns customers without orders too (count=0)
- PATCH  /customers/{id}/notes requires auth
- PATCH  /customers/{id}/notes normalises blank string to None
- PATCH  /customers/{id}/notes returns 404 for unknown id

- GET    /public/customers/lookup returns 404 when no customer matches
- GET    /public/customers/lookup returns name + the_usual on match
- "The usual" excludes pizzas that have since been 86'd
- "The usual" excludes toppings that have since been 86'd
- "The usual" prefers the most recent non-no-show order over no-shows
- Phone normalisation: "(512) 555-1234" matches "5125551234"
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi_users.password import PasswordHelper

from app.models.customer.customer import Customer
from app.models.menu.pizza_type import PizzaType
from app.models.menu.topping_type import ToppingType
from app.models.order.order import Order
from app.models.user.user import User


TEST_EMAIL = "customers-test@example.com"
TEST_PASSWORD = "testpassword123!"


# ---------------------------------------------------------------------------
# Fixtures + helpers (mirror test_public_orders.py)
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def auth_client(client: AsyncClient, db: AsyncSession) -> AsyncClient:
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
    date: str = "2026-12-25",
) -> tuple[str, str]:
    drop_resp = await auth_client.post(
        "/drops",
        json={
            "date": date,
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


async def _place_order(
    client: AsyncClient,
    *,
    drop_id: str,
    slot_id: str,
    customer_name: str,
    customer_phone: str,
    pizza_id: str,
    topping_ids: list[str] | None = None,
    modifications_text: str | None = None,
) -> str:
    resp = await client.post(
        "/public/orders",
        json={
            "drop_id": drop_id,
            "slot_id": slot_id,
            "customer_name": customer_name,
            "customer_phone": customer_phone,
            "payment_method_tag": "venmo",
            "pizzas": [
                {
                    "pizza_type_id": pizza_id,
                    "topping_type_ids": topping_ids or [],
                    "modifications_text": modifications_text,
                },
            ],
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["order_id"]


async def _set_pizza_active(db: AsyncSession, pizza_id: str, active: bool) -> None:
    await db.execute(
        update(PizzaType).where(PizzaType.id == pizza_id).values(active=active),
    )
    await db.flush()


async def _set_topping_active(db: AsyncSession, topping_id: str, active: bool) -> None:
    await db.execute(
        update(ToppingType).where(ToppingType.id == topping_id).values(active=active),
    )
    await db.flush()


# ---------------------------------------------------------------------------
# Operator /customers list
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_customers_requires_auth(client: AsyncClient):
    client.headers.pop("Authorization", None)
    resp = await client.get("/customers")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_customers_returns_rollup_stats(
    client: AsyncClient, auth_client: AsyncClient,
):
    drop_id, slot_id = await _create_active_drop(auth_client, max_pizzas=10)
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")

    public_client = AsyncClient(
        transport=client._transport, base_url=client.base_url,
    )
    try:
        await _place_order(
            public_client,
            drop_id=drop_id, slot_id=slot_id,
            customer_name="Jane Doe", customer_phone="(512) 555-1234",
            pizza_id=pizza_id,
        )
        await _place_order(
            public_client,
            drop_id=drop_id, slot_id=slot_id,
            customer_name="Jane Doe", customer_phone="(512) 555-1234",
            pizza_id=pizza_id,
        )
        await _place_order(
            public_client,
            drop_id=drop_id, slot_id=slot_id,
            customer_name="Bob Burger", customer_phone="(415) 222-3333",
            pizza_id=pizza_id,
        )
    finally:
        await public_client.aclose()

    resp = await auth_client.get("/customers")
    assert resp.status_code == 200, resp.text
    rows = resp.json()
    by_phone = {r["phone"]: r for r in rows}

    jane = by_phone["5125551234"]
    assert jane["name"] == "Jane Doe"
    assert jane["order_count"] == 2
    assert jane["last_order_at"] is not None

    bob = by_phone["4152223333"]
    assert bob["order_count"] == 1


@pytest.mark.asyncio
async def test_list_customers_search_by_name_and_phone(
    client: AsyncClient, auth_client: AsyncClient,
):
    drop_id, slot_id = await _create_active_drop(auth_client, max_pizzas=10)
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")

    public_client = AsyncClient(
        transport=client._transport, base_url=client.base_url,
    )
    try:
        await _place_order(
            public_client,
            drop_id=drop_id, slot_id=slot_id,
            customer_name="Maria Jaramillo", customer_phone="5125551234",
            pizza_id=pizza_id,
        )
        await _place_order(
            public_client,
            drop_id=drop_id, slot_id=slot_id,
            customer_name="Henny P", customer_phone="9998887777",
            pizza_id=pizza_id,
        )
    finally:
        await public_client.aclose()

    # Case-insensitive name search.
    resp = await auth_client.get("/customers", params={"search": "maria"})
    assert resp.status_code == 200
    names = [r["name"] for r in resp.json()]
    assert "Maria Jaramillo" in names
    assert "Henny P" not in names

    # Phone-digit substring search ignores formatting.
    resp = await auth_client.get("/customers", params={"search": "(512) 555"})
    assert resp.status_code == 200
    phones = [r["phone"] for r in resp.json()]
    assert "5125551234" in phones
    assert "9998887777" not in phones


# ---------------------------------------------------------------------------
# Operator PATCH /customers/{id}/notes
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_notes_requires_auth(client: AsyncClient):
    client.headers.pop("Authorization", None)
    resp = await client.patch(
        "/customers/00000000-0000-0000-0000-000000000000/notes",
        json={"notes": "anything"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_update_notes_404_for_unknown_customer(auth_client: AsyncClient):
    resp = await auth_client.patch(
        "/customers/00000000-0000-0000-0000-000000000000/notes",
        json={"notes": "x"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_notes_persists_and_blank_becomes_null(
    client: AsyncClient, auth_client: AsyncClient, db: AsyncSession,
):
    drop_id, slot_id = await _create_active_drop(auth_client, max_pizzas=10)
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")
    public_client = AsyncClient(
        transport=client._transport, base_url=client.base_url,
    )
    try:
        await _place_order(
            public_client,
            drop_id=drop_id, slot_id=slot_id,
            customer_name="Tyra Gibson", customer_phone="5121112222",
            pizza_id=pizza_id,
        )
    finally:
        await public_client.aclose()

    listing = await auth_client.get("/customers")
    customer_id = next(
        r["id"] for r in listing.json() if r["phone"] == "5121112222"
    )

    resp = await auth_client.patch(
        f"/customers/{customer_id}/notes",
        json={"notes": "  prefers extra crispy crust  "},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["notes"] == "prefers extra crispy crust"

    # Blank notes => null.
    resp = await auth_client.patch(
        f"/customers/{customer_id}/notes",
        json={"notes": "   "},
    )
    assert resp.status_code == 200
    assert resp.json()["notes"] is None

    # Persisted in DB.
    db_row = await db.execute(
        select(Customer).where(Customer.phone == "5121112222"),
    )
    assert db_row.scalar_one().notes is None


# ---------------------------------------------------------------------------
# Public /public/customers/lookup
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_lookup_404_when_no_customer(client: AsyncClient):
    client.headers.pop("Authorization", None)
    resp = await client.get(
        "/public/customers/lookup", params={"phone": "5125550000"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_lookup_returns_name_and_the_usual(
    client: AsyncClient, auth_client: AsyncClient,
):
    drop_id, slot_id = await _create_active_drop(auth_client, max_pizzas=10)
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")
    topping_id = await _create_topping(auth_client, "Mushrooms", "0")

    public_client = AsyncClient(
        transport=client._transport, base_url=client.base_url,
    )
    try:
        await _place_order(
            public_client,
            drop_id=drop_id, slot_id=slot_id,
            customer_name="Jonathan Castillo",
            customer_phone="5125551234",
            pizza_id=pizza_id,
            topping_ids=[topping_id],
            modifications_text="extra crispy",
        )
    finally:
        await public_client.aclose()

    client.headers.pop("Authorization", None)
    resp = await client.get(
        "/public/customers/lookup", params={"phone": "(512) 555-1234"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["customer_name"] == "Jonathan Castillo"
    assert len(body["the_usual"]) == 1
    line = body["the_usual"][0]
    assert line["pizza_type_id"] == pizza_id
    assert line["topping_type_ids"] == [topping_id]
    assert line["modifications_text"] == "extra crispy"


@pytest.mark.asyncio
async def test_lookup_filters_out_inactive_pizza_from_the_usual(
    client: AsyncClient, auth_client: AsyncClient, db: AsyncSession,
):
    drop_id, slot_id = await _create_active_drop(auth_client, max_pizzas=10)
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")

    public_client = AsyncClient(
        transport=client._transport, base_url=client.base_url,
    )
    try:
        await _place_order(
            public_client,
            drop_id=drop_id, slot_id=slot_id,
            customer_name="Janette", customer_phone="5125559999",
            pizza_id=pizza_id,
        )
    finally:
        await public_client.aclose()

    # 86 the pizza after the order.
    await _set_pizza_active(db, pizza_id, False)

    client.headers.pop("Authorization", None)
    resp = await client.get(
        "/public/customers/lookup", params={"phone": "5125559999"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["customer_name"] == "Janette"
    assert body["the_usual"] == []  # filtered out


@pytest.mark.asyncio
async def test_lookup_filters_out_inactive_topping_keeps_pizza(
    client: AsyncClient, auth_client: AsyncClient, db: AsyncSession,
):
    drop_id, slot_id = await _create_active_drop(auth_client, max_pizzas=10)
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")
    keep_topping = await _create_topping(auth_client, "Mushrooms", "0")
    drop_topping = await _create_topping(auth_client, "Truffle", "5.00")

    public_client = AsyncClient(
        transport=client._transport, base_url=client.base_url,
    )
    try:
        await _place_order(
            public_client,
            drop_id=drop_id, slot_id=slot_id,
            customer_name="Bryan Ruezga", customer_phone="5125557777",
            pizza_id=pizza_id, topping_ids=[keep_topping, drop_topping],
        )
    finally:
        await public_client.aclose()

    await _set_topping_active(db, drop_topping, False)

    client.headers.pop("Authorization", None)
    resp = await client.get(
        "/public/customers/lookup", params={"phone": "5125557777"},
    )
    assert resp.status_code == 200
    line = resp.json()["the_usual"][0]
    assert line["topping_type_ids"] == [keep_topping]


@pytest.mark.asyncio
async def test_lookup_excludes_no_show_orders_from_the_usual(
    client: AsyncClient, auth_client: AsyncClient, db: AsyncSession,
):
    drop_id, slot_id = await _create_active_drop(auth_client, max_pizzas=10)
    earlier_pizza = await _create_pizza(auth_client, "La Clasica", "17.00")
    later_pizza = await _create_pizza(auth_client, "La Toxica", "19.00")

    public_client = AsyncClient(
        transport=client._transport, base_url=client.base_url,
    )
    try:
        # First order -- will become the "usual"; second order is marked no_show.
        await _place_order(
            public_client,
            drop_id=drop_id, slot_id=slot_id,
            customer_name="Kevlin Ware", customer_phone="5125558888",
            pizza_id=earlier_pizza,
        )
        no_show_id = await _place_order(
            public_client,
            drop_id=drop_id, slot_id=slot_id,
            customer_name="Kevlin Ware", customer_phone="5125558888",
            pizza_id=later_pizza,
        )
    finally:
        await public_client.aclose()

    await db.execute(
        update(Order).where(Order.id == no_show_id).values(status="no_show"),
    )
    await db.flush()

    client.headers.pop("Authorization", None)
    resp = await client.get(
        "/public/customers/lookup", params={"phone": "5125558888"},
    )
    assert resp.status_code == 200
    line = resp.json()["the_usual"][0]
    assert line["pizza_type_id"] == earlier_pizza
