"""``applied_at`` on POST /applications, and the ``applied`` event it dates.

A hand-added application says when it was applied to; that day must be stored,
date the initial ``applied`` event, and let a stage change logged after it (but
before today) decide the stage. Without one (older phone builds), it's dated now
and still stored, so no new application is left without ``applied_at``.
"""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company.company import Company
from app.schemas.application.application_create_request import ApplicationCreateRequest


async def _create_company(db: AsyncSession, user_id: uuid.UUID) -> Company:
    company = Company(user_id=user_id, name="Acme", primary_domain=f"acme-{uuid.uuid4().hex[:6]}.example")
    db.add(company)
    await db.flush()
    return company


def _app_payload(company_id: uuid.UUID, **overrides: object) -> dict:
    return {"company_id": str(company_id), "role_title": "Staff Engineer", **overrides}


def _parse(value: str) -> _dt.datetime:
    return _dt.datetime.fromisoformat(value)


@pytest.mark.asyncio
async def test_backdated_applied_at_is_stored_and_dates_the_applied_event(
    db: AsyncSession, user_factory, as_user,
) -> None:
    user = await user_factory()
    company = await _create_company(db, uuid.UUID(user["id"]))
    two_weeks_ago = _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0) - _dt.timedelta(days=14)

    async with await as_user(user) as authed:
        created = await authed.post("/applications", json=_app_payload(company.id, applied_at=two_weeks_ago.isoformat()))
        assert created.status_code == 201, created.text
        app_id = created.json()["id"]
        events = await authed.get(f"/applications/{app_id}/events")

    assert _parse(created.json()["applied_at"]) == two_weeks_ago
    items = events.json()["items"]
    assert [item["event_type"] for item in items] == ["applied"]
    assert _parse(items[0]["occurred_at"]) == two_weeks_ago


@pytest.mark.asyncio
async def test_a_rejection_dated_after_the_day_applied_decides_the_stage(
    db: AsyncSession, user_factory, as_user,
) -> None:
    user = await user_factory()
    company = await _create_company(db, uuid.UUID(user["id"]))
    now = _dt.datetime.now(_dt.timezone.utc)
    two_weeks_ago = now - _dt.timedelta(days=14)
    last_week = now - _dt.timedelta(days=7)

    async with await as_user(user) as authed:
        created = await authed.post("/applications", json=_app_payload(company.id, applied_at=two_weeks_ago.isoformat()))
        app_id = created.json()["id"]
        rejected = await authed.post(
            f"/applications/{app_id}/events",
            json={"event_type": "rejected", "occurred_at": last_week.isoformat(), "source": "manual"},
        )
        assert rejected.status_code == 201, rejected.text
        listed = await authed.get("/applications")
        board = await authed.get("/applications?view=kanban")

    assert listed.json()["items"][0]["latest_status"] == "rejected"
    card = board.json()["items"][0]
    assert card["latest_event_type"] == "rejected"
    assert _parse(card["stage_entered_at"]) == last_week


@pytest.mark.asyncio
async def test_applied_at_left_out_is_now_and_still_stored(
    db: AsyncSession, user_factory, as_user,
) -> None:
    user = await user_factory()
    company = await _create_company(db, uuid.UUID(user["id"]))

    before = _dt.datetime.now(_dt.timezone.utc)
    async with await as_user(user) as authed:
        created = await authed.post("/applications", json=_app_payload(company.id))
        assert created.status_code == 201, created.text
        events = await authed.get(f"/applications/{created.json()['id']}/events")
    after = _dt.datetime.now(_dt.timezone.utc)

    applied_at = created.json()["applied_at"]
    assert applied_at is not None
    assert before <= _parse(applied_at) <= after
    assert _parse(events.json()["items"][0]["occurred_at"]) == _parse(applied_at)


@pytest.mark.asyncio
async def test_applied_at_in_the_future_is_refused(
    db: AsyncSession, user_factory, as_user,
) -> None:
    user = await user_factory()
    company = await _create_company(db, uuid.UUID(user["id"]))
    tomorrow = _dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(days=1)

    async with await as_user(user) as authed:
        refused = await authed.post("/applications", json=_app_payload(company.id, applied_at=tomorrow.isoformat()))
        listed = await authed.get("/applications")

    assert refused.status_code == 422
    assert listed.json()["total"] == 0


def test_create_request_allows_a_clock_a_little_fast_but_not_a_later_day() -> None:
    company_id = uuid.uuid4()
    now = _dt.datetime.now(_dt.timezone.utc)
    assert ApplicationCreateRequest(**_app_payload(company_id, applied_at=now + _dt.timedelta(minutes=1))).applied_at
    assert ApplicationCreateRequest(**_app_payload(company_id)).applied_at is None
    with pytest.raises(ValidationError, match="applied_at can't be in the future"):
        ApplicationCreateRequest(**_app_payload(company_id, applied_at=now + _dt.timedelta(days=1)))
    # A naive timestamp is read as UTC, as the column stores it.
    with pytest.raises(ValidationError):
        ApplicationCreateRequest(**_app_payload(company_id, applied_at=(now + _dt.timedelta(hours=2)).replace(tzinfo=None)))
