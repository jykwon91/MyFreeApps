"""The list status is the application's stage, never an activity event.

A note, a follow-up or an email logged after a stage event must leave the
status, the ``status=`` filter and the ``sort=status`` order on that stage,
the same as the kanban board.
"""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.application_list_constants import STATUS_SORT_RANKS
from app.core.enums import EventType
from app.models.application.application_event import ApplicationEvent
from tests.application_list_support import BASE, Seed, roles, seed

_ACTIVITY_EVENT_TYPES = (EventType.NOTE_ADDED, EventType.FOLLOW_UP_SENT, EventType.EMAIL_RECEIVED)
_AFTER_STAGE = BASE + _dt.timedelta(days=1)


def _activity(user_id: uuid.UUID, application_id: uuid.UUID, event_type: str) -> ApplicationEvent:
    return ApplicationEvent(
        user_id=user_id,
        application_id=application_id,
        event_type=event_type,
        occurred_at=_AFTER_STAGE,
        source="manual",
    )


class TestListStatusIgnoresActivityEvents:
    def test_every_stage_event_is_ranked_and_no_activity_event_is(self) -> None:
        assert set(STATUS_SORT_RANKS) == set(EventType.STAGE_DEFINING)
        assert not set(STATUS_SORT_RANKS) & set(_ACTIVITY_EVENT_TYPES)

    @pytest.mark.asyncio
    @pytest.mark.parametrize("activity", _ACTIVITY_EVENT_TYPES)
    async def test_activity_after_an_offer_leaves_the_status_as_offer(
        self, db: AsyncSession, user_factory, as_user, activity: str,
    ) -> None:
        user = await user_factory()
        user_id = uuid.UUID(user["id"])
        [offer_id] = await seed(db, user_id, [Seed(role="Offer", status=EventType.OFFER_RECEIVED)])
        db.add(_activity(user_id, offer_id, activity))
        await db.flush()

        async with await as_user(user) as authed:
            items = (await authed.get("/applications")).json()["items"]
            assert [item["latest_status"] for item in items] == [EventType.OFFER_RECEIVED]
            assert await roles(authed, f"status={EventType.OFFER_RECEIVED}") == ["Offer"]
            assert await roles(authed, f"status={activity}") == []
            total = (await authed.get(f"/applications?status={EventType.OFFER_RECEIVED}")).json()["total"]
            assert total == 1

    @pytest.mark.asyncio
    async def test_status_sort_follows_the_stage_not_the_activity(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        user_id = uuid.UUID(user["id"])
        [offer_id, _, _] = await seed(
            db,
            user_id,
            [
                Seed(role="Offer", status=EventType.OFFER_RECEIVED),
                Seed(role="Ghosted", status=EventType.GHOSTED),
                Seed(role="Applied", status=EventType.APPLIED),
            ],
        )
        db.add(_activity(user_id, offer_id, EventType.FOLLOW_UP_SENT))
        await db.flush()

        async with await as_user(user) as authed:
            assert await roles(authed, "sort=status&order=asc") == ["Applied", "Offer", "Ghosted"]
            assert await roles(authed, "sort=status&order=desc") == ["Ghosted", "Offer", "Applied"]

    @pytest.mark.asyncio
    async def test_a_later_stage_event_still_wins_over_an_earlier_one(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        user_id = uuid.UUID(user["id"])
        [app_id] = await seed(db, user_id, [Seed(role="Moved", status=EventType.APPLIED)])
        db.add(
            ApplicationEvent(
                user_id=user_id,
                application_id=app_id,
                event_type=EventType.INTERVIEW_SCHEDULED,
                occurred_at=_AFTER_STAGE,
                source="manual",
            ),
        )
        await db.flush()

        async with await as_user(user) as authed:
            assert await roles(authed, f"status={EventType.INTERVIEW_SCHEDULED}") == ["Moved"]
            assert await roles(authed, f"status={EventType.APPLIED}") == []
