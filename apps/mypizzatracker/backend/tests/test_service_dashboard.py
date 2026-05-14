"""Tests for the operator service dashboard.

Covers:
- GET /service/drops/{drop_id} -- enriched payload, capacity math,
  ``in_progress_count``, name denormalization, server time.
- POST /service/orders/{order_id}/advance -- every valid transition pair
  in the state machine, terminal-state rejection, idempotent same-status,
  ``ready_text_sent_at`` side effect, closed-drop rejection, 404.
- POST /service/orders/{order_id}/move -- happy path, capacity check,
  cross-drop rejection, same-slot no-op, no-show free move, closed-drop
  rejection.
- Auth: /service/* must require a JWT.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order.order import Order
from app.models.user.user import User


# ---------------------------------------------------------------------------
# Setup helpers
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def auth_client(client: AsyncClient, db: AsyncSession) -> AsyncClient:
    from fastapi_users.password import PasswordHelper

    email = "service-dashboard-test@example.com"
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


async def _create_topping(
    auth_client: AsyncClient, name: str, price_delta: str = "0",
) -> str:
    resp = await auth_client.post(
        "/menu/toppings",
        json={"name": name, "price_delta": price_delta, "active": True},
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

    activate = await auth_client.patch(f"/drops/{drop_id}", json={"status": "active"})
    assert activate.status_code == 200, activate.text
    return drop_id, slot_id


async def _add_slot(
    auth_client: AsyncClient,
    drop_id: str,
    *,
    pickup_time: str,
    max_pizzas: int = 6,
) -> str:
    resp = await auth_client.post(
        f"/drops/{drop_id}/slots",
        json={"pickup_time": pickup_time, "max_pizzas": max_pizzas},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _place_order(
    client: AsyncClient,
    *,
    drop_id: str,
    slot_id: str,
    pizza_ids: list[str],
    customer_name: str = "Jonathan",
    customer_phone: str = "5125550001",
    topping_ids: list[str] | None = None,
    payment_method_tag: str = "venmo",
) -> str:
    """Place an order against ``/public/orders``.

    ``/public/*`` ignores Authorization, so we can reuse the auth_client's
    underlying ``AsyncClient`` without disturbing its bearer token (popping
    the header here would leak into later auth-needed calls in the same test).
    """
    pizzas_payload = [
        {
            "pizza_type_id": pid,
            "topping_type_ids": topping_ids or [],
        }
        for pid in pizza_ids
    ]
    resp = await client.post(
        "/public/orders",
        json={
            "drop_id": drop_id,
            "slot_id": slot_id,
            "customer_name": customer_name,
            "customer_phone": customer_phone,
            "payment_method_tag": payment_method_tag,
            "pizzas": pizzas_payload,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["order_id"]


# ---------------------------------------------------------------------------
# Dashboard read
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_dashboard_returns_enriched_payload(
    client: AsyncClient, auth_client: AsyncClient,
):
    drop_id, slot_a = await _create_active_drop(auth_client, max_pizzas=6)
    slot_b = await _add_slot(auth_client, drop_id, pickup_time="13:00:00", max_pizzas=4)
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")
    topping_id = await _create_topping(auth_client, "Mushrooms", "0")

    # Place two orders in slot_a, one in slot_b.
    await _place_order(
        client,
        drop_id=drop_id,
        slot_id=slot_a,
        pizza_ids=[pizza_id, pizza_id],
        topping_ids=[topping_id],
        customer_name="Maria J",
        customer_phone="5125550001",
    )
    await _place_order(
        client,
        drop_id=drop_id,
        slot_id=slot_a,
        pizza_ids=[pizza_id],
        customer_name="Bryan",
        customer_phone="5125550002",
    )
    await _place_order(
        client,
        drop_id=drop_id,
        slot_id=slot_b,
        pizza_ids=[pizza_id],
        customer_name="Janette",
        customer_phone="5125550003",
    )

    resp = await auth_client.get(f"/service/drops/{drop_id}")
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["drop"]["id"] == drop_id
    assert body["drop"]["status"] == "active"
    assert body["drop"]["in_progress_count"] == 3  # all not_started

    slots = body["slots"]
    assert len(slots) == 2

    by_id = {s["id"]: s for s in slots}
    assert by_id[slot_a]["pizza_count"] == 3
    assert by_id[slot_a]["remaining_capacity"] == 3
    assert by_id[slot_a]["max_pizzas"] == 6
    assert len(by_id[slot_a]["orders"]) == 2

    # Orders sorted by created_at asc, so Maria first.
    maria = by_id[slot_a]["orders"][0]
    assert maria["customer"]["name"] == "Maria J"
    assert maria["customer"]["phone"] == "5125550001"
    assert maria["pizza_count"] == 2
    assert maria["pizzas"][0]["name"] == "La Clasica"  # denormalized
    assert maria["pizzas"][0]["toppings"][0]["name"] == "Mushrooms"
    assert Decimal(maria["total"]) == Decimal("34.00")

    assert by_id[slot_b]["pizza_count"] == 1
    assert by_id[slot_b]["remaining_capacity"] == 3

    # server_time present and parseable
    assert datetime.fromisoformat(body["server_time"].replace("Z", "+00:00"))


@pytest.mark.asyncio
async def test_dashboard_remaining_capacity_excludes_no_show(
    client: AsyncClient, auth_client: AsyncClient,
):
    drop_id, slot_id = await _create_active_drop(auth_client, max_pizzas=2)
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")

    order_id = await _place_order(
        client,
        drop_id=drop_id,
        slot_id=slot_id,
        pizza_ids=[pizza_id, pizza_id],
    )

    # Mark it no_show; capacity should free up.
    advance = await auth_client.post(
        f"/service/orders/{order_id}/advance",
        json={"target_status": "no_show"},
    )
    assert advance.status_code == 200, advance.text

    resp = await auth_client.get(f"/service/drops/{drop_id}")
    body = resp.json()
    [slot] = body["slots"]
    assert slot["pizza_count"] == 0
    assert slot["remaining_capacity"] == 2
    assert body["drop"]["in_progress_count"] == 0


@pytest.mark.asyncio
async def test_dashboard_404_when_unknown_drop(auth_client: AsyncClient):
    bogus = uuid.uuid4()
    resp = await auth_client.get(f"/service/drops/{bogus}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_dashboard_requires_auth(client: AsyncClient):
    bogus = uuid.uuid4()
    resp = await client.get(f"/service/drops/{bogus}")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Advance status
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_advance_status_happy_forward_path(
    client: AsyncClient, auth_client: AsyncClient,
):
    drop_id, slot_id = await _create_active_drop(auth_client)
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")
    order_id = await _place_order(
        client, drop_id=drop_id, slot_id=slot_id, pizza_ids=[pizza_id],
    )

    # not_started -> cooking
    r = await auth_client.post(
        f"/service/orders/{order_id}/advance",
        json={"target_status": "cooking"},
    )
    assert r.status_code == 200 and r.json()["order"]["status"] == "cooking"
    # Non-SMS transitions report sms_dispatched: null
    assert r.json()["sms_dispatched"] is None

    # cooking -> ready_waiting (the no-text branch of the cooking fork)
    r = await auth_client.post(
        f"/service/orders/{order_id}/advance",
        json={"target_status": "ready_waiting"},
    )
    assert r.status_code == 200 and r.json()["order"]["status"] == "ready_waiting"
    assert r.json()["sms_dispatched"] is None

    # ready_waiting -> picked_up
    r = await auth_client.post(
        f"/service/orders/{order_id}/advance",
        json={"target_status": "picked_up"},
    )
    assert r.status_code == 200 and r.json()["order"]["status"] == "picked_up"


@pytest.mark.asyncio
async def test_advance_to_ready_text_sent_sets_timestamp(
    client: AsyncClient, auth_client: AsyncClient, db: AsyncSession,
):
    drop_id, slot_id = await _create_active_drop(auth_client)
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")
    order_id = await _place_order(
        client, drop_id=drop_id, slot_id=slot_id, pizza_ids=[pizza_id],
    )

    await auth_client.post(
        f"/service/orders/{order_id}/advance", json={"target_status": "cooking"},
    )
    r = await auth_client.post(
        f"/service/orders/{order_id}/advance",
        json={"target_status": "ready_text_sent"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["order"]["status"] == "ready_text_sent"
    assert body["order"]["ready_text_sent_at"] is not None
    # Round-trip parseable
    datetime.fromisoformat(body["order"]["ready_text_sent_at"].replace("Z", "+00:00"))
    # Tests run with sms_backend="console" (default) so the SMS is just
    # logged; dispatch succeeds.
    assert body["sms_dispatched"] is True
    assert body["sms_error"] is None


@pytest.mark.asyncio
async def test_advance_to_ready_text_sent_surfaces_twilio_failure(
    client: AsyncClient, auth_client: AsyncClient, monkeypatch,
):
    """When Twilio rejects the send, the order transition still commits
    but the response surfaces sms_dispatched=False + sms_error so the
    operator knows to text manually."""
    from app.services.sms import sms_sender
    from platform_shared.services.sms_service import SmsSendError

    drop_id, slot_id = await _create_active_drop(auth_client)
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")
    order_id = await _place_order(
        client, drop_id=drop_id, slot_id=slot_id, pizza_ids=[pizza_id],
    )
    await auth_client.post(
        f"/service/orders/{order_id}/advance", json={"target_status": "cooking"},
    )

    def _raise(*args, **kwargs):
        raise SmsSendError("Twilio rejected (code=21610): recipient opted out")

    monkeypatch.setattr(sms_sender, "send_sms_or_raise", _raise)

    r = await auth_client.post(
        f"/service/orders/{order_id}/advance",
        json={"target_status": "ready_text_sent"},
    )
    assert r.status_code == 200
    body = r.json()
    # Transition still committed
    assert body["order"]["status"] == "ready_text_sent"
    assert body["order"]["ready_text_sent_at"] is not None
    # SMS failure surfaced to operator
    assert body["sms_dispatched"] is False
    assert "21610" in body["sms_error"]


@pytest.mark.asyncio
async def test_advance_to_ready_text_sent_handles_unconfigured_twilio(
    client: AsyncClient, auth_client: AsyncClient, monkeypatch,
):
    """When Twilio creds are missing entirely the transition still
    commits and the operator sees an operator-facing reason."""
    from app.services.sms import sms_sender
    from platform_shared.services.sms_service import SmsNotConfiguredError

    drop_id, slot_id = await _create_active_drop(auth_client)
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")
    order_id = await _place_order(
        client, drop_id=drop_id, slot_id=slot_id, pizza_ids=[pizza_id],
    )
    await auth_client.post(
        f"/service/orders/{order_id}/advance", json={"target_status": "cooking"},
    )

    def _raise(*args, **kwargs):
        raise SmsNotConfiguredError("Twilio creds missing")

    monkeypatch.setattr(sms_sender, "send_sms_or_raise", _raise)

    r = await auth_client.post(
        f"/service/orders/{order_id}/advance",
        json={"target_status": "ready_text_sent"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["order"]["status"] == "ready_text_sent"
    assert body["sms_dispatched"] is False
    assert "not configured" in body["sms_error"].lower()


@pytest.mark.asyncio
async def test_advance_no_show_from_any_non_terminal_state(
    client: AsyncClient, auth_client: AsyncClient,
):
    drop_id, slot_id = await _create_active_drop(auth_client)
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")

    for current_state in ("not_started", "cooking", "ready_text_sent", "ready_waiting"):
        # Place + walk a fresh order to ``current_state``.
        order_id = await _place_order(
            client,
            drop_id=drop_id,
            slot_id=slot_id,
            pizza_ids=[pizza_id],
            customer_phone=f"55555500{current_state[:2]}",
            customer_name=current_state,
        )
        # Walk through to current_state.
        path = {
            "not_started": [],
            "cooking": ["cooking"],
            "ready_text_sent": ["cooking", "ready_text_sent"],
            "ready_waiting": ["cooking", "ready_waiting"],
        }[current_state]
        for step in path:
            r = await auth_client.post(
                f"/service/orders/{order_id}/advance",
                json={"target_status": step},
            )
            assert r.status_code == 200, r.text

        # no_show from this state
        r = await auth_client.post(
            f"/service/orders/{order_id}/advance",
            json={"target_status": "no_show"},
        )
        assert r.status_code == 200, f"{current_state} -> no_show failed: {r.text}"
        assert r.json()["order"]["status"] == "no_show"


@pytest.mark.asyncio
async def test_advance_terminal_state_rejected(
    client: AsyncClient, auth_client: AsyncClient,
):
    drop_id, slot_id = await _create_active_drop(auth_client)
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")
    order_id = await _place_order(
        client, drop_id=drop_id, slot_id=slot_id, pizza_ids=[pizza_id],
    )

    # Walk to picked_up
    for target in ("cooking", "ready_waiting", "picked_up"):
        await auth_client.post(
            f"/service/orders/{order_id}/advance",
            json={"target_status": target},
        )

    # Cannot leave picked_up.
    r = await auth_client.post(
        f"/service/orders/{order_id}/advance",
        json={"target_status": "no_show"},
    )
    assert r.status_code == 409
    assert "Cannot transition" in r.json()["detail"]


@pytest.mark.asyncio
async def test_advance_same_status_is_idempotent(
    client: AsyncClient, auth_client: AsyncClient,
):
    drop_id, slot_id = await _create_active_drop(auth_client)
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")
    order_id = await _place_order(
        client, drop_id=drop_id, slot_id=slot_id, pizza_ids=[pizza_id],
    )

    r = await auth_client.post(
        f"/service/orders/{order_id}/advance",
        json={"target_status": "not_started"},
    )
    assert r.status_code == 200
    assert r.json()["order"]["status"] == "not_started"


@pytest.mark.asyncio
async def test_advance_unknown_status_rejected(
    client: AsyncClient, auth_client: AsyncClient,
):
    drop_id, slot_id = await _create_active_drop(auth_client)
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")
    order_id = await _place_order(
        client, drop_id=drop_id, slot_id=slot_id, pizza_ids=[pizza_id],
    )

    r = await auth_client.post(
        f"/service/orders/{order_id}/advance",
        json={"target_status": "made_up"},
    )
    assert r.status_code == 409
    assert "Unknown status" in r.json()["detail"]


@pytest.mark.asyncio
async def test_advance_rejected_when_drop_closed(
    client: AsyncClient, auth_client: AsyncClient,
):
    drop_id, slot_id = await _create_active_drop(auth_client)
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")
    order_id = await _place_order(
        client, drop_id=drop_id, slot_id=slot_id, pizza_ids=[pizza_id],
    )

    close = await auth_client.patch(f"/drops/{drop_id}", json={"status": "closed"})
    assert close.status_code == 200

    r = await auth_client.post(
        f"/service/orders/{order_id}/advance",
        json={"target_status": "cooking"},
    )
    assert r.status_code == 409
    assert "closed" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_advance_404_when_unknown_order(auth_client: AsyncClient):
    bogus = uuid.uuid4()
    r = await auth_client.post(
        f"/service/orders/{bogus}/advance",
        json={"target_status": "cooking"},
    )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Move order to slot
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_move_to_slot_happy_path(
    client: AsyncClient, auth_client: AsyncClient, db: AsyncSession,
):
    drop_id, slot_a = await _create_active_drop(auth_client, max_pizzas=2)
    slot_b = await _add_slot(auth_client, drop_id, pickup_time="13:00:00", max_pizzas=4)
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")
    order_id = await _place_order(
        client, drop_id=drop_id, slot_id=slot_a, pizza_ids=[pizza_id],
    )

    r = await auth_client.post(
        f"/service/orders/{order_id}/move",
        json={"slot_id": slot_b},
    )
    assert r.status_code == 200
    assert r.json()["slot_id"] == slot_b

    # Source slot empties; destination fills.
    db.expire_all()
    order = (await db.execute(select(Order).where(Order.id == uuid.UUID(order_id)))).scalar_one()
    assert str(order.slot_id) == slot_b


@pytest.mark.asyncio
async def test_move_to_same_slot_is_noop(
    client: AsyncClient, auth_client: AsyncClient,
):
    drop_id, slot_id = await _create_active_drop(auth_client)
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")
    order_id = await _place_order(
        client, drop_id=drop_id, slot_id=slot_id, pizza_ids=[pizza_id],
    )

    r = await auth_client.post(
        f"/service/orders/{order_id}/move", json={"slot_id": slot_id},
    )
    assert r.status_code == 200
    assert r.json()["slot_id"] == slot_id


@pytest.mark.asyncio
async def test_move_capacity_exceeded_rejected(
    client: AsyncClient, auth_client: AsyncClient,
):
    drop_id, slot_a = await _create_active_drop(auth_client, max_pizzas=6)
    slot_b = await _add_slot(auth_client, drop_id, pickup_time="13:00:00", max_pizzas=1)
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")
    # Two-pizza order in slot_a; slot_b only has room for 1.
    order_id = await _place_order(
        client, drop_id=drop_id, slot_id=slot_a, pizza_ids=[pizza_id, pizza_id],
    )

    r = await auth_client.post(
        f"/service/orders/{order_id}/move", json={"slot_id": slot_b},
    )
    assert r.status_code == 409
    assert "left in target slot" in r.json()["detail"]


@pytest.mark.asyncio
async def test_move_cross_drop_rejected(
    client: AsyncClient, auth_client: AsyncClient,
):
    drop_a, slot_a = await _create_active_drop(auth_client, name="A", pickup_time="12:00:00")
    drop_b, slot_b = await _create_active_drop(auth_client, name="B", pickup_time="13:00:00")
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")
    order_id = await _place_order(
        client, drop_id=drop_a, slot_id=slot_a, pizza_ids=[pizza_id],
    )

    r = await auth_client.post(
        f"/service/orders/{order_id}/move", json={"slot_id": slot_b},
    )
    assert r.status_code == 400
    assert "does not belong" in r.json()["detail"]


@pytest.mark.asyncio
async def test_move_404_when_target_slot_unknown(
    client: AsyncClient, auth_client: AsyncClient,
):
    drop_id, slot_id = await _create_active_drop(auth_client)
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")
    order_id = await _place_order(
        client, drop_id=drop_id, slot_id=slot_id, pizza_ids=[pizza_id],
    )

    bogus = uuid.uuid4()
    r = await auth_client.post(
        f"/service/orders/{order_id}/move", json={"slot_id": str(bogus)},
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_move_no_show_skips_capacity_check(
    client: AsyncClient, auth_client: AsyncClient,
):
    drop_id, slot_a = await _create_active_drop(auth_client, max_pizzas=2)
    # Fill slot_b to its 1-pizza cap with a separate customer.
    slot_b = await _add_slot(auth_client, drop_id, pickup_time="13:00:00", max_pizzas=1)
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")
    await _place_order(
        client,
        drop_id=drop_id,
        slot_id=slot_b,
        pizza_ids=[pizza_id],
        customer_phone="5125550999",
    )
    # The no-show order to move (2 pizzas).
    no_show_id = await _place_order(
        client,
        drop_id=drop_id,
        slot_id=slot_a,
        pizza_ids=[pizza_id, pizza_id],
        customer_phone="5125550100",
    )
    await auth_client.post(
        f"/service/orders/{no_show_id}/advance",
        json={"target_status": "no_show"},
    )

    # Even though slot_b is "full" by capacity, a no_show free-rides.
    r = await auth_client.post(
        f"/service/orders/{no_show_id}/move", json={"slot_id": slot_b},
    )
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_move_rejected_when_drop_closed(
    client: AsyncClient, auth_client: AsyncClient,
):
    drop_id, slot_a = await _create_active_drop(auth_client)
    slot_b = await _add_slot(auth_client, drop_id, pickup_time="13:00:00")
    pizza_id = await _create_pizza(auth_client, "La Clasica", "17.00")
    order_id = await _place_order(
        client, drop_id=drop_id, slot_id=slot_a, pizza_ids=[pizza_id],
    )

    close = await auth_client.patch(f"/drops/{drop_id}", json={"status": "closed"})
    assert close.status_code == 200

    r = await auth_client.post(
        f"/service/orders/{order_id}/move", json={"slot_id": slot_b},
    )
    assert r.status_code == 409
    assert "closed" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_move_requires_auth(client: AsyncClient):
    bogus = uuid.uuid4()
    bogus_slot = uuid.uuid4()
    r = await client.post(
        f"/service/orders/{bogus}/move", json={"slot_id": str(bogus_slot)},
    )
    assert r.status_code == 401
