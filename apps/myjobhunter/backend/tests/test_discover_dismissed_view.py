"""Tests for the Discover page's Dismissed view (``GET /discover?state=dismissed``).

Covers:

- The repository lists only the caller's dismissed, active, not-promoted rows,
  newest-dismissed first, and ``count_discovered`` describes the same rows.
- Offset paging is stable when several rows share a ``dismissed_at``.
- The service returns the full total and no inbox coverage for the view.
- The API: dismiss moves a posting from the inbox (or Saved) to Dismissed with
  its reason; Restore (undo-dismiss) moves it back to the inbox; another user's
  dismissed postings never appear; the source filter applies; an unknown state
  is refused.
- Restore matches the Dismissed view's filter: an expired, closed or promoted
  dismissed posting isn't restorable (404) and stays dismissed, so Restore
  never moves a posting into no view.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discovery.discovered_job import DiscoveredJob
from app.models.discovery.discovery_fetch import DiscoveryFetch
from app.models.discovery.discovery_source import DiscoverySource
from app.repositories.discovery import discovery_inbox_repository, discovery_repository
from app.services.discovery import discovery_inbox_service


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uid(user: dict) -> uuid.UUID:
    return uuid.UUID(user["id"])


async def _make_fetch(db: AsyncSession, user_id: uuid.UUID, name: str) -> DiscoveryFetch:
    src = DiscoverySource(user_id=user_id, source="jsearch", name=name, config={})
    db.add(src)
    await db.flush()
    fetch = DiscoveryFetch(
        user_id=user_id,
        discovery_source_id=src.id,
        source="jsearch",
        started_at=_now(),
        status="success",
    )
    db.add(fetch)
    await db.flush()
    return fetch


async def _make_job(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    external_id: str,
    dismissed_at: datetime | None = None,
    dismissed_reason: str | None = None,
    saved_at: datetime | None = None,
    expired_at: datetime | None = None,
    source_expires_at: datetime | None = None,
    fetch: DiscoveryFetch | None = None,
) -> DiscoveredJob:
    job = DiscoveredJob(
        user_id=user_id,
        source="jsearch",
        source_external_id=external_id,
        fetch_id=fetch.id if fetch is not None else None,
        title=f"Engineer {external_id}",
        company_name="Acme",
        remote_type="remote",
        dismissed_at=dismissed_at,
        dismissed_reason=dismissed_reason,
        saved_at=saved_at,
        expired_at=expired_at,
        source_expires_at=source_expires_at,
    )
    db.add(job)
    await db.flush()
    return job


# ---------------------------------------------------------------------------
# Repository
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_dismissed_view_lists_only_dismissed_active_rows_newest_first(
    db: AsyncSession, user_factory,
):
    uid = _uid(await user_factory())
    now = _now()
    older = await _make_job(db, uid, external_id="older", dismissed_at=now - timedelta(days=2))
    newer = await _make_job(db, uid, external_id="newer", dismissed_at=now - timedelta(hours=1), dismissed_reason="wrong_stack")
    await _make_job(db, uid, external_id="inbox")
    await _make_job(db, uid, external_id="saved", saved_at=now)
    await _make_job(db, uid, external_id="expired", dismissed_at=now, expired_at=now)
    await _make_job(db, uid, external_id="closed", dismissed_at=now, source_expires_at=now - timedelta(hours=1))

    rows = await discovery_repository.list_discovered(db, uid, state="dismissed")

    assert [r.id for r in rows] == [newer.id, older.id]
    assert rows[0].dismissed_reason == "wrong_stack"
    assert await discovery_inbox_repository.count_discovered(db, uid, state="dismissed") == 2


@pytest.mark.asyncio
async def test_dismissed_view_never_shows_another_users_rows(
    db: AsyncSession, user_factory,
):
    owner = _uid(await user_factory())
    other = _uid(await user_factory())
    mine = await _make_job(db, owner, external_id="mine", dismissed_at=_now())
    await _make_job(db, other, external_id="theirs", dismissed_at=_now())

    rows = await discovery_repository.list_discovered(db, owner, state="dismissed")

    assert [r.id for r in rows] == [mine.id]
    assert await discovery_inbox_repository.count_discovered(db, owner, state="dismissed") == 1


@pytest.mark.asyncio
async def test_dismissed_paging_is_stable_when_dismissed_at_ties(
    db: AsyncSession, user_factory,
):
    """Rows dismissed at the same instant page by id: every row shows exactly once."""
    uid = _uid(await user_factory())
    same_moment = _now()
    created = [
        await _make_job(db, uid, external_id=f"tie-{i}", dismissed_at=same_moment)
        for i in range(7)
    ]

    seen: list[uuid.UUID] = []
    for offset in range(0, 7, 3):
        page = await discovery_repository.list_discovered(db, uid, state="dismissed", limit=3, offset=offset)
        seen.extend(r.id for r in page)

    assert len(seen) == 7
    assert set(seen) == {job.id for job in created}
    assert seen == sorted(seen, reverse=True)


@pytest.mark.asyncio
async def test_dismissed_page_reports_total_without_inbox_coverage(
    db: AsyncSession, user_factory,
):
    uid = _uid(await user_factory())
    for i in range(3):
        await _make_job(db, uid, external_id=f"d-{i}", dismissed_at=_now())
    await _make_job(db, uid, external_id="inbox")

    page = await discovery_inbox_service.list_discovered_page(
        db, uid, state="dismissed", limit=2, offset=0, source_id=None,
    )

    assert len(page.rows) == 2
    assert page.total == 3
    assert page.scored_count is None
    assert page.total_count is None


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_dismiss_moves_posting_to_dismissed_and_restore_moves_it_back(
    db: AsyncSession, client: AsyncClient, user_factory, as_user,
):
    user = await user_factory()
    job = await _make_job(db, _uid(user), external_id="round-trip")

    async with await as_user(user) as a:
        assert (await a.post(f"/discover/{job.id}/dismiss", json={"reason": "not_remote"})).status_code == 204

        dismissed = (await a.get("/discover", params={"state": "dismissed"})).json()
        assert dismissed["state"] == "dismissed"
        assert dismissed["total"] == 1
        assert dismissed["has_more"] is False
        assert dismissed["scored_count"] is None
        assert dismissed["items"][0]["id"] == str(job.id)
        assert dismissed["items"][0]["dismissed_reason"] == "not_remote"
        assert dismissed["items"][0]["dismissed_at"] is not None
        assert (await a.get("/discover")).json()["total"] == 0

        assert (await a.post(f"/discover/{job.id}/undo-dismiss")).status_code == 204

        assert (await a.get("/discover", params={"state": "dismissed"})).json()["total"] == 0
        inbox = (await a.get("/discover")).json()
        assert [item["id"] for item in inbox["items"]] == [str(job.id)]
        assert inbox["items"][0]["dismissed_reason"] is None


@pytest.mark.asyncio
async def test_dismissing_a_saved_posting_moves_it_from_saved_to_dismissed(
    db: AsyncSession, client: AsyncClient, user_factory, as_user,
):
    user = await user_factory()
    job = await _make_job(db, _uid(user), external_id="was-saved", saved_at=_now())

    async with await as_user(user) as a:
        assert (await a.post(f"/discover/{job.id}/dismiss")).status_code == 204

        assert (await a.get("/discover", params={"state": "saved"})).json()["total"] == 0
        dismissed = (await a.get("/discover", params={"state": "dismissed"})).json()
        assert [item["id"] for item in dismissed["items"]] == [str(job.id)]
        assert dismissed["items"][0]["dismissed_reason"] is None


@pytest.mark.asyncio
async def test_dismissed_view_api_is_tenant_isolated(
    db: AsyncSession, client: AsyncClient, user_factory, as_user,
):
    owner = await user_factory()
    other = await user_factory()
    await _make_job(db, _uid(owner), external_id="owners", dismissed_at=_now())

    async with await as_user(other) as a:
        body = (await a.get("/discover", params={"state": "dismissed"})).json()

    assert body["total"] == 0
    assert body["items"] == []


@pytest.mark.asyncio
async def test_dismissed_view_hides_postings_already_turned_into_applications(
    db: AsyncSession, client: AsyncClient, user_factory, as_user,
):
    """Restore couldn't bring a promoted posting back to the inbox, so it isn't listed."""
    user = await user_factory()
    job = await _make_job(db, _uid(user), external_id="applied")

    async with await as_user(user) as a:
        assert (await a.post(f"/discover/{job.id}/promote")).status_code == 201
        assert (await a.post(f"/discover/{job.id}/dismiss")).status_code == 204
        body = (await a.get("/discover", params={"state": "dismissed"})).json()

    assert body["total"] == 0


@pytest.mark.asyncio
async def test_dismissed_view_honours_the_source_filter(
    db: AsyncSession, client: AsyncClient, user_factory, as_user,
):
    user = await user_factory()
    uid = _uid(user)
    fetch_a = await _make_fetch(db, uid, "A")
    fetch_b = await _make_fetch(db, uid, "B")
    from_a = await _make_job(db, uid, external_id="a", dismissed_at=_now(), fetch=fetch_a)
    await _make_job(db, uid, external_id="b", dismissed_at=_now(), fetch=fetch_b)

    async with await as_user(user) as a:
        body = (
            await a.get("/discover", params={"state": "dismissed", "source_id": str(fetch_a.discovery_source_id)})
        ).json()

    assert body["total"] == 1
    assert [item["id"] for item in body["items"]] == [str(from_a.id)]


@pytest.mark.asyncio
async def test_unknown_state_is_refused(
    client: AsyncClient, user_factory, as_user,
):
    user = await user_factory()
    async with await as_user(user) as a:
        resp = await a.get("/discover", params={"state": "archived"})

    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Restore only what the Dismissed view lists
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize("ended", ["expired", "closed"])
async def test_restore_refuses_an_expired_or_closed_posting(
    db: AsyncSession, client: AsyncClient, user_factory, as_user, ended: str,
):
    """Restored, an ended posting would show in no view, so undo-dismiss 404s and leaves it dismissed."""
    user = await user_factory()
    now = _now()
    job = await _make_job(
        db, _uid(user), external_id=ended, dismissed_at=now, dismissed_reason="other",
        expired_at=now if ended == "expired" else None,
        source_expires_at=now - timedelta(hours=1) if ended == "closed" else None,
    )

    async with await as_user(user) as a:
        resp = await a.post(f"/discover/{job.id}/undo-dismiss")

    assert resp.status_code == 404
    await db.refresh(job)
    assert job.dismissed_at is not None
    assert job.dismissed_reason == "other"


@pytest.mark.asyncio
async def test_restore_refuses_a_posting_already_turned_into_an_application(
    db: AsyncSession, client: AsyncClient, user_factory, as_user,
):
    user = await user_factory()
    job = await _make_job(db, _uid(user), external_id="promoted")

    async with await as_user(user) as a:
        assert (await a.post(f"/discover/{job.id}/promote")).status_code == 201
        assert (await a.post(f"/discover/{job.id}/dismiss")).status_code == 204
        resp = await a.post(f"/discover/{job.id}/undo-dismiss")

    assert resp.status_code == 404
    await db.refresh(job)
    assert job.dismissed_at is not None
    assert job.promoted_application_id is not None
