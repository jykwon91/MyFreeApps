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
        """GET /applications/{id}/events returns events newest-first.

        POST /applications auto-creates a source=system 'applied' event.
        This test adds two more manual events at fixed past timestamps so the
        ordering is deterministic and the auto-event (at now) lands last in
        the returned list.
        """
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_app = await authed.post("/applications", json=_app_payload(company.id))
            app_id = create_app.json()["id"]

            # Two manual events at timestamps well in the past so the auto-event
            # (occurred_at = now) sorts as the most recent.
            old = await authed.post(
                f"/applications/{app_id}/events",
                json=_event_payload(
                    "interview_scheduled",
                    occurred_at=_dt.datetime(2024, 1, 1, tzinfo=_dt.timezone.utc).isoformat(),
                ),
            )
            assert old.status_code == 201

            older = await authed.post(
                f"/applications/{app_id}/events",
                json=_event_payload(
                    "applied",
                    occurred_at=_dt.datetime(2023, 1, 1, tzinfo=_dt.timezone.utc).isoformat(),
                ),
            )
            assert older.status_code == 201

            list_resp = await authed.get(f"/applications/{app_id}/events")

        assert list_resp.status_code == 200
        body = list_resp.json()
        # 3 events: auto-system-applied (now) + interview_scheduled (2024) + applied (2023).
        assert body["total"] == 3
        # Newest first — the auto-event (now) is the most recent.
        assert body["items"][0]["event_type"] == "applied"
        assert body["items"][0]["source"] == "system"
        assert body["items"][1]["event_type"] == "interview_scheduled"
        assert body["items"][2]["event_type"] == "applied"
        assert body["items"][2]["source"] == "manual"

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


# ---------------------------------------------------------------------------
# PATCH /applications/{id}/events/{event_id}
# ---------------------------------------------------------------------------


def _interview_event_payload(**details_overrides) -> dict:
    """Helper: build a POST body for an interview_scheduled event."""
    details = {"type": "video"}
    details.update(details_overrides)
    return _event_payload(
        "interview_scheduled",
        interview_details=details,
        note="initial note",
    )


