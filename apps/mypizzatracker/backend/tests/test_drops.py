"""Tests for the Drop + Slot management API.

Covers:
- POST /drops creates a drop in 'planning'
- GET  /drops lists drops (optionally filtered by status)
- GET  /drops/{id} returns detail incl. slots
- PATCH /drops/{id} state-machine transitions + edit policy
- DELETE /drops/{id} delete policy (planning-only)
- Slot CRUD under /drops/{drop_id}/slots
- Slot edits blocked when drop is closed
- Cascade-delete: deleting a drop removes its slots
- Unauthorized requests are rejected
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user.user import User


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def auth_client(client: AsyncClient, db: AsyncSession) -> AsyncClient:
    """Create + log in a test user; return the client with Bearer token set."""
    from fastapi_users.password import PasswordHelper

    TEST_EMAIL = "drops-test@example.com"
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


def _drop_payload(**overrides) -> dict:
    base = {
        "date": "2026-12-25",
        "name": "Dec 25th",
        "slot_window_start": "11:00:00",
        "slot_window_end": "15:30:00",
    }
    base.update(overrides)
    return base


def _slot_payload(**overrides) -> dict:
    base = {"pickup_time": "12:00:00", "max_pizzas": 6}
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Unauthorized
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_unauthenticated_blocked(client: AsyncClient):
    resp = await client.get("/drops")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# CRUD happy paths
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_drop_in_planning(auth_client: AsyncClient):
    resp = await auth_client.post("/drops", json=_drop_payload())
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["status"] == "planning"
    assert body["name"] == "Dec 25th"
    assert body["date"] == "2026-12-25"
    assert body["slots"] == []
    assert float(body["tip_total"]) == 0.0


@pytest.mark.asyncio
async def test_create_drop_rejects_invalid_window(auth_client: AsyncClient):
    payload = _drop_payload(
        slot_window_start="15:00:00",
        slot_window_end="11:00:00",
    )
    resp = await auth_client.post("/drops", json=payload)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_list_and_filter_drops(auth_client: AsyncClient):
    await auth_client.post("/drops", json=_drop_payload(name="A"))
    b = await auth_client.post("/drops", json=_drop_payload(name="B"))
    drop_b_id = b.json()["id"]

    # Activate B (needs a slot first)
    await auth_client.post(
        f"/drops/{drop_b_id}/slots", json=_slot_payload(),
    )
    activate = await auth_client.patch(
        f"/drops/{drop_b_id}", json={"status": "active"},
    )
    assert activate.status_code == 200, activate.text

    all_resp = await auth_client.get("/drops")
    assert all_resp.status_code == 200
    assert len(all_resp.json()) == 2

    planning_resp = await auth_client.get("/drops?status=planning")
    assert {d["name"] for d in planning_resp.json()} == {"A"}

    active_resp = await auth_client.get("/drops?status=active")
    assert {d["name"] for d in active_resp.json()} == {"B"}


@pytest.mark.asyncio
async def test_get_drop_detail_includes_slots(auth_client: AsyncClient):
    created = await auth_client.post("/drops", json=_drop_payload())
    drop_id = created.json()["id"]
    await auth_client.post(
        f"/drops/{drop_id}/slots", json=_slot_payload(pickup_time="12:00:00"),
    )
    await auth_client.post(
        f"/drops/{drop_id}/slots", json=_slot_payload(pickup_time="12:30:00"),
    )

    resp = await auth_client.get(f"/drops/{drop_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["slots"]) == 2
    assert {s["pickup_time"] for s in body["slots"]} == {"12:00:00", "12:30:00"}


@pytest.mark.asyncio
async def test_patch_planning_drop_fields(auth_client: AsyncClient):
    created = await auth_client.post("/drops", json=_drop_payload())
    drop_id = created.json()["id"]

    resp = await auth_client.patch(
        f"/drops/{drop_id}",
        json={"name": "Dec 25th -- Holiday", "date": "2026-12-26"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["name"] == "Dec 25th -- Holiday"
    assert body["date"] == "2026-12-26"


# ---------------------------------------------------------------------------
# State machine
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_planning_to_active_requires_slot(auth_client: AsyncClient):
    created = await auth_client.post("/drops", json=_drop_payload())
    drop_id = created.json()["id"]

    resp = await auth_client.patch(
        f"/drops/{drop_id}", json={"status": "active"},
    )
    assert resp.status_code == 400
    assert "slot" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_planning_to_active_succeeds_with_slot(auth_client: AsyncClient):
    created = await auth_client.post("/drops", json=_drop_payload())
    drop_id = created.json()["id"]
    await auth_client.post(
        f"/drops/{drop_id}/slots", json=_slot_payload(),
    )

    resp = await auth_client.patch(
        f"/drops/{drop_id}", json={"status": "active"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"


@pytest.mark.asyncio
async def test_planning_to_closed_allowed(auth_client: AsyncClient):
    created = await auth_client.post("/drops", json=_drop_payload())
    drop_id = created.json()["id"]

    resp = await auth_client.patch(
        f"/drops/{drop_id}", json={"status": "closed"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "closed"


@pytest.mark.asyncio
async def test_active_to_closed_allowed(auth_client: AsyncClient):
    created = await auth_client.post("/drops", json=_drop_payload())
    drop_id = created.json()["id"]
    await auth_client.post(f"/drops/{drop_id}/slots", json=_slot_payload())
    await auth_client.patch(f"/drops/{drop_id}", json={"status": "active"})

    resp = await auth_client.patch(
        f"/drops/{drop_id}", json={"status": "closed"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "closed"


@pytest.mark.asyncio
async def test_active_to_planning_blocked(auth_client: AsyncClient):
    created = await auth_client.post("/drops", json=_drop_payload())
    drop_id = created.json()["id"]
    await auth_client.post(f"/drops/{drop_id}/slots", json=_slot_payload())
    await auth_client.patch(f"/drops/{drop_id}", json={"status": "active"})

    resp = await auth_client.patch(
        f"/drops/{drop_id}", json={"status": "planning"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_closed_is_terminal(auth_client: AsyncClient):
    created = await auth_client.post("/drops", json=_drop_payload())
    drop_id = created.json()["id"]
    await auth_client.patch(f"/drops/{drop_id}", json={"status": "closed"})

    resp = await auth_client.patch(
        f"/drops/{drop_id}", json={"status": "active"},
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Edit policy
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_active_drop_rejects_name_edit(auth_client: AsyncClient):
    created = await auth_client.post("/drops", json=_drop_payload())
    drop_id = created.json()["id"]
    await auth_client.post(f"/drops/{drop_id}/slots", json=_slot_payload())
    await auth_client.patch(f"/drops/{drop_id}", json={"status": "active"})

    resp = await auth_client.patch(
        f"/drops/{drop_id}", json={"name": "Renamed"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_active_drop_allows_tip_total_edit(auth_client: AsyncClient):
    created = await auth_client.post("/drops", json=_drop_payload())
    drop_id = created.json()["id"]
    await auth_client.post(f"/drops/{drop_id}/slots", json=_slot_payload())
    await auth_client.patch(f"/drops/{drop_id}", json={"status": "active"})

    resp = await auth_client.patch(
        f"/drops/{drop_id}", json={"tip_total": "42.50"},
    )
    assert resp.status_code == 200
    assert float(resp.json()["tip_total"]) == 42.5


# ---------------------------------------------------------------------------
# Delete policy
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_delete_planning_drop_succeeds(auth_client: AsyncClient):
    created = await auth_client.post("/drops", json=_drop_payload())
    drop_id = created.json()["id"]

    resp = await auth_client.delete(f"/drops/{drop_id}")
    assert resp.status_code == 204

    get_after = await auth_client.get(f"/drops/{drop_id}")
    assert get_after.status_code == 404


@pytest.mark.asyncio
async def test_delete_active_drop_blocked(auth_client: AsyncClient):
    created = await auth_client.post("/drops", json=_drop_payload())
    drop_id = created.json()["id"]
    await auth_client.post(f"/drops/{drop_id}/slots", json=_slot_payload())
    await auth_client.patch(f"/drops/{drop_id}", json={"status": "active"})

    resp = await auth_client.delete(f"/drops/{drop_id}")
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_delete_closed_drop_blocked(auth_client: AsyncClient):
    created = await auth_client.post("/drops", json=_drop_payload())
    drop_id = created.json()["id"]
    await auth_client.patch(f"/drops/{drop_id}", json={"status": "closed"})

    resp = await auth_client.delete(f"/drops/{drop_id}")
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Slot CRUD + cascade
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_add_slot_to_planning_drop(auth_client: AsyncClient):
    created = await auth_client.post("/drops", json=_drop_payload())
    drop_id = created.json()["id"]

    resp = await auth_client.post(
        f"/drops/{drop_id}/slots", json=_slot_payload(max_pizzas=8),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["pickup_time"] == "12:00:00"
    assert body["max_pizzas"] == 8


@pytest.mark.asyncio
async def test_slot_rejects_max_pizzas_zero(auth_client: AsyncClient):
    created = await auth_client.post("/drops", json=_drop_payload())
    drop_id = created.json()["id"]

    resp = await auth_client.post(
        f"/drops/{drop_id}/slots", json=_slot_payload(max_pizzas=0),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_slot_modify_blocked_when_drop_closed(auth_client: AsyncClient):
    created = await auth_client.post("/drops", json=_drop_payload())
    drop_id = created.json()["id"]
    slot_resp = await auth_client.post(
        f"/drops/{drop_id}/slots", json=_slot_payload(),
    )
    slot_id = slot_resp.json()["id"]
    await auth_client.patch(f"/drops/{drop_id}", json={"status": "closed"})

    patch = await auth_client.patch(
        f"/drops/{drop_id}/slots/{slot_id}", json={"max_pizzas": 10},
    )
    assert patch.status_code == 400

    delete = await auth_client.delete(f"/drops/{drop_id}/slots/{slot_id}")
    assert delete.status_code == 400


@pytest.mark.asyncio
async def test_delete_drop_cascades_slots(
    auth_client: AsyncClient, db: AsyncSession,
):
    from app.models.drop.slot import Slot

    created = await auth_client.post("/drops", json=_drop_payload())
    drop_id = created.json()["id"]
    await auth_client.post(f"/drops/{drop_id}/slots", json=_slot_payload())
    await auth_client.post(
        f"/drops/{drop_id}/slots",
        json=_slot_payload(pickup_time="12:30:00"),
    )

    resp = await auth_client.delete(f"/drops/{drop_id}")
    assert resp.status_code == 204

    remaining = (await db.execute(select(Slot))).scalars().all()
    assert len(list(remaining)) == 0
