"""Tests for interview_details on application events.

Covers:
- POST /applications/{id}/events with interview_details persists correctly
  and round-trips through the response.
- interview_details rejected on non-interview event types (422).
- interview_details with missing ``type`` sub-field rejected (422).
- interview_details with invalid ``type`` value rejected (422).
- interview_details is null on events that don't supply it.
- interview_details partial data (only type provided) accepted.
- GET /applications/{id}/events returns interview_details in response.
"""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company.company import Company


async def _create_company(db: AsyncSession, user_id: uuid.UUID, name: str) -> Company:
    company = Company(
        user_id=user_id,
        name=name,
        primary_domain=f"{name.lower().replace(' ', '-')}.example.com",
    )
    db.add(company)
    await db.commit()
    await db.refresh(company)
    return company


def _now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


def _app_payload(company_id: uuid.UUID) -> dict:
    return {
        "company_id": str(company_id),
        "role_title": "Software Engineer",
        "source": "linkedin",
        "remote_type": "remote",
    }


def _event_payload(event_type: str = "interview_scheduled", **overrides) -> dict:
    payload: dict = {
        "event_type": event_type,
        "occurred_at": _now_iso(),
        "source": "manual",
    }
    payload.update(overrides)
    return payload


_FULL_INTERVIEW_DETAILS = {
    "type": "video",
    "scheduled_at": "2026-06-01T14:00:00+00:00",
    "duration_minutes": 60,
    "location_or_link": "https://meet.google.com/xyz-abc-def",
    "interviewer_names": ["Alex Kim", "Jordan Lee"],
}


class TestInterviewDetailsCreate:
    @pytest.mark.asyncio
    async def test_full_interview_details_persisted_and_returned(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """POST with full interview_details returns 201 and the details round-trip."""
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "TechCorp")

        async with await as_user(user) as authed:
            create_app = await authed.post("/applications", json=_app_payload(company.id))
            assert create_app.status_code == 201
            app_id = create_app.json()["id"]

            resp = await authed.post(
                f"/applications/{app_id}/events",
                json=_event_payload(
                    "interview_scheduled",
                    interview_details=_FULL_INTERVIEW_DETAILS,
                ),
            )

        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["event_type"] == "interview_scheduled"
        details = body["interview_details"]
        assert details is not None
        assert details["type"] == "video"
        assert details["duration_minutes"] == 60
        assert details["location_or_link"] == "https://meet.google.com/xyz-abc-def"
        assert details["interviewer_names"] == ["Alex Kim", "Jordan Lee"]
        # scheduled_at is stored as ISO string in JSONB
        assert "2026-06-01" in details["scheduled_at"]

    @pytest.mark.asyncio
    async def test_partial_interview_details_only_type(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """Only the 'type' sub-field is required; partial data is accepted."""
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "MiniCorp")

        async with await as_user(user) as authed:
            create_app = await authed.post("/applications", json=_app_payload(company.id))
            app_id = create_app.json()["id"]

            resp = await authed.post(
                f"/applications/{app_id}/events",
                json=_event_payload(
                    "interview_completed",
                    interview_details={"type": "onsite"},
                ),
            )

        assert resp.status_code == 201, resp.text
        body = resp.json()
        details = body["interview_details"]
        assert details is not None
        assert details["type"] == "onsite"
        # Optional fields omitted — should not appear in response
        assert "duration_minutes" not in details or details.get("duration_minutes") is None
        assert "interviewer_names" not in details or details.get("interviewer_names") is None

    @pytest.mark.asyncio
    async def test_no_interview_details_returns_null(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """When interview_details is not supplied, the response field is null."""
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "NullCorp")

        async with await as_user(user) as authed:
            create_app = await authed.post("/applications", json=_app_payload(company.id))
            app_id = create_app.json()["id"]

            resp = await authed.post(
                f"/applications/{app_id}/events",
                json=_event_payload("interview_scheduled"),
            )

        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["interview_details"] is None

    @pytest.mark.asyncio
    async def test_interview_details_on_non_interview_event_returns_422(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """interview_details is rejected when event_type is not interview_scheduled/completed."""
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "BadCorp")

        async with await as_user(user) as authed:
            create_app = await authed.post("/applications", json=_app_payload(company.id))
            app_id = create_app.json()["id"]

            resp = await authed.post(
                f"/applications/{app_id}/events",
                json=_event_payload(
                    "rejected",
                    interview_details={"type": "video"},
                ),
            )

        assert resp.status_code == 422, resp.text

    @pytest.mark.asyncio
    async def test_invalid_interview_type_returns_422(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """An unknown interview type value is rejected."""
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "InvalidTypeCorp")

        async with await as_user(user) as authed:
            create_app = await authed.post("/applications", json=_app_payload(company.id))
            app_id = create_app.json()["id"]

            resp = await authed.post(
                f"/applications/{app_id}/events",
                json=_event_payload(
                    "interview_scheduled",
                    interview_details={"type": "smoke_signal"},
                ),
            )

        assert resp.status_code == 422, resp.text

    @pytest.mark.asyncio
    async def test_missing_type_in_interview_details_returns_422(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """interview_details without 'type' is rejected (type is required)."""
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "MissingTypeCorp")

        async with await as_user(user) as authed:
            create_app = await authed.post("/applications", json=_app_payload(company.id))
            app_id = create_app.json()["id"]

            resp = await authed.post(
                f"/applications/{app_id}/events",
                json=_event_payload(
                    "interview_scheduled",
                    interview_details={"duration_minutes": 45},
                ),
            )

        assert resp.status_code == 422, resp.text


class TestInterviewDetailsGetList:
    @pytest.mark.asyncio
    async def test_list_events_includes_interview_details(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """GET /events returns interview_details in the items list."""
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "ListCorp")

        async with await as_user(user) as authed:
            create_app = await authed.post("/applications", json=_app_payload(company.id))
            app_id = create_app.json()["id"]

            await authed.post(
                f"/applications/{app_id}/events",
                json=_event_payload(
                    "interview_scheduled",
                    interview_details={
                        "type": "phone",
                        "interviewer_names": ["Sam Smith"],
                    },
                ),
            )

            list_resp = await authed.get(f"/applications/{app_id}/events")

        assert list_resp.status_code == 200, list_resp.text
        items = list_resp.json()["items"]
        # auto-created "applied" event (no details) + our interview event
        interview_event = next(
            (e for e in items if e["event_type"] == "interview_scheduled"), None
        )
        assert interview_event is not None
        assert interview_event["interview_details"] is not None
        assert interview_event["interview_details"]["type"] == "phone"
        assert interview_event["interview_details"]["interviewer_names"] == ["Sam Smith"]
