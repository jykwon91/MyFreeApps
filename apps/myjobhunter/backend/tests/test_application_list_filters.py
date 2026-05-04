"""Tests for list-filter query params on ``GET /applications`` (Phase 2).

Covers:
- ``?status=<event_type>``: only applications whose latest event matches.
- ``?archived=true`` / ``?archived=false``: filter by archived flag.
- ``?since=<ISO8601>``: filter by applied_at >= since.
- ``?limit=N&offset=M``: pagination.
- Combined filters: status + archived, etc.
- Edge cases: status filter with no matches returns empty list; invalid
  limit returns 422.

Uses the same conftest fixtures as other write tests.
"""
from __future__ import annotations

import datetime as _dt
import urllib.parse
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company.company import Company


def _encode_dt(dt: _dt.datetime) -> str:
    """URL-encode an ISO datetime so ``+00:00`` doesn't become a space."""
    return urllib.parse.quote(dt.isoformat())


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _create_company(db: AsyncSession, user_id: uuid.UUID, name: str) -> Company:
    company = Company(
        user_id=user_id,
        name=name,
        primary_domain=f"{name.lower().replace(' ', '-')}-{uuid.uuid4().hex[:6]}.example",
    )
    db.add(company)
    await db.flush()
    return company


def _app_payload(company_id: uuid.UUID, role: str = "Software Engineer", **overrides) -> dict:
    payload: dict = {
        "company_id": str(company_id),
        "role_title": role,
        "remote_type": "remote",
        "source": "linkedin",
    }
    payload.update(overrides)
    return payload


def _event_payload(event_type: str, occurred_at: _dt.datetime | None = None) -> dict:
    return {
        "event_type": event_type,
        "occurred_at": (occurred_at or _dt.datetime.now(_dt.timezone.utc)).isoformat(),
        "source": "manual",
    }


# ---------------------------------------------------------------------------
# Status filter
# ---------------------------------------------------------------------------


