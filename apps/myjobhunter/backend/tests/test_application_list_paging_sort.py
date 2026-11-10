"""Paging and server-side sorting for ``GET /applications``.

Clients page through the list with ``limit`` / ``offset`` and ask the server
to sort it, so these guard the contract they rely on:

- ``total`` is the real count across pages, with the same filters and tenant
  scope as the page (it used to be the length of the page, which hid every
  application past the first 100).
- Paging is stable: rows that tie on the sort column, and even on the whole
  default order, never repeat or go missing between pages.
- ``sort`` / ``order`` are allowlisted (422 otherwise).
- Rows missing the sorted value sort last in both directions.
- Status sorts in pipeline order; remote sorts remote, hybrid, on-site; text
  sorts ignore case; fit sorts as a number.

Filters combined with sorting and paging, and ties between events, are in
``test_application_list_combinations``.
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application.application import Application
from app.models.application.application_event import ApplicationEvent
from app.repositories.application import application_repository
from app.services.application import application_list_service
from tests.application_list_support import BASE as _BASE
from tests.application_list_support import Seed as _Seed
from tests.application_list_support import all_pages as _all_pages
from tests.application_list_support import roles as _roles
from tests.application_list_support import seed as _seed

class TestTotalIsTheRealCount:
    @pytest.mark.asyncio
    async def test_total_counts_every_row_across_pages(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        await _seed(db, uuid.UUID(user["id"]), [_Seed(role=f"R{i}", applied_days=i) for i in range(7)])

        async with await as_user(user) as authed:
            roles, totals = await _all_pages(authed, "sort=applied&order=desc", page_size=3)

        assert totals == [7, 7, 7]
        assert roles == [f"R{i}" for i in range(6, -1, -1)]

    @pytest.mark.asyncio
    async def test_total_follows_the_status_filter_across_pages(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """The status filter runs before paging, so pages are full and the total is exact."""
        user = await user_factory()
        seeds = [_Seed(role=f"A{i}", applied_days=i, status="applied") for i in range(4)]
        seeds += [_Seed(role=f"X{i}", applied_days=10 + i, status="rejected") for i in range(4)]
        await _seed(db, uuid.UUID(user["id"]), seeds)

        async with await as_user(user) as authed:
            first = (await authed.get("/applications?status=applied&limit=3")).json()

        assert first["total"] == 4
        assert [item["role_title"] for item in first["items"]] == ["A3", "A2", "A1"]

    @pytest.mark.asyncio
    async def test_total_is_tenant_scoped(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        alice = await user_factory()
        bob = await user_factory()
        await _seed(db, uuid.UUID(alice["id"]), [_Seed(role=f"Alice{i}") for i in range(3)])
        await _seed(db, uuid.UUID(bob["id"]), [_Seed(role=f"Bob{i}") for i in range(5)])

        async with await as_user(alice) as authed:
            body = (await authed.get("/applications?limit=1")).json()

        assert body["total"] == 3
        assert body["items"][0]["role_title"].startswith("Alice")

    @pytest.mark.asyncio
    async def test_count_ignores_another_users_events(self, db: AsyncSession, user_factory) -> None:
        """An event row carrying another user's id never gives this user's application a status."""
        alice = await user_factory()
        bob = await user_factory()
        alice_id = uuid.UUID(alice["id"])
        [app_id] = await _seed(db, alice_id, [_Seed(role="Only")])
        db.add(
            ApplicationEvent(
                user_id=uuid.UUID(bob["id"]),
                application_id=app_id,
                event_type="offer_received",
                occurred_at=_BASE,
                source="manual",
            ),
        )
        await db.flush()

        assert await application_repository.count_with_status(db, alice_id, status_filter="offer_received") == 0
        page = await application_list_service.list_applications(db, alice_id)
        assert page.total == 1
        assert page.items[0].latest_status is None

    @pytest.mark.asyncio
    async def test_soft_deleted_rows_are_not_counted(self, db: AsyncSession, user_factory) -> None:
        user = await user_factory()
        user_id = uuid.UUID(user["id"])
        ids = await _seed(db, user_id, [_Seed(role="Kept"), _Seed(role="Gone")])
        gone = await db.get(Application, ids[1])
        assert gone is not None
        gone.deleted_at = _BASE
        await db.flush()

        page = await application_list_service.list_applications(db, user_id)

        assert page.total == 1
        assert [item.role_title for item in page.items] == ["Kept"]


class TestStablePaging:
    @pytest.mark.asyncio
    async def test_rows_that_tie_on_everything_page_without_repeats_or_gaps(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """Same company, applied and created instant: only ``id`` tells them apart."""
        user = await user_factory()
        await _seed(db, uuid.UUID(user["id"]), [_Seed(role=f"Tie{i}") for i in range(7)])

        async with await as_user(user) as authed:
            for query in ("sort=company&order=asc", "sort=company&order=desc", "sort=applied&order=desc"):
                roles, _ = await _all_pages(authed, query, page_size=2)
                assert sorted(roles) == [f"Tie{i}" for i in range(7)], query
                # And asking again gives the same order.
                again, _ = await _all_pages(authed, query, page_size=2)
                assert again == roles, query

    @pytest.mark.asyncio
    async def test_ties_on_the_sorted_column_keep_the_default_order(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        await _seed(
            db,
            uuid.UUID(user["id"]),
            [
                _Seed(role="Old", company="Same", applied_days=1),
                _Seed(role="New", company="Same", applied_days=5),
                _Seed(role="Draft", company="Same", applied_days=None),
                _Seed(role="Other", company="Zed", applied_days=9),
            ],
        )

        async with await as_user(user) as authed:
            assert await _roles(authed, "sort=company&order=asc") == ["New", "Old", "Draft", "Other"]
            assert await _roles(authed, "sort=company&order=desc") == ["Other", "New", "Old", "Draft"]

    @pytest.mark.asyncio
    async def test_default_order_is_applied_newest_first_then_created(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """No sort params gives the order the endpoint has always returned."""
        user = await user_factory()
        await _seed(
            db,
            uuid.UUID(user["id"]),
            [
                _Seed(role="DraftOld", applied_days=None, created_days=1),
                _Seed(role="Applied1", applied_days=1),
                _Seed(role="DraftNew", applied_days=None, created_days=2),
                _Seed(role="Applied3", applied_days=3),
            ],
        )

        async with await as_user(user) as authed:
            assert await _roles(authed, "") == ["Applied3", "Applied1", "DraftNew", "DraftOld"]


class TestSortAllowlist:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("query", ["sort=jd_text", "sort=user_id", "sort=", "order=sideways", "order=ASC"])
    async def test_unknown_sort_or_order_is_rejected(self, user_factory, as_user, query: str) -> None:
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.get(f"/applications?{query}")
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_repository_refuses_a_sort_outside_the_allowlist(self, db: AsyncSession, user_factory) -> None:
        user = await user_factory()
        with pytest.raises(ValueError, match="Unknown sort field"):
            await application_repository.list_with_status(
                db, uuid.UUID(user["id"]), sort="jd_text",  # type: ignore[arg-type]
            )


class TestSortOrder:
    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("field", "with_value", "missing"),
        [
            ("applied", {"applied_days": 3}, {"applied_days": None}),
            ("location", {"location": "Austin"}, {"location": None}),
            ("location", {"location": "Austin"}, {"location": "   "}),
            ("remote", {"remote_type": "hybrid"}, {"remote_type": "unknown"}),
            ("fit", {"fit": "50"}, {"fit": None}),
            ("status", {"status": "applied"}, {"status": None}),
            ("company", {"company": "Acme"}, {"company": " "}),
            ("role", {}, {}),
        ],
    )
    async def test_missing_values_sort_last_both_ways(
        self, db: AsyncSession, user_factory, as_user, field: str, with_value: dict, missing: dict,
    ) -> None:
        user = await user_factory()
        if field == "role":
            seeds = [_Seed(role="Engineer"), _Seed(role="Analyst"), _Seed(role="  ", applied_days=9)]
        else:
            seeds = [
                _Seed(role="HasLow", **{**with_value, **_low(field)}),
                _Seed(role="Missing", **{**missing, "applied_days": missing.get("applied_days", 9)}),
                _Seed(role="HasHigh", **{**with_value, **_high(field)}),
            ]
        await _seed(db, uuid.UUID(user["id"]), seeds)

        async with await as_user(user) as authed:
            ascending = await _roles(authed, f"sort={field}&order=asc")
            descending = await _roles(authed, f"sort={field}&order=desc")

        if field == "role":
            assert ascending == ["Analyst", "Engineer", "  "]
            assert descending == ["Engineer", "Analyst", "  "]
        else:
            assert ascending == ["HasLow", "HasHigh", "Missing"]
            assert descending == ["HasHigh", "HasLow", "Missing"]

    @pytest.mark.asyncio
    async def test_status_sorts_in_pipeline_order_not_alphabetically(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        await _seed(
            db,
            uuid.UUID(user["id"]),
            [
                _Seed(role="Rejected", status="rejected"),
                _Seed(role="None", status=None),
                _Seed(role="Offer", status="offer_received"),
                _Seed(role="Applied", status="applied"),
                _Seed(role="Interview", status="interview_scheduled"),
            ],
        )

        async with await as_user(user) as authed:
            assert await _roles(authed, "sort=status&order=asc") == ["Applied", "Interview", "Offer", "Rejected", "None"]
            assert await _roles(authed, "sort=status&order=desc") == ["Rejected", "Offer", "Interview", "Applied", "None"]

    @pytest.mark.asyncio
    async def test_remote_sorts_most_remote_first_not_alphabetically(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        await _seed(
            db,
            uuid.UUID(user["id"]),
            [
                _Seed(role="Onsite", remote_type="onsite"),
                _Seed(role="Unknown", remote_type="unknown"),
                _Seed(role="Remote", remote_type="remote"),
                _Seed(role="Hybrid", remote_type="hybrid"),
            ],
        )

        async with await as_user(user) as authed:
            assert await _roles(authed, "sort=remote&order=asc") == ["Remote", "Hybrid", "Onsite", "Unknown"]
            assert await _roles(authed, "sort=remote&order=desc") == ["Onsite", "Hybrid", "Remote", "Unknown"]

    @pytest.mark.asyncio
    async def test_text_ignores_case_and_fit_sorts_as_a_number(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        await _seed(
            db,
            uuid.UUID(user["id"]),
            [
                _Seed(role="b", company="beta", fit="100"),
                _Seed(role="A", company="Alpha", fit="92.50"),
                _Seed(role="c", company="Gamma", fit="9"),
            ],
        )

        async with await as_user(user) as authed:
            assert await _roles(authed, "sort=company&order=asc") == ["A", "b", "c"]
            assert await _roles(authed, "sort=role&order=desc") == ["c", "b", "A"]
            assert await _roles(authed, "sort=fit&order=desc") == ["b", "A", "c"]

    @pytest.mark.asyncio
    async def test_sorted_pages_join_into_one_sorted_list(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """The sort spans the whole list, not each page on its own."""
        user = await user_factory()
        await _seed(
            db,
            uuid.UUID(user["id"]),
            [_Seed(role=f"R{i}", company=f"Co{9 - i}", applied_days=i) for i in range(10)],
        )

        async with await as_user(user) as authed:
            roles, totals = await _all_pages(authed, "sort=company&order=asc", page_size=4)

        assert totals == [10, 10, 10]
        assert roles == [f"R{i}" for i in range(9, -1, -1)]


def _low(field: str) -> dict:
    return {
        "applied": {"applied_days": 1},
        "location": {"location": "austin"},
        "remote": {"remote_type": "remote"},
        "fit": {"fit": "10"},
        "status": {"status": "applied"},
        "company": {"company": "Acme"},
    }[field]


def _high(field: str) -> dict:
    return {
        "applied": {"applied_days": 5},
        "location": {"location": "Boston"},
        "remote": {"remote_type": "hybrid"},
        "fit": {"fit": "90"},
        "status": {"status": "offer_received"},
        "company": {"company": "Zed"},
    }[field]
