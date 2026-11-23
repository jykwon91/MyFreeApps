"""PATCH bodies: explicit null on a NOT NULL column is a 422; omitted is unchanged; nullable clears."""
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
    email = "patch-null-test@example.com"
    password = "testpassword123!"
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user is None:
        db.add(User(
            email=email,
            hashed_password=hash_test_password(password),
            is_verified=True,
            is_active=True,
        ))
        await db.commit()
    resp = await client.post(
        "/auth/jwt/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert resp.status_code == 200, resp.text
    client.headers["Authorization"] = f"Bearer {resp.json()['access_token']}"
    return client


async def _create_drop(c: AsyncClient) -> dict:
    resp = await c.post("/drops", json={
        "date": "2026-12-25",
        "name": "Dec 25th",
        "slot_window_start": "11:00:00",
        "slot_window_end": "15:30:00",
    })
    assert resp.status_code == 201, resp.text
    return resp.json()


DROP_NON_NULLABLE = ["name", "date", "slot_window_start", "slot_window_end", "status", "tip_total"]


@pytest.mark.asyncio
@pytest.mark.parametrize("field", DROP_NON_NULLABLE)
async def test_drop_patch_null_rejected_and_unchanged(auth_client: AsyncClient, field: str):
    drop = await _create_drop(auth_client)
    resp = await auth_client.patch(f"/drops/{drop['id']}", json={field: None})
    assert resp.status_code == 422, resp.text
    after = (await auth_client.get(f"/drops/{drop['id']}")).json()
    assert after[field] == drop[field]


@pytest.mark.asyncio
async def test_drop_patch_omitted_fields_unchanged(auth_client: AsyncClient):
    drop = await _create_drop(auth_client)
    resp = await auth_client.patch(f"/drops/{drop['id']}", json={"name": "Renamed"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["name"] == "Renamed"
    assert resp.json()["date"] == drop["date"]
    assert resp.json()["slot_window_start"] == drop["slot_window_start"]


@pytest.mark.asyncio
@pytest.mark.parametrize("field", ["pickup_time", "max_pizzas"])
async def test_slot_patch_null_rejected_and_unchanged(auth_client: AsyncClient, field: str):
    drop = await _create_drop(auth_client)
    slot = (await auth_client.post(
        f"/drops/{drop['id']}/slots", json={"pickup_time": "12:00:00", "max_pizzas": 6},
    )).json()
    resp = await auth_client.patch(
        f"/drops/{drop['id']}/slots/{slot['id']}", json={field: None},
    )
    assert resp.status_code == 422, resp.text
    slots = (await auth_client.get(f"/drops/{drop['id']}")).json()["slots"]
    assert slots[0][field] == slot[field]


@pytest.mark.asyncio
async def test_slot_patch_omitted_field_unchanged(auth_client: AsyncClient):
    drop = await _create_drop(auth_client)
    slot = (await auth_client.post(
        f"/drops/{drop['id']}/slots", json={"pickup_time": "12:00:00", "max_pizzas": 6},
    )).json()
    resp = await auth_client.patch(
        f"/drops/{drop['id']}/slots/{slot['id']}", json={"max_pizzas": 9},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["max_pizzas"] == 9
    assert resp.json()["pickup_time"] == slot["pickup_time"]


async def _create_expense(c: AsyncClient) -> tuple[str, dict]:
    drop = await _create_drop(c)
    resp = await c.post(
        f"/financials/drops/{drop['id']}/expenses",
        json={"vendor": "Costco", "category": "ingredients", "amount": "32.50", "description": "flour"},
    )
    assert resp.status_code == 201, resp.text
    return drop["id"], resp.json()


@pytest.mark.asyncio
@pytest.mark.parametrize("field", ["vendor", "category", "amount"])
async def test_expense_patch_null_rejected_and_unchanged(auth_client: AsyncClient, field: str):
    drop_id, expense = await _create_expense(auth_client)
    resp = await auth_client.patch(f"/financials/expenses/{expense['id']}", json={field: None})
    assert resp.status_code == 422, resp.text
    listed = (await auth_client.get(f"/financials/drops/{drop_id}/expenses")).json()
    assert listed[0][field] == expense[field]


@pytest.mark.asyncio
async def test_expense_patch_null_description_clears_it(auth_client: AsyncClient):
    _, expense = await _create_expense(auth_client)
    resp = await auth_client.patch(f"/financials/expenses/{expense['id']}", json={"description": None})
    assert resp.status_code == 200, resp.text
    assert resp.json()["description"] is None
    assert resp.json()["vendor"] == "Costco"


@pytest.mark.asyncio
async def test_expense_patch_omitted_fields_unchanged(auth_client: AsyncClient):
    _, expense = await _create_expense(auth_client)
    resp = await auth_client.patch(f"/financials/expenses/{expense['id']}", json={"vendor": "Sysco"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["amount"] == expense["amount"]
    assert resp.json()["description"] == "flour"


@pytest.mark.asyncio
@pytest.mark.parametrize("field", ["name", "price", "active"])
async def test_pizza_patch_null_rejected_and_unchanged(auth_client: AsyncClient, field: str):
    pizza = (await auth_client.post(
        "/menu/pizzas",
        json={"name": "Margherita", "price": "17.00", "description": "classic", "active": True},
    )).json()
    resp = await auth_client.patch(f"/menu/pizzas/{pizza['id']}", json={field: None})
    assert resp.status_code == 422, resp.text
    pizzas = (await auth_client.get("/menu")).json()["pizzas"]
    assert next(p for p in pizzas if p["id"] == pizza["id"])[field] == pizza[field]


@pytest.mark.asyncio
async def test_pizza_patch_null_description_clears_it(auth_client: AsyncClient):
    pizza = (await auth_client.post(
        "/menu/pizzas",
        json={"name": "Margherita", "price": "17.00", "description": "classic", "active": True},
    )).json()
    resp = await auth_client.patch(f"/menu/pizzas/{pizza['id']}", json={"description": None})
    assert resp.status_code == 200, resp.text
    assert resp.json()["description"] is None
    assert resp.json()["name"] == "Margherita"


@pytest.mark.asyncio
@pytest.mark.parametrize("field", ["name", "price_delta", "active"])
async def test_topping_patch_null_rejected_and_unchanged(auth_client: AsyncClient, field: str):
    topping = (await auth_client.post(
        "/menu/toppings", json={"name": "Basil", "price_delta": "1.00", "active": True},
    )).json()
    resp = await auth_client.patch(f"/menu/toppings/{topping['id']}", json={field: None})
    assert resp.status_code == 422, resp.text
    toppings = (await auth_client.get("/menu")).json()["toppings"]
    assert next(t for t in toppings if t["id"] == topping["id"])[field] == topping[field]


@pytest.mark.asyncio
async def test_topping_patch_omitted_fields_unchanged(auth_client: AsyncClient):
    topping = (await auth_client.post(
        "/menu/toppings", json={"name": "Basil", "price_delta": "1.00", "active": True},
    )).json()
    resp = await auth_client.patch(f"/menu/toppings/{topping['id']}", json={"active": False})
    assert resp.status_code == 200, resp.text
    assert resp.json()["name"] == "Basil"
    assert resp.json()["price_delta"] == topping["price_delta"]
