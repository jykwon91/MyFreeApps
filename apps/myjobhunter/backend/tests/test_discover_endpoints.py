"""End-to-end tests for the /discover surface.

Mocks JSearch via patching the adapter's ``search`` function so no real
RapidAPI calls happen. Verifies:

- Saved-search CRUD (create / list / deactivate / cross-tenant 404)
- Refresh trigger calls JSearch and persists discovered_jobs rows
- Refresh maps adapter errors to the right HTTP status codes
- GET /discover returns the inbox view
- Dismiss / save toggle the right state columns
- Tenant isolation: user A cannot see / dismiss / save user B's rows
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.discovery.sources.jsearch import (
    JSearchAuthError,
    JSearchTransientError,
)


_SEARCH_PATH = "app.services.discovery.discovery_fetch_service.jsearch.search"


def _posting(**overrides):
    base = {
        "source": "jsearch",
        "source_external_id": "fake-id-1",
        "source_publisher": "LinkedIn",
        "source_url": "https://www.linkedin.com/jobs/view/1",
        "title": "Senior Backend Engineer",
        "company_name": "Acme",
        "location": "Remote",
        "remote_type": "remote",
        "description": "Looking for a senior backend engineer with 8+ years of Python.",
        "description_normalized": None,
        "content_hash": None,
        "posted_at": datetime(2026, 5, 6, 19, 0, tzinfo=timezone.utc),
        "salary_min": 150000.0,
        "salary_max": 200000.0,
        "salary_currency": "USD",
        "salary_period": "annual",
        "raw_payload": {"job_id": "fake-id-1"},
    }
    base.update(overrides)
    return base


# ===========================================================================
# Saved-search CRUD
# ===========================================================================


@pytest.mark.asyncio
async def test_create_source_201(client: AsyncClient, user_factory, as_user):
    user = await user_factory()
    async with await as_user(user) as authed:
        resp = await authed.post(
            "/discover/sources",
            json={
                "source": "jsearch",
                "config": {"query": "senior backend engineer python remote"},
                "fetch_interval_minutes": 360,
            },
        )

    assert resp.status_code == 201
    body = resp.json()
    assert body["source"] == "jsearch"
    assert body["config"]["query"] == "senior backend engineer python remote"
    assert body["is_active"] is True
    assert body["fetch_interval_minutes"] == 360


@pytest.mark.asyncio
async def test_list_sources_returns_only_caller_rows(
    client: AsyncClient, user_factory, as_user,
):
    owner = await user_factory()
    other = await user_factory()

    async with await as_user(owner) as a:
        await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "owner search"}},
        )
    async with await as_user(other) as a:
        await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "other search"}},
        )

    async with await as_user(owner) as a:
        resp = await a.get("/discover/sources")

    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
    assert rows[0]["config"]["query"] == "owner search"


@pytest.mark.asyncio
async def test_delete_source_204_then_404(
    client: AsyncClient, user_factory, as_user,
):
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}},
        )
        source_id = created.json()["id"]

        resp = await a.delete(f"/discover/sources/{source_id}")
        assert resp.status_code == 204

        # No longer in active list
        resp = await a.get("/discover/sources")
        assert resp.json() == []


@pytest.mark.asyncio
async def test_delete_source_cross_tenant_404(
    client: AsyncClient, user_factory, as_user,
):
    owner = await user_factory()
    attacker = await user_factory()
    async with await as_user(owner) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}},
        )
        source_id = created.json()["id"]

    async with await as_user(attacker) as a:
        resp = await a.delete(f"/discover/sources/{source_id}")
        assert resp.status_code == 404


# ===========================================================================
# Refresh
# ===========================================================================


@pytest.mark.asyncio
async def test_refresh_source_persists_postings(
    client: AsyncClient, user_factory, as_user,
):
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "python remote"}},
        )
        source_id = created.json()["id"]

        with patch(_SEARCH_PATH, new_callable=AsyncMock, return_value=[_posting()]):
            resp = await a.post(f"/discover/sources/{source_id}/refresh")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "success"
    assert body["fetched_count"] == 1
    assert body["new_count"] == 1
    assert body["updated_count"] == 0


@pytest.mark.asyncio
async def test_refresh_source_idempotent_dedup(
    client: AsyncClient, user_factory, as_user,
):
    """Re-fetching the same posting hits ON CONFLICT DO UPDATE — no
    new row, but the updated_count increments."""
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}},
        )
        source_id = created.json()["id"]

        with patch(_SEARCH_PATH, new_callable=AsyncMock, return_value=[_posting()]):
            await a.post(f"/discover/sources/{source_id}/refresh")
            second = await a.post(f"/discover/sources/{source_id}/refresh")

    body = second.json()
    assert body["new_count"] == 0
    assert body["updated_count"] == 1


@pytest.mark.asyncio
async def test_refresh_source_404_when_not_owner(
    client: AsyncClient, user_factory, as_user,
):
    owner = await user_factory()
    attacker = await user_factory()
    async with await as_user(owner) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}},
        )
        source_id = created.json()["id"]

    async with await as_user(attacker) as a:
        resp = await a.post(f"/discover/sources/{source_id}/refresh")
        assert resp.status_code == 404


@pytest.mark.asyncio
async def test_refresh_source_503_on_missing_api_key(
    client: AsyncClient, user_factory, as_user,
):
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}},
        )
        source_id = created.json()["id"]

        with patch(
            _SEARCH_PATH,
            new_callable=AsyncMock,
            side_effect=JSearchAuthError("missing key"),
        ):
            resp = await a.post(f"/discover/sources/{source_id}/refresh")

    assert resp.status_code == 503
    assert "JSEARCH_API_KEY" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_refresh_source_502_on_transient_error(
    client: AsyncClient, user_factory, as_user,
):
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}},
        )
        source_id = created.json()["id"]

        with patch(
            _SEARCH_PATH,
            new_callable=AsyncMock,
            side_effect=JSearchTransientError("upstream 503"),
        ):
            resp = await a.post(f"/discover/sources/{source_id}/refresh")

    assert resp.status_code == 502


# ===========================================================================
# Listing + state transitions
# ===========================================================================


@pytest.mark.asyncio
async def test_list_discovered_inbox_default(
    client: AsyncClient, user_factory, as_user,
):
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}},
        )
        source_id = created.json()["id"]

        with patch(_SEARCH_PATH, new_callable=AsyncMock, return_value=[_posting()]):
            await a.post(f"/discover/sources/{source_id}/refresh")

        resp = await a.get("/discover")

    assert resp.status_code == 200
    body = resp.json()
    assert body["state"] == "inbox"
    assert body["total"] == 1
    assert body["items"][0]["title"] == "Senior Backend Engineer"
    assert body["items"][0]["dismissed_at"] is None
    assert body["items"][0]["saved_at"] is None
    # Coverage: one unscored posting → scored 0 of 1. These drive the
    # frontend's "Scored N of M" line so the unscored tail reads as
    # "awaiting the daily pass", not "broken".
    assert body["scored_count"] == 0
    assert body["total_count"] == 1
    # has_more is inherited from the shared ListResponse; a single row fits one page.
    assert body["has_more"] is False


@pytest.mark.asyncio
async def test_inbox_pagination_total_is_full_count_and_has_more(
    client: AsyncClient, user_factory, as_user,
):
    """``total`` is the full matching-row count (not the returned page length),
    and ``has_more`` flips across pages — what the frontend load-more relies on."""
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}},
        )
        source_id = created.json()["id"]

        postings = [
            _posting(
                source_external_id=f"fake-id-{i}",
                source_url=f"https://www.linkedin.com/jobs/view/{i}",
                raw_payload={"job_id": f"fake-id-{i}"},
            )
            for i in range(3)
        ]
        with patch(_SEARCH_PATH, new_callable=AsyncMock, return_value=postings):
            await a.post(f"/discover/sources/{source_id}/refresh")

        page1 = (await a.get("/discover?limit=2&offset=0")).json()
        page2 = (await a.get("/discover?limit=2&offset=2")).json()

    # Page 1: 2 of 3 rows, but total reflects ALL matching rows.
    assert page1["total"] == 3
    assert len(page1["items"]) == 2
    assert page1["has_more"] is True
    # Page 2: the remaining row, nothing after it.
    assert page2["total"] == 3
    assert len(page2["items"]) == 1
    assert page2["has_more"] is False


@pytest.mark.asyncio
async def test_inbox_coverage_counts_scored_vs_total(
    client: AsyncClient, user_factory, as_user, db,
):
    """The inbox coverage counts reflect the WHOLE active inbox and track
    scored-vs-total as rows get scored — independent of the list page."""
    from app.repositories.discovery import discovery_repository

    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}},
        )
        source_id = created.json()["id"]

        with patch(
            _SEARCH_PATH,
            new_callable=AsyncMock,
            return_value=[
                _posting(),
                _posting(source_external_id="ext-2", raw_payload={"job_id": "ext-2"}),
            ],
        ):
            await a.post(f"/discover/sources/{source_id}/refresh")

        # Both unscored initially.
        before = (await a.get("/discover")).json()
        assert before["scored_count"] == 0
        assert before["total_count"] == 2

        # Score one row directly, then re-read coverage.
        rows = await discovery_repository.list_discovered(db, user.id, state="inbox")
        rows[0].score = 90
        await db.commit()

        after = (await a.get("/discover")).json()
        assert after["scored_count"] == 1
        assert after["total_count"] == 2


@pytest.mark.asyncio
async def test_dismiss_discovered_removes_from_inbox(
    client: AsyncClient, user_factory, as_user,
):
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}},
        )
        source_id = created.json()["id"]

        with patch(_SEARCH_PATH, new_callable=AsyncMock, return_value=[_posting()]):
            await a.post(f"/discover/sources/{source_id}/refresh")

        listed = await a.get("/discover")
        job_id = listed.json()["items"][0]["id"]

        resp = await a.post(f"/discover/{job_id}/dismiss")
        assert resp.status_code == 204

        listed_after = await a.get("/discover")
        assert listed_after.json()["total"] == 0


@pytest.mark.asyncio
async def test_save_discovered_moves_to_saved_state(
    client: AsyncClient, user_factory, as_user,
):
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}},
        )
        source_id = created.json()["id"]

        with patch(_SEARCH_PATH, new_callable=AsyncMock, return_value=[_posting()]):
            await a.post(f"/discover/sources/{source_id}/refresh")

        listed = await a.get("/discover")
        job_id = listed.json()["items"][0]["id"]

        resp = await a.post(f"/discover/{job_id}/save")
        assert resp.status_code == 204

        # Inbox should be empty.
        inbox = await a.get("/discover")
        assert inbox.json()["total"] == 0

        # Saved view should show it.
        saved = await a.get("/discover", params={"state": "saved"})
        assert saved.json()["total"] == 1
        assert saved.json()["items"][0]["id"] == job_id


@pytest.mark.asyncio
async def test_dismiss_cross_tenant_404(
    client: AsyncClient, user_factory, as_user,
):
    owner = await user_factory()
    attacker = await user_factory()
    async with await as_user(owner) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}},
        )
        source_id = created.json()["id"]
        with patch(_SEARCH_PATH, new_callable=AsyncMock, return_value=[_posting()]):
            await a.post(f"/discover/sources/{source_id}/refresh")
        listed = await a.get("/discover")
        job_id = listed.json()["items"][0]["id"]

    async with await as_user(attacker) as a:
        resp = await a.post(f"/discover/{job_id}/dismiss")
        assert resp.status_code == 404


# ===========================================================================
# Repository-level: save_discovered clears dismissed_reason
# ===========================================================================


@pytest.mark.asyncio
async def test_save_clears_dismissed_reason(
    client: AsyncClient, user_factory, as_user, db,
):
    """Saving a previously-dismissed job clears both dismissed_at AND dismissed_reason.

    Regression for the audit finding: save_discovered was setting dismissed_at=None
    but leaving dismissed_reason set, producing a saved job that looked dismissed
    to Phase D scoring.
    """
    from app.models.discovery.discovered_job import DiscoveredJob
    from app.repositories.discovery import discovery_repository

    user = await user_factory()

    job = DiscoveredJob(
        user_id=uuid.UUID(user["id"]),
        source="jsearch",
        source_external_id="save-clears-reason-1",
        title="Senior Backend Engineer",
        company_name="Acme",
    )
    db.add(job)
    await db.flush()

    dismissed = await discovery_repository.dismiss_discovered(
        db, job.id, uuid.UUID(user["id"]), reason="wrong_stack",
    )
    assert dismissed is True
    await db.refresh(job)
    assert job.dismissed_at is not None
    assert job.dismissed_reason == "wrong_stack"

    saved = await discovery_repository.save_discovered(
        db, job.id, uuid.UUID(user["id"]),
    )
    assert saved is True
    await db.refresh(job)
    assert job.saved_at is not None
    assert job.dismissed_at is None
    assert job.dismissed_reason is None


# ===========================================================================
# Promote endpoint
# ===========================================================================


@pytest.mark.asyncio
async def test_promote_job_happy_path(
    client: AsyncClient, user_factory, as_user,
):
    """POST /discover/{id}/promote creates an Application (201) from a
    DiscoveredJob and marks the job as promoted."""
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "python remote"}},
        )
        source_id = created.json()["id"]

        with patch(_SEARCH_PATH, new_callable=AsyncMock, return_value=[_posting()]):
            await a.post(f"/discover/sources/{source_id}/refresh")

        listed = await a.get("/discover")
        job_id = listed.json()["items"][0]["id"]

        resp = await a.post(f"/discover/{job_id}/promote")

    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["role_title"] == "Senior Backend Engineer"
    assert body["source"] == "linkedin"


@pytest.mark.asyncio
async def test_promote_job_idempotent(
    client: AsyncClient, user_factory, as_user,
):
    """A second promote call for the same job returns the same Application
    (same id) without creating duplicates."""
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}},
        )
        source_id = created.json()["id"]

        with patch(_SEARCH_PATH, new_callable=AsyncMock, return_value=[_posting()]):
            await a.post(f"/discover/sources/{source_id}/refresh")

        listed = await a.get("/discover")
        job_id = listed.json()["items"][0]["id"]

        first = await a.post(f"/discover/{job_id}/promote")
        second = await a.post(f"/discover/{job_id}/promote")

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] == second.json()["id"]


@pytest.mark.asyncio
async def test_promote_job_cross_tenant_404(
    client: AsyncClient, user_factory, as_user,
):
    """Attempting to promote another user's job returns 404."""
    owner = await user_factory()
    attacker = await user_factory()

    async with await as_user(owner) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}},
        )
        source_id = created.json()["id"]
        with patch(_SEARCH_PATH, new_callable=AsyncMock, return_value=[_posting()]):
            await a.post(f"/discover/sources/{source_id}/refresh")
        listed = await a.get("/discover")
        job_id = listed.json()["items"][0]["id"]

    async with await as_user(attacker) as a:
        resp = await a.post(f"/discover/{job_id}/promote")
        assert resp.status_code == 404


