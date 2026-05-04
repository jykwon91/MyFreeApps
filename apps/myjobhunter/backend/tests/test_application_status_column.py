"""Tests for the ``latest_status`` field on ``GET /applications``.

Covers:
- Route: GET /applications includes ``latest_status: null`` for new apps.
- Route: GET /applications shows the correct latest event type after logging events.
- Route: Multiple events — only the most-recent one is exposed as status.
- Tenant isolation: user B cannot see user A's event types in the list response.

All tests use the HTTP API (via ``as_user`` + httpx) to avoid direct DB
fixture complications on Windows (asyncpg + pytest-asyncio event loop sharing).
The repository's ``list_with_status`` is exercised indirectly through these
route tests — the lateral-join correctness is demonstrated by the multi-event
ordering test.

Pattern mirrors test_application_events.py.
"""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company.company import Company


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _create_company(db: AsyncSession, user_id: uuid.UUID, name: str) -> Company:
    """Create a Company within the test transaction (flush, not commit)."""
    company = Company(
        user_id=user_id,
        name=name,
        primary_domain=f"{name.lower().replace(' ', '-')}-{uuid.uuid4().hex[:6]}.example.com",
    )
    db.add(company)
    await db.flush()
    return company


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
        "occurred_at": _dt.datetime.now(_dt.timezone.utc).isoformat(),
        "source": "manual",
    }
    payload.update(overrides)
    return payload


