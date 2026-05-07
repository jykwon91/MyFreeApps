"""Tests for the kanban drag-drop transition service.

Covers:
- Drag from "applied" to "interviewing" -> creates ``interview_scheduled``
- Drag from "applied" to "offer" -> creates ``offer_received``
- Drag from "applied" to "closed" -> creates ``rejected`` (default)
- ``occurred_at`` is server-clock only (close to ``now()``)
- Idempotency: same key inside the 30s window returns the existing event
- Cross-tenant target -> service returns ``None`` (route maps to 404)
- Not-allowed transition (same column) -> raises TransitionNotAllowedError
- Per-user rate limit fires after 30 transition writes / minute
"""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company.company import Company
from app.services.application.application_transition_service import (
    TransitionNotAllowedError,
    transition_application,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _create_company(db: AsyncSession, user_id: uuid.UUID, name: str) -> Company:
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


async def _create_application(authed, company_id: uuid.UUID) -> str:
    resp = await authed.post("/applications", json=_app_payload(company_id))
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# ---------------------------------------------------------------------------
# Drag transitions — happy paths
# ---------------------------------------------------------------------------


class TestTransitionHappyPaths:
    @pytest.mark.asyncio
    async def test_drag_applied_to_interviewing_creates_interview_scheduled(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            app_id = await _create_application(authed, company.id)

            resp = await authed.post(
                f"/applications/{app_id}/transitions",
                json={"target_column": "interviewing"},
            )

        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["application_id"] == app_id
        assert body["event_type"] == "interview_scheduled"
        assert body["source"] == "manual"

    @pytest.mark.asyncio
    async def test_drag_applied_to_offer_creates_offer_received(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            app_id = await _create_application(authed, company.id)

            resp = await authed.post(
                f"/applications/{app_id}/transitions",
                json={"target_column": "offer"},
            )

        assert resp.status_code == 201, resp.text
        assert resp.json()["event_type"] == "offer_received"

    @pytest.mark.asyncio
    async def test_drag_to_closed_defaults_to_rejected(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            app_id = await _create_application(authed, company.id)

            resp = await authed.post(
                f"/applications/{app_id}/transitions",
                json={"target_column": "closed"},
            )

        assert resp.status_code == 201, resp.text
        assert resp.json()["event_type"] == "rejected"

    @pytest.mark.asyncio
    async def test_occurred_at_is_server_clock(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """The transition endpoint never trusts a client-supplied
        timestamp — ``occurred_at`` must be close to server now()."""
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        before = _dt.datetime.now(_dt.timezone.utc)

        async with await as_user(user) as authed:
            app_id = await _create_application(authed, company.id)
            resp = await authed.post(
                f"/applications/{app_id}/transitions",
                json={"target_column": "interviewing"},
            )

        after = _dt.datetime.now(_dt.timezone.utc)
        assert resp.status_code == 201, resp.text
        occurred_at = _dt.datetime.fromisoformat(resp.json()["occurred_at"])
        assert before <= occurred_at <= after


# ---------------------------------------------------------------------------
# Idempotency
# ---------------------------------------------------------------------------


class TestIdempotency:
    @pytest.mark.asyncio
    async def test_same_idempotency_key_returns_existing_event(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            app_id = await _create_application(authed, company.id)
            key = uuid.uuid4().hex

            first = await authed.post(
                f"/applications/{app_id}/transitions",
                json={"target_column": "interviewing", "idempotency_key": key},
            )
            second = await authed.post(
                f"/applications/{app_id}/transitions",
                json={"target_column": "interviewing", "idempotency_key": key},
            )

        assert first.status_code == 201
        assert second.status_code == 201
        # Same event id -> the second POST resolved to the existing row.
        assert first.json()["id"] == second.json()["id"]

    @pytest.mark.asyncio
    async def test_different_idempotency_keys_create_separate_events(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            app_id = await _create_application(authed, company.id)

            first = await authed.post(
                f"/applications/{app_id}/transitions",
                json={"target_column": "interviewing", "idempotency_key": uuid.uuid4().hex},
            )
            # Move back, then forward again — different keys -> two distinct events.
            _ = await authed.post(
                f"/applications/{app_id}/transitions",
                json={"target_column": "applied", "idempotency_key": uuid.uuid4().hex},
            )
            third = await authed.post(
                f"/applications/{app_id}/transitions",
                json={"target_column": "interviewing", "idempotency_key": uuid.uuid4().hex},
            )

        assert first.status_code == 201
        assert third.status_code == 201
        assert first.json()["id"] != third.json()["id"]


# ---------------------------------------------------------------------------
# Tenant isolation + bad transitions
# ---------------------------------------------------------------------------


class TestSecurityAndValidation:
    @pytest.mark.asyncio
    async def test_cross_tenant_target_returns_404(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user_a = await user_factory()
        user_b = await user_factory()
        company_a = await _create_company(db, uuid.UUID(user_a["id"]), "Acme A")

        async with await as_user(user_a) as authed_a:
            app_id = await _create_application(authed_a, company_a.id)

        async with await as_user(user_b) as authed_b:
            resp = await authed_b.post(
                f"/applications/{app_id}/transitions",
                json={"target_column": "interviewing"},
            )

        assert resp.status_code == 404
        assert resp.json()["detail"] == "Application not found"

    @pytest.mark.asyncio
    async def test_unknown_target_column_rejected_by_schema(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            app_id = await _create_application(authed, company.id)

            resp = await authed.post(
                f"/applications/{app_id}/transitions",
                json={"target_column": "totally-not-a-column"},
            )

        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_no_op_transition_returns_400(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """Dragging to the same column the app is already in is a no-op
        and rejected by the state machine — the route maps to 400."""
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            app_id = await _create_application(authed, company.id)

            # Newly-created applications log an "applied" event automatically;
            # ALLOWED_TRANSITIONS for "applied" excludes a self-transition.
            resp = await authed.post(
                f"/applications/{app_id}/transitions",
                json={"target_column": "applied"},
            )

        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Per-user rate limit
# ---------------------------------------------------------------------------


class TestPerUserRateLimit:
    @pytest.mark.asyncio
    async def test_31st_transition_in_a_minute_returns_429(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """The per-user transition limiter caps at 30 / minute. The 31st
        request should be rejected with 429 even though the application
        and the proposed transition are valid."""
        from app.api.applications import (
            _TRANSITION_LIMITER_PER_HOUR,
            _TRANSITION_LIMITER_PER_MIN,
        )

        # Reset module-level limiter state — other tests may have populated
        # buckets and we want a clean window for this assertion.
        _TRANSITION_LIMITER_PER_MIN._buckets.clear()
        _TRANSITION_LIMITER_PER_HOUR._buckets.clear()

        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            app_id = await _create_application(authed, company.id)
            # Alternate between interviewing <-> applied to keep transitions valid.
            for i in range(30):
                target = "interviewing" if i % 2 == 0 else "applied"
                resp = await authed.post(
                    f"/applications/{app_id}/transitions",
                    json={
                        "target_column": target,
                        "idempotency_key": f"transition-{i}-{uuid.uuid4().hex}",
                    },
                )
                assert resp.status_code == 201, f"attempt {i} returned {resp.status_code}: {resp.text}"

            blocked = await authed.post(
                f"/applications/{app_id}/transitions",
                json={
                    "target_column": "interviewing",
                    "idempotency_key": f"transition-final-{uuid.uuid4().hex}",
                },
            )

        assert blocked.status_code == 429

        # Cleanup so other tests that import the limiter aren't affected.
        _TRANSITION_LIMITER_PER_MIN._buckets.clear()
        _TRANSITION_LIMITER_PER_HOUR._buckets.clear()