# ===========================================================================
# Undo-dismiss endpoint (PR 8)
# ===========================================================================

_SCORE_PATH = "app.services.discovery.discovery_score_service.score_user_inbox"


async def _seed_dismissed_job(
    a,
    source_id_resp,
    *,
    reason: str | None = None,
) -> str:
    """Helper: refresh to get one job then dismiss it. Returns job_id.

    Patches score_user_inbox (Anthropic) so no real API call fires — the
    scoring background task is exercised by test_discovery_score_service.py;
    here we only care about the inbox state transitions.
    """
    source_id = source_id_resp.json()["id"]
    with (
        patch(_SEARCH_PATH, new_callable=AsyncMock, return_value=[_posting()]),
        patch(_SCORE_PATH, new_callable=AsyncMock, return_value=None),
    ):
        await a.post(f"/discover/sources/{source_id}/refresh")
    listed = await a.get("/discover")
    job_id = listed.json()["items"][0]["id"]
    dismiss_payload = {"reason": reason} if reason else {}
    resp = await a.post(f"/discover/{job_id}/dismiss", json=dismiss_payload)
    assert resp.status_code == 204
    return job_id


@pytest.mark.asyncio
async def test_undo_dismiss_happy_path(
    client: AsyncClient, user_factory, as_user,
):
    """POST /discover/{id}/undo-dismiss clears dismissed_at and dismissed_reason,
    returning the job to the inbox."""
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}},
        )
        job_id = await _seed_dismissed_job(a, created, reason="wrong_stack")

        # Inbox should be empty after dismiss.
        inbox_before = await a.get("/discover")
        assert inbox_before.json()["total"] == 0

        resp = await a.post(f"/discover/{job_id}/undo-dismiss")
        assert resp.status_code == 204

        # Job must reappear in the inbox after undo.
        inbox_after = await a.get("/discover")
        assert inbox_after.json()["total"] == 1
        item = inbox_after.json()["items"][0]
        assert item["id"] == job_id
        assert item["dismissed_at"] is None
        assert item["dismissed_reason"] is None


