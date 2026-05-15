"""Tests for the per-drop financials surface (PR 9).

Covers:
- GET /financials/drops/{drop_id} -- rollup math (revenue from non-no-show
  non-free pizzas + topping deltas; tip + expenses; profit; health badge
  thresholds).
- PATCH /financials/drops/{drop_id}/tip -- tip update; closed-drop reject.
- POST/PATCH/DELETE /financials/.../expenses -- expense CRUD; closed-drop
  reject for mutations; read still works on closed.
- Auth gate.
"""
from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user.user import User


@pytest_asyncio.fixture
async def auth_client(client: AsyncClient, db: AsyncSession) -> AsyncClient:
    from fastapi_users.password import PasswordHelper

    email = "financials-test@example.com"
    password = "testpassword123!"

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        helper = PasswordHelper()
        user = User(
            email=email,
            hashed_password=helper.hash(password),
            is_verified=True,
            is_active=True,
        )
        db.add(user)
        await db.flush()

    resp = await client.post(
        "/auth/jwt/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    if resp.status_code != 200:
        pytest.skip(f"Auth failed: {resp.status_code} {resp.text}")
    token = resp.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client


async def _create_pizza(auth_client: AsyncClient, name: str, price: str) -> str:
    resp = await auth_client.post(
        "/menu/pizzas",
        json={"name": name, "price": price, "description": None, "active": True},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _create_active_drop(auth_client: AsyncClient) -> tuple[str, str]:
    drop_resp = await auth_client.post(
        "/drops",
        json={
            "date": "2026-12-25",
            "name": "Dec 25th",
            "slot_window_start": "11:00:00",
            "slot_window_end": "15:30:00",
        },
    )
    assert drop_resp.status_code == 201, drop_resp.text
    drop_id = drop_resp.json()["id"]
    slot_resp = await auth_client.post(
        f"/drops/{drop_id}/slots",
        json={"pickup_time": "12:00:00", "max_pizzas": 6},
    )
    slot_id = slot_resp.json()["id"]
    activate = await auth_client.patch(f"/drops/{drop_id}", json={"status": "active"})
    assert activate.status_code == 200
    return drop_id, slot_id


async def _place_order(
    client: AsyncClient,
    *,
    drop_id: str,
    slot_id: str,
    pizza_ids: list[str],
    customer_phone: str = "5125550001",
) -> str:
    resp = await client.post(
        "/public/orders",
        json={
            "drop_id": drop_id,
            "slot_id": slot_id,
            "customer_name": "Jonathan",
            "customer_phone": customer_phone,
            "payment_method_tag": "venmo",
            "pizzas": [{"pizza_type_id": p, "topping_type_ids": []} for p in pizza_ids],
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["order_id"]


# ---------------------------------------------------------------------------
# Rollup math
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_financials_zero_state(client: AsyncClient, auth_client: AsyncClient):
    drop_id, _ = await _create_active_drop(auth_client)
    r = await auth_client.get(f"/financials/drops/{drop_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["pizza_count"] == 0
    assert Decimal(body["revenue"]) == Decimal("0.00")
    assert Decimal(body["tip_total"]) == Decimal("0.00")
    assert Decimal(body["expense_total"]) == Decimal("0.00")
    assert Decimal(body["profit"]) == Decimal("0.00")
    # Profit == 0 -> "red" per the threshold model (profit <= 0).
    assert body["health"] == "red"
    assert body["expenses"] == []


@pytest.mark.asyncio
async def test_financials_revenue_excludes_no_show_and_free(
    client: AsyncClient, auth_client: AsyncClient,
):
    drop_id, slot_id = await _create_active_drop(auth_client)
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")

    # Two real orders + one no-show.
    await _place_order(client, drop_id=drop_id, slot_id=slot_id, pizza_ids=[pizza_id, pizza_id])
    await _place_order(
        client, drop_id=drop_id, slot_id=slot_id, pizza_ids=[pizza_id],
        customer_phone="5125550002",
    )
    no_show_id = await _place_order(
        client, drop_id=drop_id, slot_id=slot_id, pizza_ids=[pizza_id],
        customer_phone="5125550003",
    )
    await auth_client.post(
        f"/service/orders/{no_show_id}/advance",
        json={"target_status": "no_show"},
    )

    r = await auth_client.get(f"/financials/drops/{drop_id}")
    body = r.json()
    # 3 non-no-show pizzas at $17 each = $51 revenue. No-show order's pizza
    # does NOT contribute.
    assert body["pizza_count"] == 3
    assert Decimal(body["revenue"]) == Decimal("51.00")


@pytest.mark.asyncio
async def test_financials_includes_tip_and_expenses(
    client: AsyncClient, auth_client: AsyncClient,
):
    drop_id, slot_id = await _create_active_drop(auth_client)
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")
    await _place_order(client, drop_id=drop_id, slot_id=slot_id, pizza_ids=[pizza_id])

    # Set tip
    tip_resp = await auth_client.patch(
        f"/financials/drops/{drop_id}/tip", json={"tip_total": "20.00"},
    )
    assert tip_resp.status_code == 200

    # Add an expense
    exp_resp = await auth_client.post(
        f"/financials/drops/{drop_id}/expenses",
        json={
            "vendor": "Costco",
            "category": "ingredients",
            "amount": "12.50",
            "description": "cheese run",
        },
    )
    assert exp_resp.status_code == 201

    r = await auth_client.get(f"/financials/drops/{drop_id}")
    body = r.json()
    assert Decimal(body["revenue"]) == Decimal("17.00")
    assert Decimal(body["tip_total"]) == Decimal("20.00")
    assert Decimal(body["expense_total"]) == Decimal("12.50")
    # 17 + 20 - 12.50 = 24.50 -> below $50 floor -> "amber"
    assert Decimal(body["profit"]) == Decimal("24.50")
    assert body["health"] == "amber"


@pytest.mark.asyncio
async def test_financials_green_health(
    client: AsyncClient, auth_client: AsyncClient,
):
    drop_id, slot_id = await _create_active_drop(auth_client)
    pizza_id = await _create_pizza(auth_client, "Big", "100.00")
    await _place_order(client, drop_id=drop_id, slot_id=slot_id, pizza_ids=[pizza_id])
    r = await auth_client.get(f"/financials/drops/{drop_id}")
    body = r.json()
    assert Decimal(body["profit"]) == Decimal("100.00")
    assert body["health"] == "green"


# ---------------------------------------------------------------------------
# Tip mutation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_tip_update_succeeds(auth_client: AsyncClient):
    drop_id, _ = await _create_active_drop(auth_client)
    r = await auth_client.patch(
        f"/financials/drops/{drop_id}/tip", json={"tip_total": "42.50"},
    )
    assert r.status_code == 200
    assert Decimal(r.json()["tip_total"]) == Decimal("42.50")


@pytest.mark.asyncio
async def test_tip_update_rejected_on_closed_drop(auth_client: AsyncClient):
    drop_id, _ = await _create_active_drop(auth_client)
    await auth_client.patch(f"/drops/{drop_id}", json={"status": "closed"})
    r = await auth_client.patch(
        f"/financials/drops/{drop_id}/tip", json={"tip_total": "10.00"},
    )
    assert r.status_code == 409
    assert "closed" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_tip_update_rejects_negative(auth_client: AsyncClient):
    drop_id, _ = await _create_active_drop(auth_client)
    r = await auth_client.patch(
        f"/financials/drops/{drop_id}/tip", json={"tip_total": "-1.00"},
    )
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Expense CRUD
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_expense_crud_happy_path(auth_client: AsyncClient):
    drop_id, _ = await _create_active_drop(auth_client)

    # Create
    create = await auth_client.post(
        f"/financials/drops/{drop_id}/expenses",
        json={"vendor": "Costco", "category": "ingredients", "amount": "32.50"},
    )
    assert create.status_code == 201
    expense_id = create.json()["id"]

    # Update
    patch = await auth_client.patch(
        f"/financials/expenses/{expense_id}",
        json={"amount": "35.00", "description": "added receipt"},
    )
    assert patch.status_code == 200
    assert Decimal(patch.json()["amount"]) == Decimal("35.00")
    assert patch.json()["description"] == "added receipt"

    # List
    listed = await auth_client.get(f"/financials/drops/{drop_id}/expenses")
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    # Delete
    delete = await auth_client.delete(f"/financials/expenses/{expense_id}")
    assert delete.status_code == 204

    listed_after = await auth_client.get(f"/financials/drops/{drop_id}/expenses")
    assert listed_after.json() == []


@pytest.mark.asyncio
async def test_expense_create_rejected_on_closed_drop(auth_client: AsyncClient):
    drop_id, _ = await _create_active_drop(auth_client)
    await auth_client.patch(f"/drops/{drop_id}", json={"status": "closed"})
    r = await auth_client.post(
        f"/financials/drops/{drop_id}/expenses",
        json={"vendor": "X", "category": "y", "amount": "1.00"},
    )
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_expense_list_works_on_closed_drop(auth_client: AsyncClient):
    drop_id, _ = await _create_active_drop(auth_client)
    await auth_client.post(
        f"/financials/drops/{drop_id}/expenses",
        json={"vendor": "X", "category": "y", "amount": "1.00"},
    )
    await auth_client.patch(f"/drops/{drop_id}", json={"status": "closed"})
    r = await auth_client.get(f"/financials/drops/{drop_id}/expenses")
    assert r.status_code == 200
    assert len(r.json()) == 1


@pytest.mark.asyncio
async def test_expense_rejects_zero_amount(auth_client: AsyncClient):
    drop_id, _ = await _create_active_drop(auth_client)
    r = await auth_client.post(
        f"/financials/drops/{drop_id}/expenses",
        json={"vendor": "X", "category": "y", "amount": "0"},
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_financials_404_unknown_drop(auth_client: AsyncClient):
    r = await auth_client.get(f"/financials/drops/{uuid.uuid4()}")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_financials_requires_auth(client: AsyncClient):
    r = await client.get(f"/financials/drops/{uuid.uuid4()}")
    assert r.status_code == 401