def _ts_iso(year: int, month: int, day: int) -> str:
    return _dt.datetime(year, month, day, tzinfo=_dt.timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Route tests — list endpoint latest_status field
# ---------------------------------------------------------------------------


class TestListApplicationsLatestStatus:
    @pytest.mark.asyncio
    async def test_new_application_latest_status_is_applied(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """GET /applications must return latest_status='applied' for a newly-created
        application because POST /applications auto-logs an initial 'applied' event
        with source='system'."""
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme Corp")

        async with await as_user(user) as authed:
            create_resp = await authed.post("/applications", json=_app_payload(company.id))
            assert create_resp.status_code == 201

            list_resp = await authed.get("/applications")

        assert list_resp.status_code == 200
        body = list_resp.json()
        assert body["total"] == 1
        item = body["items"][0]
        assert "latest_status" in item
        assert item["latest_status"] == "applied"

    @pytest.mark.asyncio
    async def test_single_event_returns_that_event_type(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """GET /applications must return the event type after logging one event."""
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Beta Inc")

        async with await as_user(user) as authed:
            create_resp = await authed.post("/applications", json=_app_payload(company.id))
            assert create_resp.status_code == 201
            app_id = create_resp.json()["id"]

            await authed.post(
                f"/applications/{app_id}/events",
                json=_event_payload("applied"),
            )

            list_resp = await authed.get("/applications")

        assert list_resp.status_code == 200
        item = list_resp.json()["items"][0]
        assert item["latest_status"] == "applied"

    @pytest.mark.asyncio
    async def test_multiple_events_returns_latest_by_occurred_at(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """GET /applications must reflect the LATEST event by occurred_at.

        The application is created with applied_at=2025-12-01 so the auto-system
        event is anchored at that past date. Three manual events are then logged
        at 2026-01-01, 2026-02-01, and 2026-03-01. The response must show
        offer_received (2026-03-01) — the most-recent by occurred_at — validating
        the lateral-join ORDER BY occurred_at DESC LIMIT 1 in the repository.
        """
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Gamma LLC")

        async with await as_user(user) as authed:
            # applied_at pins the auto-event to a date before the manual events.
            create_resp = await authed.post(
                "/applications",
                json={**_app_payload(company.id), "applied_at": _ts_iso(2025, 12, 1)},
            )
            app_id = create_resp.json()["id"]

            # Log three events in ascending occurred_at order (all after the auto-event).
            await authed.post(
                f"/applications/{app_id}/events",
                json=_event_payload("applied", occurred_at=_ts_iso(2026, 1, 1)),
            )
            await authed.post(
                f"/applications/{app_id}/events",
                json=_event_payload("interview_scheduled", occurred_at=_ts_iso(2026, 2, 1)),
            )
            await authed.post(
                f"/applications/{app_id}/events",
                json=_event_payload("offer_received", occurred_at=_ts_iso(2026, 3, 1)),
            )

            list_resp = await authed.get("/applications")

        assert list_resp.status_code == 200
        item = list_resp.json()["items"][0]
        assert item["latest_status"] == "offer_received"

    @pytest.mark.asyncio
    async def test_tenant_isolation_user_b_sees_own_status_not_user_a_status(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """User B cannot see user A's event types in the list response.

        User A: has an application advanced to offer_received.
        User B: has a newly-created application (auto 'applied' event only).
        User B's list response must show 'applied', not 'offer_received'.
        """
        user_a = await user_factory()
        user_b = await user_factory()
        company_a = await _create_company(db, uuid.UUID(user_a["id"]), "Corp A Status")
        company_b = await _create_company(db, uuid.UUID(user_b["id"]), "Corp B Status")

        # User A creates an application and advances it to offer_received
        async with await as_user(user_a) as authed_a:
            create_a = await authed_a.post("/applications", json=_app_payload(company_a.id))
            app_a_id = create_a.json()["id"]
            await authed_a.post(
                f"/applications/{app_a_id}/events",
                json=_event_payload("offer_received"),
            )

        # User B creates an application (gets auto "applied" event)
        async with await as_user(user_b) as authed_b:
            await authed_b.post("/applications", json=_app_payload(company_b.id))
            list_b = await authed_b.get("/applications")

        body_b = list_b.json()
        assert body_b["total"] == 1
        # User B must see their own auto-"applied" status, not user A's "offer_received"
        assert body_b["items"][0]["latest_status"] == "applied"

    @pytest.mark.asyncio
    async def test_multiple_applications_each_shows_own_latest_status(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """Each application in the list shows its own latest_status independently."""
        user = await user_factory()
        company1 = await _create_company(db, uuid.UUID(user["id"]), "Company One")
        company2 = await _create_company(db, uuid.UUID(user["id"]), "Company Two")
        company3 = await _create_company(db, uuid.UUID(user["id"]), "Company Three")

        async with await as_user(user) as authed:
            # App 1: auto-applied at 2025-12-01, then applied (2026-01-01), then rejected (2026-02-01).
            # Latest = rejected (2026-02-01 is more recent than all others).
            r1 = await authed.post("/applications", json={**_app_payload(company1.id), "role_title": "Role One", "applied_at": _ts_iso(2025, 12, 1)})
            id1 = r1.json()["id"]
            await authed.post(f"/applications/{id1}/events", json=_event_payload("applied", occurred_at=_ts_iso(2026, 1, 1)))
            await authed.post(f"/applications/{id1}/events", json=_event_payload("rejected", occurred_at=_ts_iso(2026, 2, 1)))

            # App 2: auto-applied at 2025-12-01, then interview_scheduled at 2026-01-15.
            # Latest = interview_scheduled (2026-01-15 > 2025-12-01).
            r2 = await authed.post("/applications", json={**_app_payload(company2.id), "role_title": "Role Two", "applied_at": _ts_iso(2025, 12, 1)})
            id2 = r2.json()["id"]
            await authed.post(f"/applications/{id2}/events", json=_event_payload("interview_scheduled", occurred_at=_ts_iso(2026, 1, 15)))

            # App 3: only the auto-applied event (latest = "applied")
            r3 = await authed.post("/applications", json={**_app_payload(company3.id), "role_title": "Role Three"})

            list_resp = await authed.get("/applications")

        assert list_resp.status_code == 200
        items = list_resp.json()["items"]
        assert len(items) == 3

        # Build a lookup by id for assertion
        by_id = {item["id"]: item["latest_status"] for item in items}
        assert by_id[r1.json()["id"]] == "rejected"
        assert by_id[r2.json()["id"]] == "interview_scheduled"
        # App 3 was just created — it has the auto-applied event (source=system)
        assert by_id[r3.json()["id"]] == "applied"
