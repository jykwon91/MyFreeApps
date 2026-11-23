"""GET /users/me/export -- includes the operator's pizza data, never secrets."""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.testing.factories import hash_test_password

from app.models.user.user import User

TEST_EMAIL = "export-test@example.com"
TEST_PASSWORD = "testpassword123!"


@pytest_asyncio.fixture
async def auth_client(client: AsyncClient, db: AsyncSession) -> AsyncClient:
    user = (await db.execute(select(User).where(User.email == TEST_EMAIL))).scalar_one_or_none()
    if user is None:
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
    if resp.status_code != 200:
        pytest.fail(f"Auth failed: {resp.status_code} {resp.text}")
    client.headers["Authorization"] = f"Bearer {resp.json().get('access_token', '')}"
    return client


async def _post(client: AsyncClient, url: str, body: dict) -> dict:
    resp = await client.post(url, json=body)
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_export_includes_all_pizza_data(auth_client: AsyncClient) -> None:
    pizza = await _post(auth_client, "/menu/pizzas", {
        "name": "La Clasica", "price": "17.00", "description": "classic", "active": True,
    })
    topping = await _post(auth_client, "/menu/toppings", {
        "name": "Mushrooms", "price_delta": "1.50", "active": True,
    })
    drop = await _post(auth_client, "/drops", {
        "date": "2026-12-25", "name": "Christmas Drop",
        "slot_window_start": "11:00:00", "slot_window_end": "15:30:00",
    })
    slot = await _post(auth_client, f"/drops/{drop['id']}/slots", {
        "pickup_time": "12:00:00", "max_pizzas": 6,
    })
    activate = await auth_client.patch(f"/drops/{drop['id']}", json={"status": "active"})
    assert activate.status_code == 200, activate.text
    order = await _post(auth_client, "/public/orders", {
        "drop_id": drop["id"], "slot_id": slot["id"],
        "customer_name": "Ana", "customer_phone": "5125551234",
        "payment_method_tag": "venmo",
        "pizzas": [{
            "pizza_type_id": pizza["id"],
            "topping_type_ids": [topping["id"]],
            "modifications_text": "well done",
        }],
    })
    await _post(auth_client, f"/financials/drops/{drop['id']}/expenses", {
        "vendor": "Costco", "category": "ingredients", "amount": "32.50",
    })

    resp = await auth_client.get("/users/me/export")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["user"]["email"] == TEST_EMAIL
    assert [d["name"] for d in body["drops"]] == ["Christmas Drop"]
    assert [s["pickup_time"] for s in body["drops"][0]["slots"]] == ["12:00:00"]
    assert [p["name"] for p in body["menu"]["pizzas"]] == ["La Clasica"]
    assert body["menu"]["pizzas"][0]["price"] == "17.00"
    assert [t["name"] for t in body["menu"]["toppings"]] == ["Mushrooms"]
    assert [c["name"] for c in body["customers"]] == ["Ana"]
    assert len(body["orders"]) == 1
    exported_order = body["orders"][0]
    assert exported_order["id"] == order["order_id"]
    assert exported_order["pizzas"][0]["modifications_text"] == "well done"
    assert exported_order["pizzas"][0]["toppings"][0]["topping_type_id"] == topping["id"]
    assert [e["vendor"] for e in body["expenses"]] == ["Costco"]
    assert body["expenses"][0]["amount"] == "32.50"
    for secret in ("hashed_password", "totp_secret", "recovery_codes"):
        assert secret not in resp.text
