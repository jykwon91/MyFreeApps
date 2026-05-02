"""Tests for ``application_events`` routes (Phase 3).

Covers:
- POST /applications/{id}/events: happy path 201 + payload, schema
  validation (422), unauthenticated (401), cross-tenant (404).
- GET /applications/{id}/events: returns newest-first events scoped to
  the caller, no events leaked across tenants, 404 for cross-tenant.

Mirrors the conftest fixture pattern from test_application_writes.py.
"""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company.company import Company


async def _create_company(db: AsyncSession, user_id: uuid.UUID, name: str) -> Company:
    company = Company(user_id=user_id, name=name, primary_domain=f"{name.lower().replace(' ', '-')}.example.com")
    db.add(company)
    await db.commit()
    await db.refresh(company)
    return company


def _now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


def _app_payload(company_id: uuid.UUID) -> dict:
    return {
        "company_id": str(company_id),
        "role_title": "Senior Backend Engineer",
        "source": "linkedin",
        "remote_type": "remote",
    }


def _event_payload(event_type: str = "applied", **overrides) -> dict:
    payload: dict = {
        "event_type": event_type,
        "occurred_at": _now_iso(),
        "source": "manual",
    }
    payload.update(overrides)
    return payload


# ---------------------------------------------------------------------------
# POST /applications/{id}/events
# ---------------------------------------------------------------------------


class TestCreateEvent:
    @pytest.mark.asyncio
    async def test_happy_path_returns_201(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_app = await authed.post("/applications", json=_app_payload(company.id))
            assert create_app.status_code == 201
            app_id = create_app.json()["id"]

            resp = await authed.post(
                f"/applications/{app_id}/events",
                json=_event_payload("applied", note="Submitted via website"),
            )

        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["application_id"] == app_id
        assert body["event_type"] == "applied"
        assert body["source"] == "manual"
        assert body["note"] == "Submitted via website"
        assert body["email_message_id"] is None

    @pytest.mark.asyncio
    async def test_invalid_event_type_returns_422(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_app = await authed.post("/applications", json=_app_payload(company.id))
            app_id = create_app.json()["id"]
            resp = await authed.post(
                f"/applications/{app_id}/events",
                json=_event_payload("not_a_real_type"),
            )

        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_extra_field_returns_422(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_app = await authed.post("/applications", json=_app_payload(company.id))
            app_id = create_app.json()["id"]

            # Try to inject email_message_id (only sync workers should set this).
            payload = _event_payload("applied")
            payload["email_message_id"] = "<gmail-id-123>"

            resp = await authed.post(f"/applications/{app_id}/events", json=payload)

        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_cross_tenant_returns_404(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        owner = await user_factory()
        attacker = await user_factory()
        company = await _create_company(db, uuid.UUID(owner["id"]), "Acme")

        async with await as_user(owner) as authed_owner:
            create_app = await authed_owner.post("/applications", json=_app_payload(company.id))
            app_id = create_app.json()["id"]

        async with await as_user(attacker) as authed_attacker:
            resp = await authed_attacker.post(
                f"/applications/{app_id}/events",
                json=_event_payload("applied"),
            )

        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_unauthenticated_returns_401(self, client: AsyncClient) -> None:
        resp = await client.post(
            f"/applications/{uuid.uuid4()}/events",
            json=_event_payload("applied"),
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /applications/{id}/events
# ---------------------------------------------------------------------------


class TestListEvents:
    @pytest.mark.asyncio
    async def test_returns_newest_first(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_app = await authed.post("/applications", json=_app_payload(company.id))
            app_id = create_app.json()["id"]

            old = await authed.post(
                f"/applications/{app_id}/events",
                json=_event_payload(
                    "applied",
                    occurred_at=_dt.datetime(2026, 1, 1, tzinfo=_dt.timezone.utc).isoformat(),
                ),
            )
            assert old.status_code == 201

            new = await authed.post(
                f"/applications/{app_id}/events",
                json=_event_payload(
                    "interview_scheduled",
                    occurred_at=_dt.datetime(2026, 2, 1, tzinfo=_dt.timezone.utc).isoformat(),
                ),
            )
            assert new.status_code == 201

            list_resp = await authed.get(f"/applications/{app_id}/events")

        assert list_resp.status_code == 200
        body = list_resp.json()
        assert body["total"] == 2
        # Newest first.
        assert body["items"][0]["event_type"] == "interview_scheduled"
        assert body["items"][1]["event_type"] == "applied"

    @pytest.mark.asyncio
    async def test_cross_tenant_returns_404(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        owner = await user_factory()
        attacker = await user_factory()
        company = await _create_company(db, uuid.UUID(owner["id"]), "Acme")

        async with await as_user(owner) as authed_owner:
            create_app = await authed_owner.post("/applications", json=_app_payload(company.id))
            app_id = create_app.json()["id"]
            await authed_owner.post(f"/applications/{app_id}/events", json=_event_payload("applied"))

        async with await as_user(attacker) as authed_attacker:
            resp = await authed_attacker.get(f"/applications/{app_id}/events")

        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_unauthenticated_returns_401(self, client: AsyncClient) -> None:
        resp = await client.get(f"/applications/{uuid.uuid4()}/events")
        assert resp.status_code == 401
