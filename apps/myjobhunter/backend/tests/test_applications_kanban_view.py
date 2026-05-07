"""Tests for ``GET /applications?view=kanban``.

Covers:
- Kanban view returns rows with ``latest_event_type``, ``stage_entered_at``,
  ``verdict``, and joined company display fields.
- Tenant isolation: User A's request never returns User B's applications.
- Joined verdict is filtered by ``user_id`` on the analyses side too — the
  security agent's "filter on both sides" requirement.
- Archived applications are excluded.
- Soft-deleted analyses do not contribute their verdict.
- Activity events (note_added, email_received, follow_up_sent) do not
  define a kanban stage.
"""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application.application import Application
from app.models.application.application_event import ApplicationEvent
from app.models.company.company import Company
from app.models.job_analysis.job_analysis import JobAnalysis


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _create_company(db: AsyncSession, user_id: uuid.UUID, name: str) -> Company:
    company = Company(
        user_id=user_id,
        name=name,
        primary_domain=f"{name.lower().replace(' ', '-')}-{uuid.uuid4().hex[:6]}.example.com",
        logo_url=f"https://example.com/{name.lower()}.png",
    )
    db.add(company)
    await db.flush()
    return company


def _app_payload(company_id: uuid.UUID, role: str = "Senior Engineer") -> dict:
    return {
        "company_id": str(company_id),
        "role_title": role,
        "source": "linkedin",
        "remote_type": "remote",
    }


def _event_payload(event_type: str, **overrides) -> dict:
    payload = {
        "event_type": event_type,
        "occurred_at": _dt.datetime.now(_dt.timezone.utc).isoformat(),
        "source": "manual",
    }
    payload.update(overrides)
    return payload


# ---------------------------------------------------------------------------
# Kanban shape + content
# ---------------------------------------------------------------------------


class TestKanbanViewShape:
    @pytest.mark.asyncio
    async def test_returns_kanban_shaped_rows(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_resp = await authed.post("/applications", json=_app_payload(company.id))
            assert create_resp.status_code == 201
            app_id = create_resp.json()["id"]

            resp = await authed.get("/applications?view=kanban")

        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 1
        item = body["items"][0]
        assert item["id"] == app_id
        assert item["role_title"] == "Senior Engineer"
        assert item["company_id"] == str(company.id)
        assert item["company_name"] == "Acme"
        assert item["company_logo_url"].endswith("acme.png")
        # The auto-logged "applied" event from create_application is the
        # most-recent stage-defining event.
        assert item["latest_event_type"] == "applied"
        assert item["stage_entered_at"] is not None
        assert item["verdict"] is None  # No analysis attached.

    @pytest.mark.asyncio
    async def test_activity_events_dont_define_a_stage(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """``note_added``, ``email_received``, ``follow_up_sent`` are
        excluded from the lateral subquery — they record activity but
        don't transition the application to a different column."""
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_resp = await authed.post("/applications", json=_app_payload(company.id))
            app_id = create_resp.json()["id"]

            # Move to interviewing first (real stage event).
            await authed.post(
                f"/applications/{app_id}/transitions",
                json={"target_column": "interviewing"},
            )
            # Then log activity that should NOT change the kanban stage.
            for et in ("note_added", "email_received", "follow_up_sent"):
                ev_resp = await authed.post(
                    f"/applications/{app_id}/events",
                    json=_event_payload(et),
                )
                assert ev_resp.status_code == 201, f"{et}: {ev_resp.text}"

            resp = await authed.get("/applications?view=kanban")

        assert resp.status_code == 200
        item = resp.json()["items"][0]
        # latest_event_type must still be the stage-defining one.
        assert item["latest_event_type"] == "interview_scheduled"

    @pytest.mark.asyncio
    async def test_archived_applications_excluded(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_resp = await authed.post("/applications", json=_app_payload(company.id))
            app_id = create_resp.json()["id"]

            # Archive it via PATCH.
            patch = await authed.patch(
                f"/applications/{app_id}",
                json={"archived": True},
            )
            assert patch.status_code == 200

            resp = await authed.get("/applications?view=kanban")

        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 0


# ---------------------------------------------------------------------------
# Tenant isolation (security agent's "both sides of the join" rule)
# ---------------------------------------------------------------------------


class TestKanbanTenantIsolation:
    @pytest.mark.asyncio
    async def test_user_b_does_not_see_user_a_applications(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user_a = await user_factory()
        user_b = await user_factory()

        company_a = await _create_company(db, uuid.UUID(user_a["id"]), "Acme A")

        async with await as_user(user_a) as authed_a:
            await authed_a.post("/applications", json=_app_payload(company_a.id, role="A's role"))

        async with await as_user(user_b) as authed_b:
            resp = await authed_b.get("/applications?view=kanban")

        assert resp.status_code == 200
        body = resp.json()
        # User B sees nothing.
        assert body["total"] == 0
        assert body["items"] == []

    @pytest.mark.asyncio
    async def test_verdict_join_filtered_by_user_id_on_both_sides(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """If two users somehow had a colliding ``applied_application_id``
        (e.g. via misuse), the analysis row of user B must NOT bleed into
        user A's kanban response. We simulate this by creating a JobAnalysis
        for user B that points (incorrectly) at user A's application id;
        the kanban query must still return verdict=None for user A."""
        user_a = await user_factory()
        user_b = await user_factory()

        company_a = await _create_company(db, uuid.UUID(user_a["id"]), "Acme A")

        async with await as_user(user_a) as authed_a:
            create_resp = await authed_a.post(
                "/applications", json=_app_payload(company_a.id),
            )
            app_a_id = create_resp.json()["id"]

        # Insert a misaligned analysis: owned by user B, applied_application_id
        # points at user A's row. This shape should not leak to user A's
        # kanban query because the join also filters on user_id.
        analysis = JobAnalysis(
            user_id=uuid.UUID(user_b["id"]),
            jd_text="some text",
            fingerprint="x" * 64,
            extracted={},
            verdict="strong_fit",
            verdict_summary="should-not-leak",
            applied_application_id=uuid.UUID(app_a_id),
        )
        db.add(analysis)
        await db.commit()

        async with await as_user(user_a) as authed_a:
            resp = await authed_a.get("/applications?view=kanban")

        assert resp.status_code == 200
        item = resp.json()["items"][0]
        assert item["verdict"] is None, (
            "A misaligned cross-tenant analysis row leaked into user A's response"
        )

    @pytest.mark.asyncio
    async def test_soft_deleted_analyses_do_not_contribute_verdict(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Acme")

        async with await as_user(user) as authed:
            create_resp = await authed.post("/applications", json=_app_payload(company.id))
            app_id = create_resp.json()["id"]

        analysis = JobAnalysis(
            user_id=uuid.UUID(user["id"]),
            jd_text="some text",
            fingerprint="y" * 64,
            extracted={},
            verdict="strong_fit",
            verdict_summary="ranked",
            applied_application_id=uuid.UUID(app_id),
            deleted_at=_dt.datetime.now(_dt.timezone.utc),
        )
        db.add(analysis)
        await db.commit()

        async with await as_user(user) as authed:
            resp = await authed.get("/applications?view=kanban")

        assert resp.status_code == 200
        item = resp.json()["items"][0]
        assert item["verdict"] is None
