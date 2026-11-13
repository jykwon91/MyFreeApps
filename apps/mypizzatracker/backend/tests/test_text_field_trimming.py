"""Free-text request fields are trimmed before validation.

Covers:
- Padded input is stored trimmed (drop, expense, pizza, topping, customer notes,
  public order customer name / phone / payment tag / modifications)
- Whitespace-only input is rejected with 422 on create and on update
- Update schemas: an omitted field is untouched; a provided blank value is 422
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer.customer import Customer
from app.models.user.user import User

BLANK = "   \t "


@pytest_asyncio.fixture
async def auth_client(client: AsyncClient, db: AsyncSession) -> AsyncClient:
    from fastapi_users.password import PasswordHelper

    email = "trim-test@example.com"
    password = "testpassword123!"

    result = await db.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none() is None:
        db.add(User(
            email=email,
            hashed_password=PasswordHelper().hash(password),
            is_verified=True,
            is_active=True,
        ))
        await db.flush()

    resp = await client.post(
        "/auth/jwt/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert resp.status_code == 200, resp.text
    client.headers["Authorization"] = f"Bearer {resp.json()['access_token']}"
    return client


def _drop(**overrides) -> dict:
    base = {
        "date": "2026-12-25",
        "name": "Dec 25th",
        "slot_window_start": "11:00:00",
        "slot_window_end": "15:30:00",
    }
    base.update(overrides)
    return base


async def _active_drop(auth_client: AsyncClient) -> tuple[str, str]:
    drop = await auth_client.post("/drops", json=_drop())
    assert drop.status_code == 201, drop.text
    drop_id = drop.json()["id"]
    slot = await auth_client.post(
        f"/drops/{drop_id}/slots", json={"pickup_time": "12:00:00", "max_pizzas": 6},
    )
    assert slot.status_code == 201, slot.text
    activate = await auth_client.patch(f"/drops/{drop_id}", json={"status": "active"})
    assert activate.status_code == 200, activate.text
    return drop_id, slot.json()["id"]


# ---------------------------------------------------------------------------
# Drops
# ---------------------------------------------------------------------------

async def test_drop_create_trims_name(auth_client: AsyncClient):
    resp = await auth_client.post("/drops", json=_drop(name="  Friday  "))
    assert resp.status_code == 201, resp.text
    assert resp.json()["name"] == "Friday"


async def test_drop_create_blank_name_422(auth_client: AsyncClient):
    resp = await auth_client.post("/drops", json=_drop(name=BLANK))
    assert resp.status_code == 422


async def test_drop_update_trims_name(auth_client: AsyncClient):
    drop_id = (await auth_client.post("/drops", json=_drop())).json()["id"]
    resp = await auth_client.patch(f"/drops/{drop_id}", json={"name": "  Saturday "})
    assert resp.status_code == 200, resp.text
    assert resp.json()["name"] == "Saturday"


async def test_drop_update_blank_name_422_and_omitted_name_untouched(
    auth_client: AsyncClient,
):
    drop_id = (await auth_client.post("/drops", json=_drop())).json()["id"]
    blank = await auth_client.patch(f"/drops/{drop_id}", json={"name": BLANK})
    assert blank.status_code == 422

    other = await auth_client.patch(f"/drops/{drop_id}", json={"tip_total": "5.00"})
    assert other.status_code == 200, other.text
    assert other.json()["name"] == "Dec 25th"


# ---------------------------------------------------------------------------
# Expenses
# ---------------------------------------------------------------------------

async def test_expense_create_trims_text_fields(auth_client: AsyncClient):
    drop_id = (await auth_client.post("/drops", json=_drop())).json()["id"]
    resp = await auth_client.post(
        f"/financials/drops/{drop_id}/expenses",
        json={
            "vendor": "  Costco ",
            "category": " ingredients  ",
            "amount": "12.50",
            "description": "  cheese run ",
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["vendor"] == "Costco"
    assert body["category"] == "ingredients"
    assert body["description"] == "cheese run"


@pytest.mark.parametrize("field", ["vendor", "category"])
async def test_expense_create_blank_required_field_422(
    auth_client: AsyncClient, field: str,
):
    drop_id = (await auth_client.post("/drops", json=_drop())).json()["id"]
    payload = {"vendor": "Costco", "category": "ingredients", "amount": "12.50"}
    payload[field] = BLANK
    resp = await auth_client.post(
        f"/financials/drops/{drop_id}/expenses", json=payload,
    )
    assert resp.status_code == 422


async def test_expense_update_trims_and_rejects_blank(auth_client: AsyncClient):
    drop_id = (await auth_client.post("/drops", json=_drop())).json()["id"]
    created = await auth_client.post(
        f"/financials/drops/{drop_id}/expenses",
        json={"vendor": "Costco", "category": "ingredients", "amount": "12.50"},
    )
    expense_id = created.json()["id"]
    url = f"/financials/expenses/{expense_id}"

    ok = await auth_client.patch(url, json={"vendor": "  Sams  "})
    assert ok.status_code == 200, ok.text
    assert ok.json()["vendor"] == "Sams"
    assert ok.json()["category"] == "ingredients"

    blank = await auth_client.patch(url, json={"vendor": BLANK})
    assert blank.status_code == 422


# ---------------------------------------------------------------------------
# Menu
# ---------------------------------------------------------------------------

async def test_pizza_and_topping_names_trimmed_and_blank_rejected(
    auth_client: AsyncClient,
):
    pizza = await auth_client.post(
        "/menu/pizzas",
        json={"name": "  La Clasica ", "price": "17.00", "description": " House "},
    )
    assert pizza.status_code == 201, pizza.text
    assert pizza.json()["name"] == "La Clasica"
    assert pizza.json()["description"] == "House"

    topping = await auth_client.post("/menu/toppings", json={"name": " Mushrooms "})
    assert topping.status_code == 201, topping.text
    assert topping.json()["name"] == "Mushrooms"

    assert (await auth_client.post(
        "/menu/pizzas", json={"name": BLANK, "price": "1.00"},
    )).status_code == 422
    assert (await auth_client.post(
        "/menu/toppings", json={"name": BLANK},
    )).status_code == 422

    assert (await auth_client.patch(
        f"/menu/pizzas/{pizza.json()['id']}", json={"name": BLANK},
    )).status_code == 422
    assert (await auth_client.patch(
        f"/menu/toppings/{topping.json()['id']}", json={"name": BLANK},
    )).status_code == 422

    renamed = await auth_client.patch(
        f"/menu/pizzas/{pizza.json()['id']}", json={"name": "  Margherita "},
    )
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["name"] == "Margherita"


# ---------------------------------------------------------------------------
# Public order + customer notes
# ---------------------------------------------------------------------------

async def _order_payload(auth_client: AsyncClient, **overrides) -> dict:
    drop_id, slot_id = await _active_drop(auth_client)
    pizza = await auth_client.post("/menu/pizzas", json={"name": "Clasica", "price": "17.00"})
    assert pizza.status_code == 201, pizza.text
    base = {
        "drop_id": drop_id,
        "slot_id": slot_id,
        "customer_name": "Jonathan Castillo",
        "customer_phone": "(512) 555-1234",
        "payment_method_tag": "venmo",
        "pizzas": [{"pizza_type_id": pizza.json()["id"]}],
    }
    base.update(overrides)
    return base


async def test_public_order_trims_text_fields(
    client: AsyncClient, auth_client: AsyncClient, db: AsyncSession,
):
    payload = await _order_payload(
        auth_client,
        customer_name="  Jonathan Castillo  ",
        customer_phone="  (512) 555-1234 ",
        payment_method_tag=" venmo ",
    )
    payload["pizzas"][0]["modifications_text"] = "  extra crispy "

    client.headers.pop("Authorization", None)
    resp = await client.post("/public/orders", json=payload)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["customer_name"] == "Jonathan Castillo"
    assert body["payment_method_tag"] == "venmo"
    assert body["pizzas"][0]["modifications_text"] == "extra crispy"

    customer = (await db.execute(
        select(Customer).where(Customer.phone == "5125551234"),
    )).scalar_one()
    assert customer.name == "Jonathan Castillo"


@pytest.mark.parametrize("field", ["customer_name", "customer_phone", "payment_method_tag"])
async def test_public_order_blank_field_422(
    client: AsyncClient, auth_client: AsyncClient, field: str,
):
    payload = await _order_payload(auth_client, **{field: BLANK})
    client.headers.pop("Authorization", None)
    resp = await client.post("/public/orders", json=payload)
    assert resp.status_code == 422


async def test_customer_notes_trimmed(auth_client: AsyncClient, db: AsyncSession):
    customer = Customer(name="Jonathan", phone="5125551234")
    db.add(customer)
    await db.flush()

    resp = await auth_client.patch(
        f"/customers/{customer.id}/notes", json={"notes": "  likes it well done "},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["notes"] == "likes it well done"
