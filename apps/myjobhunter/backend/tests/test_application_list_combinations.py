"""``GET /applications`` with its filters, sort and paging used together.

- Two events at the same ``occurred_at``: the status shown, the status filter,
  the status sort and the kanban column all pick the same latest event, on
  every read.
- ``sort=status`` combined with ``status=``.
- ``archived=`` combined with paging: the total and every page follow it.
"""
from __future__ import annotations

import datetime as _dt
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application.application_event import ApplicationEvent
from tests.application_list_support import BASE, Seed, all_pages, roles, seed

_LATER = BASE + _dt.timedelta(hours=1)


def _event(user_id: uuid.UUID, application_id: uuid.UUID, event_type: str, *, created_at: _dt.datetime, event_id: uuid.UUID | None = None) -> ApplicationEvent:
    """An event that happened at ``BASE``, recorded at ``created_at``."""
    return ApplicationEvent(
        id=event_id or uuid.uuid4(),
        user_id=user_id,
        application_id=application_id,
        event_type=event_type,
        occurred_at=BASE,
        created_at=created_at,
        source="manual",
    )


async def _statuses(authed: AsyncClient, query: str) -> dict[str, str | None]:
    resp = await authed.get(f"/applications?{query}")
    assert resp.status_code == 200, resp.text
    return {item["role_title"]: item["latest_status"] for item in resp.json()["items"]}


class TestEventsAtTheSameTime:
    """Each tie is seeded twice, inserted in both orders, so no physical row order can pass by luck."""

    @pytest.mark.asyncio
    async def test_the_later_recorded_event_is_the_latest_everywhere(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """Rejected was recorded after Applied for the same moment, so Rejected is the status."""
        user = await user_factory()
        user_id = uuid.UUID(user["id"])
        [first, second, _other] = await seed(
            db, user_id, [Seed(role="TiedA"), Seed(role="TiedB"), Seed(role="Other", status="interview_scheduled")],
        )
        db.add(_event(user_id, first, "rejected", created_at=_LATER))
        db.add(_event(user_id, first, "applied", created_at=BASE))
        db.add(_event(user_id, second, "applied", created_at=BASE))
        db.add(_event(user_id, second, "rejected", created_at=_LATER))
        await db.flush()

        async with await as_user(user) as authed:
            for _ in range(3):
                shown = await _statuses(authed, "")
                assert (shown["TiedA"], shown["TiedB"]) == ("rejected", "rejected")
            assert sorted(await roles(authed, "status=rejected")) == ["TiedA", "TiedB"]
            assert await roles(authed, "status=applied") == []
            # Rejected ranks after an interview in the pipeline; Applied would rank before it.
            assert (await roles(authed, "sort=status&order=asc"))[0] == "Other"
            kanban = (await authed.get("/applications?view=kanban")).json()["items"]
            stages = {item["role_title"]: item["latest_event_type"] for item in kanban}
            assert (stages["TiedA"], stages["TiedB"]) == ("rejected", "rejected")

    @pytest.mark.asyncio
    async def test_a_full_tie_is_broken_by_the_higher_id(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        user_id = uuid.UUID(user["id"])
        [first, second] = await seed(db, user_id, [Seed(role="TiedA"), Seed(role="TiedB")])
        ids = sorted(uuid.uuid4() for _ in range(4))
        db.add(_event(user_id, first, "offer_received", created_at=BASE, event_id=ids[1]))
        db.add(_event(user_id, first, "applied", created_at=BASE, event_id=ids[0]))
        db.add(_event(user_id, second, "applied", created_at=BASE, event_id=ids[2]))
        db.add(_event(user_id, second, "offer_received", created_at=BASE, event_id=ids[3]))
        await db.flush()

        async with await as_user(user) as authed:
            for _ in range(3):
                assert await _statuses(authed, "") == {"TiedA": "offer_received", "TiedB": "offer_received"}
            assert sorted(await roles(authed, "status=offer_received")) == ["TiedA", "TiedB"]
            assert await roles(authed, "status=applied") == []


class TestFiltersWithSortAndPaging:
    @pytest.mark.asyncio
    async def test_status_sort_with_the_status_filter(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """Every row shares the status, so the sort falls back to the default order, over the filtered rows only."""
        user = await user_factory()
        seeds = [Seed(role=f"Applied{i}", applied_days=i, status="applied") for i in range(5)]
        seeds += [Seed(role=f"Offer{i}", applied_days=10 + i, status="offer_received") for i in range(3)]
        seeds += [Seed(role="NoStatus", applied_days=20)]
        await seed(db, uuid.UUID(user["id"]), seeds)

        async with await as_user(user) as authed:
            for order in ("asc", "desc"):
                collected, totals = await all_pages(authed, f"status=applied&sort=status&order={order}", page_size=2)
                assert totals == [5, 5, 5]
                assert collected == [f"Applied{i}" for i in range(4, -1, -1)]
            offers, offer_totals = await all_pages(authed, "status=offer_received&sort=status&order=desc", page_size=2)
            assert offer_totals == [3, 3]
            assert offers == ["Offer2", "Offer1", "Offer0"]

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("archived", "expected"),
        [
            ("true", [f"Archived{i}" for i in range(4, -1, -1)]),
            ("false", [f"Active{i}" for i in range(6, -1, -1)]),
        ],
    )
    async def test_archived_with_paging_and_total(
        self, db: AsyncSession, user_factory, as_user, archived: str, expected: list[str],
    ) -> None:
        user = await user_factory()
        seeds = [Seed(role=f"Active{i}", applied_days=i) for i in range(7)]
        seeds += [Seed(role=f"Archived{i}", applied_days=i, archived=True) for i in range(5)]
        await seed(db, uuid.UUID(user["id"]), seeds)

        async with await as_user(user) as authed:
            collected, totals = await all_pages(authed, f"archived={archived}&sort=applied&order=desc", page_size=3)
            everything, everything_totals = await all_pages(authed, "sort=applied&order=desc", page_size=5)

        assert collected == expected
        assert set(totals) == {len(expected)}
        assert len(everything) == 12
        assert set(everything_totals) == {12}
