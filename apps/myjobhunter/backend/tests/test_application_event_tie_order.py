"""Two stage events at the same ``occurred_at``: every surface picks the same one.

A kanban move and an event logged from a sheet opened in the same minute can
share an ``occurred_at``. The board and list break that tie by ``created_at``
then ``id`` (``LATEST_EVENT_ORDER``). The detail timeline, the events list and
the stage-move check must break it the same way, or the detail screen shows
one stage while the board shows another, and a move to the stage the board
shows is refused as a no-op on the detail screen's say-so.
"""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import EventSource, EventType
from app.models.application.application_event import ApplicationEvent
from app.models.company.company import Company

_STAGE_EVENT_TYPES = frozenset(EventType.STAGE_DEFINING)


async def _application_with_tied_stage_events(
    db: AsyncSession, authed: AsyncClient, user_id: uuid.UUID,
) -> str:
    """An application whose interview and offer share an ``occurred_at``; the offer was written last."""
    company = Company(user_id=user_id, name="Acme", primary_domain=f"acme-{uuid.uuid4().hex[:6]}.example.com")
    db.add(company)
    await db.commit()

    resp = await authed.post(
        "/applications",
        json={"company_id": str(company.id), "role_title": "Engineer", "remote_type": "remote"},
    )
    assert resp.status_code == 201, resp.text
    app_id = resp.json()["id"]

    now = _dt.datetime.now(_dt.timezone.utc)
    shared = now + _dt.timedelta(minutes=1)
    # Written in this order, so a read with no tiebreak tends to return the interview first.
    for offset, event_type in ((0, EventType.INTERVIEW_SCHEDULED), (1, EventType.OFFER_RECEIVED)):
        db.add(ApplicationEvent(
            user_id=user_id,
            application_id=uuid.UUID(app_id),
            event_type=event_type,
            occurred_at=shared,
            source=EventSource.MANUAL,
            created_at=now + _dt.timedelta(seconds=offset),
        ))
        await db.commit()
    return app_id


def _first_stage_event_type(events: list[dict]) -> str | None:
    return next((e["event_type"] for e in events if e["event_type"] in _STAGE_EVENT_TYPES), None)


class TestTiedStageEvents:
    @pytest.mark.asyncio
    async def test_detail_timeline_puts_the_later_written_event_first(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            app_id = await _application_with_tied_stage_events(db, authed, uuid.UUID(user["id"]))
            resp = await authed.get(f"/applications/{app_id}")

        assert resp.status_code == 200, resp.text
        events = resp.json()["events"]
        assert [e["event_type"] for e in events][:2] == [EventType.OFFER_RECEIVED, EventType.INTERVIEW_SCHEDULED]
        assert _first_stage_event_type(events) == EventType.OFFER_RECEIVED

    @pytest.mark.asyncio
    async def test_events_list_puts_the_later_written_event_first(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            app_id = await _application_with_tied_stage_events(db, authed, uuid.UUID(user["id"]))
            resp = await authed.get(f"/applications/{app_id}/events")

        assert resp.status_code == 200, resp.text
        items = resp.json()["items"]
        assert [e["event_type"] for e in items][:2] == [EventType.OFFER_RECEIVED, EventType.INTERVIEW_SCHEDULED]

    @pytest.mark.asyncio
    async def test_detail_and_board_agree_on_the_stage(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            app_id = await _application_with_tied_stage_events(db, authed, uuid.UUID(user["id"]))
            detail = await authed.get(f"/applications/{app_id}")
            board = await authed.get("/applications?view=kanban")

        assert board.status_code == 200, board.text
        [row] = [item for item in board.json()["items"] if item["id"] == app_id]
        assert row["latest_event_type"] == _first_stage_event_type(detail.json()["events"])

    @pytest.mark.asyncio
    async def test_a_move_reads_the_stage_the_board_shows(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            app_id = await _application_with_tied_stage_events(db, authed, uuid.UUID(user["id"]))
            to_offer = await authed.post(f"/applications/{app_id}/transitions", json={"target_column": "offer"})
            to_interviewing = await authed.post(
                f"/applications/{app_id}/transitions", json={"target_column": "interviewing"},
            )

        # Already in Offer, so a move there is a no-op; Interviewing is a real move.
        assert to_offer.status_code == 400, to_offer.text
        assert to_interviewing.status_code == 201, to_interviewing.text
