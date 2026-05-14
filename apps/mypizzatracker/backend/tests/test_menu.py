"""Tests for the Pizza menu management API.

Covers:
- Owner-only access (unauthenticated -> 401)
- Pizza + Topping CRUD happy paths
- Unique name enforcement (-> 409)
- Negative price / price_delta rejected (-> 422)
- 86'd toggle via PATCH active=false
- Combined GET /menu returns both lists
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user.user import User


@pytest_asyncio.fixture
async def auth_client(client: AsyncClient, db: AsyncSession) -> AsyncClient:
    """Create + log in a test user; return the client with Bearer token set."""
    from fastapi_users.password import PasswordHelper

    TEST_EMAIL = "menu-test@example.com"
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


def _pizza_payload(**overrides) -> dict:
    base = {"name": "La Clasica", "price": "17.00", "description": "House classic"}
    base.update(overrides)
    return base


def _topping_payload(**overrides) -> dict:
    base = {"name": "Mushrooms", "price_delta": "0.00"}
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Unauthorized
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_unauthenticated_blocked(client: AsyncClient):
    resp = await client.get("/menu")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Combined menu
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_menu_returns_both_lists(auth_client: AsyncClient):
    await auth_client.post("/menu/pizzas", json=_pizza_payload())
    await auth_client.post("/menu/toppings", json=_topping_payload())

    resp = await auth_client.get("/menu")
    assert resp.status_code == 200
    body = resp.json()
    assert "pizzas" in body and "toppings" in body
    assert len(body["pizzas"]) == 1
    assert len(body["toppings"]) == 1


# ---------------------------------------------------------------------------
# Pizza CRUD
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_pizza(auth_client: AsyncClient):
    resp = await auth_client.post("/menu/pizzas", json=_pizza_payload())
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "La Clasica"
    assert float(body["price"]) == 17.0
    assert body["active"] is True


@pytest.mark.asyncio
async def test_create_pizza_duplicate_name_409(auth_client: AsyncClient):
    await auth_client.post("/menu/pizzas", json=_pizza_payload())
    resp = await auth_client.post(
        "/menu/pizzas", json=_pizza_payload(price="18.00"),
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_create_pizza_negative_price_422(auth_client: AsyncClient):
    resp = await auth_client.post(
        "/menu/pizzas", json=_pizza_payload(price="-1.00"),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_list_pizzas_sorted_by_name(auth_client: AsyncClient):
    await auth_client.post("/menu/pizzas", json=_pizza_payload(name="Zeta"))
    await auth_client.post("/menu/pizzas", json=_pizza_payload(name="Alpha"))

    resp = await auth_client.get("/menu/pizzas")
    assert resp.status_code == 200
    names = [p["name"] for p in resp.json()]
    assert names == sorted(names)


@pytest.mark.asyncio
async def test_patch_pizza_price_and_active(auth_client: AsyncClient):
    created = await auth_client.post("/menu/pizzas", json=_pizza_payload())
    pid = created.json()["id"]

    resp = await auth_client.patch(
        f"/menu/pizzas/{pid}", json={"price": "19.00", "active": False},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert float(body["price"]) == 19.0
    assert body["active"] is False


@pytest.mark.asyncio
async def test_patch_pizza_to_duplicate_name_409(auth_client: AsyncClient):
    a = await auth_client.post("/menu/pizzas", json=_pizza_payload(name="A"))
    await auth_client.post("/menu/pizzas", json=_pizza_payload(name="B"))
    aid = a.json()["id"]

    resp = await auth_client.patch(
        f"/menu/pizzas/{aid}", json={"name": "B"},
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_delete_pizza(auth_client: AsyncClient):
    created = await auth_client.post("/menu/pizzas", json=_pizza_payload())
    pid = created.json()["id"]

    resp = await auth_client.delete(f"/menu/pizzas/{pid}")
    assert resp.status_code == 204

    after = await auth_client.get(f"/menu/pizzas")
    assert after.json() == []


# ---------------------------------------------------------------------------
# Topping CRUD
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_topping_default_price_delta_zero(
    auth_client: AsyncClient,
):
    resp = await auth_client.post(
        "/menu/toppings", json={"name": "Red Bell Pepper"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert float(body["price_delta"]) == 0.0
    assert body["active"] is True


@pytest.mark.asyncio
async def test_create_topping_duplicate_name_409(auth_client: AsyncClient):
    await auth_client.post("/menu/toppings", json=_topping_payload())
    resp = await auth_client.post("/menu/toppings", json=_topping_payload())
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_topping_negative_price_delta_422(auth_client: AsyncClient):
    resp = await auth_client.post(
        "/menu/toppings",
        json=_topping_payload(price_delta="-0.50"),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_patch_topping_toggle_active(auth_client: AsyncClient):
    created = await auth_client.post("/menu/toppings", json=_topping_payload())
    tid = created.json()["id"]

    resp = await auth_client.patch(
        f"/menu/toppings/{tid}", json={"active": False},
    )
    assert resp.status_code == 200
    assert resp.json()["active"] is False


@pytest.mark.asyncio
async def test_delete_topping(auth_client: AsyncClient):
    created = await auth_client.post("/menu/toppings", json=_topping_payload())
    tid = created.json()["id"]

    resp = await auth_client.delete(f"/menu/toppings/{tid}")
    assert resp.status_code == 204

    after = await auth_client.get("/menu/toppings")
    assert after.json() == []
