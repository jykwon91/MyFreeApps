"""A posting turned into an application has left Discover's triage.

Promote (Apply) already took a posting out of the inbox and cleared its Saved
flag. These tests pin the rest of that rule, so a promoted posting can never be
stranded in no view:

- Dismiss and Save refuse a promoted posting with a 409 and leave it untouched
  (a stale card on another device, or a tap while Apply was in flight, used to
  get a 204 and either strand it, dismissed, or put it back in Saved).
- The Saved view, like the inbox and Dismissed, never lists a promoted posting.
- Promote clears a dismissal (as Save does), so Apply on a stale card for a
  posting dismissed elsewhere doesn't leave it promoted AND dismissed.
- A posting already left promoted and dismissed by the old behaviour keeps its
  data, and its application is still reachable.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.discovered_job_conflicts import ALREADY_APPLIED_CODE, ALREADY_APPLIED_MESSAGE
from app.models.discovery.discovered_job import DiscoveredJob
from app.repositories.discovery import discovery_inbox_repository, discovery_repository

ALREADY_APPLIED_DETAIL = {"code": ALREADY_APPLIED_CODE, "message": ALREADY_APPLIED_MESSAGE}


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _make_job(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    external_id: str,
    saved_at: datetime | None = None,
    dismissed_at: datetime | None = None,
    dismissed_reason: str | None = None,
) -> DiscoveredJob:
    job = DiscoveredJob(
        user_id=user_id,
        source="jsearch",
        source_external_id=external_id,
        title=f"Engineer {external_id}",
        company_name="Acme",
        remote_type="remote",
        saved_at=saved_at,
        dismissed_at=dismissed_at,
        dismissed_reason=dismissed_reason,
    )
    db.add(job)
    await db.commit()
    return job


async def _view_totals(a: AsyncClient) -> dict[str, int]:
    return {
        state: (await a.get("/discover", params={"state": state})).json()["total"]
        for state in ("inbox", "saved", "dismissed")
    }


@pytest.mark.asyncio
async def test_dismissing_a_promoted_posting_is_refused_and_changes_nothing(
    db: AsyncSession, client: AsyncClient, user_factory, as_user,
):
    user = await user_factory()
    job = await _make_job(db, uuid.UUID(user["id"]), external_id="applied")

    async with await as_user(user) as a:
        assert (await a.post(f"/discover/{job.id}/promote")).status_code == 201
        resp = await a.post(f"/discover/{job.id}/dismiss", json={"reason": "wrong_stack"})

    assert resp.status_code == 409
    assert resp.json()["detail"] == ALREADY_APPLIED_DETAIL
    await db.refresh(job)
    assert job.dismissed_at is None
    assert job.dismissed_reason is None
    assert job.promoted_application_id is not None


@pytest.mark.asyncio
async def test_saving_a_promoted_posting_is_refused_and_it_stays_out_of_saved(
    db: AsyncSession, client: AsyncClient, user_factory, as_user,
):
    """Save after Apply (a stale card) used to put the posting back in Saved, where Dismiss stranded it."""
    user = await user_factory()
    job = await _make_job(db, uuid.UUID(user["id"]), external_id="applied", saved_at=_now())

    async with await as_user(user) as a:
        assert (await a.post(f"/discover/{job.id}/promote")).status_code == 201
        resp = await a.post(f"/discover/{job.id}/save")
        totals = await _view_totals(a)

    assert resp.status_code == 409
    assert resp.json()["detail"] == ALREADY_APPLIED_DETAIL
    assert totals == {"inbox": 0, "saved": 0, "dismissed": 0}
    await db.refresh(job)
    assert job.saved_at is None


@pytest.mark.asyncio
async def test_dismiss_and_save_still_404_for_another_users_promoted_posting(
    db: AsyncSession, client: AsyncClient, user_factory, as_user,
):
    """The 409 never tells another user that a posting exists."""
    owner = await user_factory()
    other = await user_factory()
    job = await _make_job(db, uuid.UUID(owner["id"]), external_id="owners")

    async with await as_user(owner) as a:
        assert (await a.post(f"/discover/{job.id}/promote")).status_code == 201
    async with await as_user(other) as a:
        assert (await a.post(f"/discover/{job.id}/dismiss")).status_code == 404
        assert (await a.post(f"/discover/{job.id}/save")).status_code == 404


@pytest.mark.asyncio
async def test_saved_view_never_lists_a_promoted_posting(
    db: AsyncSession, client: AsyncClient, user_factory, as_user,
):
    """A promoted row still flagged saved (left by the old Save-after-Apply) isn't in Saved."""
    user = await user_factory()
    uid = uuid.UUID(user["id"])
    kept = await _make_job(db, uid, external_id="kept", saved_at=_now())
    applied = await _make_job(db, uid, external_id="applied")

    async with await as_user(user) as a:
        assert (await a.post(f"/discover/{applied.id}/promote")).status_code == 201
    # The old behaviour: Save accepted the promoted posting.
    applied.saved_at = _now()
    await db.commit()

    rows = [job for job, _source_id in await discovery_repository.list_discovered(db, uid, state="saved")]

    assert [r.id for r in rows] == [kept.id]
    assert await discovery_inbox_repository.count_discovered(db, uid, state="saved") == 1


@pytest.mark.asyncio
async def test_promoting_a_posting_dismissed_elsewhere_clears_the_dismissal(
    db: AsyncSession, client: AsyncClient, user_factory, as_user,
):
    """Apply on a stale card after a dismiss on another device: the newer choice wins, as Save's does."""
    user = await user_factory()
    job = await _make_job(
        db, uuid.UUID(user["id"]), external_id="dismissed-elsewhere",
        dismissed_at=_now(), dismissed_reason="not_remote",
    )

    async with await as_user(user) as a:
        assert (await a.post(f"/discover/{job.id}/promote")).status_code == 201

    await db.refresh(job)
    assert job.promoted_application_id is not None
    assert job.dismissed_at is None
    assert job.dismissed_reason is None


@pytest.mark.asyncio
async def test_a_posting_left_promoted_and_dismissed_keeps_its_data_and_its_application(
    db: AsyncSession, client: AsyncClient, user_factory, as_user,
):
    """Rows the old Dismiss left promoted + dismissed aren't rewritten; their application stays reachable."""
    user = await user_factory()
    job = await _make_job(db, uuid.UUID(user["id"]), external_id="stranded")

    async with await as_user(user) as a:
        application_id = (await a.post(f"/discover/{job.id}/promote")).json()["id"]
        # What the old Dismiss did after Apply.
        job.dismissed_at = _now()
        job.dismissed_reason = "wrong_stack"
        await db.commit()

        application = await a.get(f"/applications/{application_id}")
        assert (await a.post(f"/discover/{job.id}/dismiss")).status_code == 409
        assert (await a.post(f"/discover/{job.id}/undo-dismiss")).status_code == 404

    assert application.status_code == 200
    await db.refresh(job)
    assert job.dismissed_reason == "wrong_stack"
    assert str(job.promoted_application_id) == application_id
