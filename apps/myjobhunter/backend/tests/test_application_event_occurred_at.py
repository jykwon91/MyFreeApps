"""``occurred_at`` on a logged event can't be in the future.

A future-dated event would outrank every later kanban drag (stamped ``now()``)
in the latest-event ordering, so the card would snap back. An upcoming
interview's time goes in ``interview_details.scheduled_at``, which stays free
to be in the future.
"""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.event_time_constants import OCCURRED_AT_CLOCK_SKEW_TOLERANCE
from app.models.company.company import Company
from app.schemas.application.application_event_create_request import (
    ApplicationEventCreateRequest,
)

_UTC = _dt.timezone.utc


def _now() -> _dt.datetime:
    return _dt.datetime.now(_UTC)


def _body(occurred_at: _dt.datetime, **extra: object) -> dict:
    return {
        "event_type": "interview_scheduled",
        "occurred_at": occurred_at.isoformat(),
        "source": "manual",
        **extra,
    }


class TestSchema:
    def test_future_occurred_at_rejected(self) -> None:
        with pytest.raises(ValidationError, match="can't be in the future"):
            ApplicationEventCreateRequest(**_body(_now() + _dt.timedelta(days=7)))

    def test_naive_future_occurred_at_rejected(self) -> None:
        naive = (_now() + _dt.timedelta(days=7)).replace(tzinfo=None)
        with pytest.raises(ValidationError, match="can't be in the future"):
            ApplicationEventCreateRequest(**_body(naive))

    def test_within_tolerance_accepted(self) -> None:
        soon = _now() + OCCURRED_AT_CLOCK_SKEW_TOLERANCE - _dt.timedelta(minutes=1)
        ApplicationEventCreateRequest(**_body(soon))

    def test_just_past_tolerance_rejected(self) -> None:
        late = _now() + OCCURRED_AT_CLOCK_SKEW_TOLERANCE + _dt.timedelta(minutes=1)
        with pytest.raises(ValidationError):
            ApplicationEventCreateRequest(**_body(late))

    def test_past_occurred_at_accepted(self) -> None:
        ApplicationEventCreateRequest(**_body(_now() - _dt.timedelta(days=3)))

    def test_future_scheduled_at_accepted(self) -> None:
        request = ApplicationEventCreateRequest(
            **_body(
                _now(),
                interview_details={
                    "type": "phone",
                    "scheduled_at": (_now() + _dt.timedelta(days=7)).isoformat(),
                },
            ),
        )
        assert request.interview_details is not None


async def _make_application(authed, db: AsyncSession, user: dict) -> str:
    company = Company(user_id=uuid.UUID(user["id"]), name="Acme", primary_domain="acme.example.com")
    db.add(company)
    await db.commit()
    await db.refresh(company)
    resp = await authed.post(
        "/applications",
        json={"company_id": str(company.id), "role_title": "Engineer", "source": "linkedin", "remote_type": "remote"},
    )
    assert resp.status_code == 201
    return resp.json()["id"]


class TestRoutes:
    @pytest.mark.asyncio
    async def test_create_future_occurred_at_returns_422(self, db: AsyncSession, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            app_id = await _make_application(authed, db, user)
            resp = await authed.post(
                f"/applications/{app_id}/events", json=_body(_now() + _dt.timedelta(days=7)),
            )
        assert resp.status_code == 422
        assert "can't be in the future" in resp.text

    @pytest.mark.asyncio
    async def test_create_within_tolerance_returns_201(self, db: AsyncSession, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            app_id = await _make_application(authed, db, user)
            resp = await authed.post(
                f"/applications/{app_id}/events", json=_body(_now() + _dt.timedelta(minutes=1)),
            )
        assert resp.status_code == 201, resp.text

    @pytest.mark.asyncio
    async def test_future_scheduled_at_returns_201(self, db: AsyncSession, user_factory, as_user) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            app_id = await _make_application(authed, db, user)
            resp = await authed.post(
                f"/applications/{app_id}/events",
                json=_body(
                    _now(),
                    interview_details={
                        "type": "phone",
                        "scheduled_at": (_now() + _dt.timedelta(days=7)).isoformat(),
                    },
                ),
            )
        assert resp.status_code == 201, resp.text

    @pytest.mark.asyncio
    async def test_update_cannot_set_occurred_at(self, db: AsyncSession, user_factory, as_user) -> None:
        """PATCH forbids ``occurred_at`` outright, so an edit can't move an event into the future."""
        user = await user_factory()
        async with await as_user(user) as authed:
            app_id = await _make_application(authed, db, user)
            created = await authed.post(f"/applications/{app_id}/events", json=_body(_now()))
            event_id = created.json()["id"]
            resp = await authed.patch(
                f"/applications/{app_id}/events/{event_id}",
                json={"occurred_at": (_now() + _dt.timedelta(days=7)).isoformat()},
            )
        assert resp.status_code == 422