@pytest.mark.asyncio
async def test_undo_dismiss_on_never_dismissed_returns_404(
    client: AsyncClient, user_factory, as_user,
):
    """Calling undo-dismiss on an inbox job (never dismissed) returns 404.

    This is the idempotency decision: a job that was never dismissed has
    nothing to undo, so we return 404 rather than silently succeeding.
    """
    user = await user_factory()
    async with await as_user(user) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}},
        )
        source_id = created.json()["id"]
        with (
            patch(_SEARCH_PATH, new_callable=AsyncMock, return_value=[_posting()]),
            patch(_SCORE_PATH, new_callable=AsyncMock, return_value=None),
        ):
            await a.post(f"/discover/sources/{source_id}/refresh")
        listed = await a.get("/discover")
        job_id = listed.json()["items"][0]["id"]

        resp = await a.post(f"/discover/{job_id}/undo-dismiss")
        assert resp.status_code == 404


@pytest.mark.asyncio
async def test_undo_dismiss_cross_tenant_404(
    client: AsyncClient, user_factory, as_user,
):
    """A user cannot undo another user's dismiss — tenant isolation."""
    owner = await user_factory()
    attacker = await user_factory()

    async with await as_user(owner) as a:
        created = await a.post(
            "/discover/sources",
            json={"source": "jsearch", "config": {"query": "x"}},
        )
        job_id = await _seed_dismissed_job(a, created)

    async with await as_user(attacker) as a:
        resp = await a.post(f"/discover/{job_id}/undo-dismiss")
        assert resp.status_code == 404