class TestStatusFilter:
    @pytest.mark.asyncio
    async def test_status_filter_returns_matching_only(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Corp")

        async with await as_user(user) as authed:
            # App A: status = applied
            resp_a = await authed.post("/applications", json=_app_payload(company.id, "Eng A"))
            app_a_id = resp_a.json()["id"]
            await authed.post(f"/applications/{app_a_id}/events", json=_event_payload("applied"))

            # App B: status = rejected
            resp_b = await authed.post("/applications", json=_app_payload(company.id, "Eng B"))
            app_b_id = resp_b.json()["id"]
            await authed.post(f"/applications/{app_b_id}/events", json=_event_payload("rejected"))

            # Filter for applied only.
            list_resp = await authed.get("/applications?status=applied")

        assert list_resp.status_code == 200
        body = list_resp.json()
        assert body["total"] == 1
        assert body["items"][0]["role_title"] == "Eng A"
        assert body["items"][0]["latest_status"] == "applied"

    @pytest.mark.asyncio
    async def test_status_filter_no_match_returns_empty(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Corp")

        async with await as_user(user) as authed:
            resp = await authed.post("/applications", json=_app_payload(company.id))
            app_id = resp.json()["id"]
            await authed.post(f"/applications/{app_id}/events", json=_event_payload("applied"))

            # Filter for a status that exists but doesn't match any application.
            list_resp = await authed.get("/applications?status=offer_received")

        body = list_resp.json()
        assert body["total"] == 0
        assert body["items"] == []

    @pytest.mark.asyncio
    async def test_status_filter_excludes_non_matching_status(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """Applications whose latest status does not match the filter are excluded.

        A newly-created application has auto-applied status='applied'. Filtering
        by '?status=rejected' must return 0 results because the app's latest
        event is 'applied', not 'rejected'.
        """
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Corp")

        async with await as_user(user) as authed:
            # Create app — gets auto 'applied' event (source=system).
            await authed.post("/applications", json=_app_payload(company.id))

            # Filter for 'rejected' — the app's latest is 'applied', so no match.
            list_resp = await authed.get("/applications?status=rejected")

        body = list_resp.json()
        assert body["total"] == 0


# ---------------------------------------------------------------------------
# Archived filter
# ---------------------------------------------------------------------------


class TestArchivedFilter:
    @pytest.mark.asyncio
    async def test_archived_true_returns_archived_only(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Corp")

        async with await as_user(user) as authed:
            resp_a = await authed.post("/applications", json=_app_payload(company.id, "Active"))
            app_a_id = resp_a.json()["id"]

            resp_b = await authed.post(
                "/applications",
                json=_app_payload(company.id, "Archived", archived=True),
            )

            # Archive app_a via PATCH.
            await authed.patch(f"/applications/{app_a_id}", json={"archived": True})

            # Filter for archived.
            list_resp = await authed.get("/applications?archived=true")

        body = list_resp.json()
        # Both are archived now.
        assert body["total"] == 2

    @pytest.mark.asyncio
    async def test_archived_false_excludes_archived(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Corp")

        async with await as_user(user) as authed:
            # Create one active, one archived.
            await authed.post("/applications", json=_app_payload(company.id, "Active"))
            await authed.post(
                "/applications",
                json=_app_payload(company.id, "Archived", archived=True),
            )

            list_resp = await authed.get("/applications?archived=false")

        body = list_resp.json()
        assert body["total"] == 1
        assert body["items"][0]["role_title"] == "Active"

    @pytest.mark.asyncio
    async def test_no_archived_filter_returns_all(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Corp")

        async with await as_user(user) as authed:
            await authed.post("/applications", json=_app_payload(company.id, "Active"))
            await authed.post(
                "/applications",
                json=_app_payload(company.id, "Archived", archived=True),
            )

            list_resp = await authed.get("/applications")

        body = list_resp.json()
        assert body["total"] == 2


# ---------------------------------------------------------------------------
# Since filter
# ---------------------------------------------------------------------------


class TestSinceFilter:
    @pytest.mark.asyncio
    async def test_since_filters_by_applied_at(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Corp")

        old_date = _dt.datetime(2025, 1, 1, tzinfo=_dt.timezone.utc)
        new_date = _dt.datetime(2026, 1, 1, tzinfo=_dt.timezone.utc)
        cutoff = _dt.datetime(2025, 6, 1, tzinfo=_dt.timezone.utc)

        async with await as_user(user) as authed:
            await authed.post(
                "/applications",
                json=_app_payload(company.id, "Old App", applied_at=old_date.isoformat()),
            )
            await authed.post(
                "/applications",
                json=_app_payload(company.id, "New App", applied_at=new_date.isoformat()),
            )

            list_resp = await authed.get(f"/applications?since={_encode_dt(cutoff)}")

        assert list_resp.status_code == 200, list_resp.text
        body = list_resp.json()
        assert body["total"] == 1
        assert body["items"][0]["role_title"] == "New App"

    @pytest.mark.asyncio
    async def test_since_null_applied_at_excluded(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        """Applications with null applied_at are excluded when since is set."""
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Corp")
        cutoff = _dt.datetime(2025, 1, 1, tzinfo=_dt.timezone.utc)

        async with await as_user(user) as authed:
            # applied_at is null (default).
            await authed.post("/applications", json=_app_payload(company.id))

            list_resp = await authed.get(f"/applications?since={_encode_dt(cutoff)}")

        assert list_resp.status_code == 200, list_resp.text
        body = list_resp.json()
        # NULL applied_at does not satisfy >= cutoff.
        assert body["total"] == 0


# ---------------------------------------------------------------------------
# Pagination
# ---------------------------------------------------------------------------


class TestPagination:
    @pytest.mark.asyncio
    async def test_limit_caps_results(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Corp")

        async with await as_user(user) as authed:
            for i in range(5):
                await authed.post("/applications", json=_app_payload(company.id, f"Role {i}"))

            list_resp = await authed.get("/applications?limit=3")

        body = list_resp.json()
        assert body["total"] == 3  # total = len of returned page
        assert len(body["items"]) == 3

    @pytest.mark.asyncio
    async def test_offset_skips_rows(
        self, db: AsyncSession, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        company = await _create_company(db, uuid.UUID(user["id"]), "Corp")

        new = _dt.datetime(2026, 1, 2, tzinfo=_dt.timezone.utc)
        old = _dt.datetime(2026, 1, 1, tzinfo=_dt.timezone.utc)

        async with await as_user(user) as authed:
            await authed.post(
                "/applications",
                json=_app_payload(company.id, "First", applied_at=new.isoformat()),
            )
            await authed.post(
                "/applications",
                json=_app_payload(company.id, "Second", applied_at=old.isoformat()),
            )

            # offset=0 → First is page 1
            page_1 = await authed.get("/applications?limit=1&offset=0")
            # offset=1 → Second is page 2
            page_2 = await authed.get("/applications?limit=1&offset=1")

        assert page_1.json()["items"][0]["role_title"] == "First"
        assert page_2.json()["items"][0]["role_title"] == "Second"

    @pytest.mark.asyncio
    async def test_limit_zero_returns_422(
        self, user_factory, as_user,
    ) -> None:
        """limit=0 violates ge=1 constraint → 422."""
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.get("/applications?limit=0")
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_limit_over_max_returns_422(
        self, user_factory, as_user,
    ) -> None:
        """limit > 500 violates le=500 constraint → 422."""
        user = await user_factory()
        async with await as_user(user) as authed:
            resp = await authed.get("/applications?limit=501")
        assert resp.status_code == 422