class TestUpdateEvent:
    @pytest.mark.asyncio
    async def test_happy_path_updates_interview_details(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_app = await authed.post("/applications", json=_app_payload(company.id))
            app_id = create_app.json()["id"]
            create_evt = await authed.post(
                f"/applications/{app_id}/events",
                json=_interview_event_payload(),
            )
            event_id = create_evt.json()["id"]

            resp = await authed.patch(
                f"/applications/{app_id}/events/{event_id}",
                json={
                    "interview_details": {
                        "type": "onsite",
                        "duration_minutes": 60,
                        "location_or_link": "1 Acme Plaza",
                        "interviewer_names": ["Alex Chen", "Dana Rivera"],
                    },
                },
            )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["interview_details"]["type"] == "onsite"
        assert body["interview_details"]["duration_minutes"] == 60
        assert body["interview_details"]["location_or_link"] == "1 Acme Plaza"
        assert body["interview_details"]["interviewer_names"] == ["Alex Chen", "Dana Rivera"]
        # Note left untouched.
        assert body["note"] == "initial note"
        # updated_at must be set and not earlier than created_at.
        assert body["updated_at"] >= body["created_at"]

    @pytest.mark.asyncio
    async def test_happy_path_note_only(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_app = await authed.post("/applications", json=_app_payload(company.id))
            app_id = create_app.json()["id"]
            create_evt = await authed.post(
                f"/applications/{app_id}/events",
                json=_interview_event_payload(duration_minutes=30),
            )
            event_id = create_evt.json()["id"]

            resp = await authed.patch(
                f"/applications/{app_id}/events/{event_id}",
                json={"note": "great rapport with hiring manager"},
            )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["note"] == "great rapport with hiring manager"
        # interview_details untouched — the type + duration set at creation survive.
        assert body["interview_details"]["type"] == "video"
        assert body["interview_details"]["duration_minutes"] == 30

    @pytest.mark.asyncio
    async def test_clear_interview_details(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """Explicit null on interview_details clears the column."""
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_app = await authed.post("/applications", json=_app_payload(company.id))
            app_id = create_app.json()["id"]
            create_evt = await authed.post(
                f"/applications/{app_id}/events",
                json=_interview_event_payload(),
            )
            event_id = create_evt.json()["id"]

            resp = await authed.patch(
                f"/applications/{app_id}/events/{event_id}",
                json={"interview_details": None},
            )

        assert resp.status_code == 200, resp.text
        assert resp.json()["interview_details"] is None

    @pytest.mark.asyncio
    async def test_non_interview_event_returns_422(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """PATCH on an 'applied' (or any non-interview) event is rejected."""
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_app = await authed.post("/applications", json=_app_payload(company.id))
            app_id = create_app.json()["id"]
            create_evt = await authed.post(
                f"/applications/{app_id}/events",
                json=_event_payload("applied", note="initial"),
            )
            event_id = create_evt.json()["id"]

            resp = await authed.patch(
                f"/applications/{app_id}/events/{event_id}",
                json={"note": "retroactive note"},
            )

        assert resp.status_code == 422
        assert resp.json()["detail"] == "event_type does not support editing"

    @pytest.mark.asyncio
    async def test_extra_field_returns_422(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """Attempt to PATCH a non-allowlisted column (e.g., event_type)
        is rejected by the schema before the service runs."""
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_app = await authed.post("/applications", json=_app_payload(company.id))
            app_id = create_app.json()["id"]
            create_evt = await authed.post(
                f"/applications/{app_id}/events",
                json=_interview_event_payload(),
            )
            event_id = create_evt.json()["id"]

            resp = await authed.patch(
                f"/applications/{app_id}/events/{event_id}",
                json={"event_type": "offer_received"},
            )

        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_invalid_interview_type_returns_422(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_app = await authed.post("/applications", json=_app_payload(company.id))
            app_id = create_app.json()["id"]
            create_evt = await authed.post(
                f"/applications/{app_id}/events",
                json=_interview_event_payload(),
            )
            event_id = create_evt.json()["id"]

            resp = await authed.patch(
                f"/applications/{app_id}/events/{event_id}",
                json={"interview_details": {"type": "telegram"}},
            )

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
            create_evt = await authed_owner.post(
                f"/applications/{app_id}/events",
                json=_interview_event_payload(),
            )
            event_id = create_evt.json()["id"]

        async with await as_user(attacker) as authed_attacker:
            resp = await authed_attacker.patch(
                f"/applications/{app_id}/events/{event_id}",
                json={"note": "attacker note"},
            )

        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_wrong_application_returns_404(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """Caller owns the event but passes the WRONG application_id in
        the URL — composite WHERE guards IDOR, returns 404."""
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            payload_a = _app_payload(company.id)
            payload_b = _app_payload(company.id)
            payload_b["role_title"] = "Staff Backend Engineer"  # avoid uq_application_user_role

            app_a = await authed.post("/applications", json=payload_a)
            app_a_id = app_a.json()["id"]
            app_b = await authed.post("/applications", json=payload_b)
            app_b_id = app_b.json()["id"]

            evt_a = await authed.post(
                f"/applications/{app_a_id}/events",
                json=_interview_event_payload(),
            )
            event_id = evt_a.json()["id"]

            # Try to PATCH event under app_a using app_b's URL.
            resp = await authed.patch(
                f"/applications/{app_b_id}/events/{event_id}",
                json={"note": "wrong url"},
            )

        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_nonexistent_event_returns_404(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_app = await authed.post("/applications", json=_app_payload(company.id))
            app_id = create_app.json()["id"]
            resp = await authed.patch(
                f"/applications/{app_id}/events/{uuid.uuid4()}",
                json={"note": "no such event"},
            )

        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_unauthenticated_returns_401(self, client: AsyncClient) -> None:
        resp = await client.patch(
            f"/applications/{uuid.uuid4()}/events/{uuid.uuid4()}",
            json={"note": "unauthenticated"},
        )
        assert resp.status_code == 401
