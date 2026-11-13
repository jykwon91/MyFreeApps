"""Save, Restore and Apply on a dismissed posting whose twin is back in Discover.

``uq_discovered_user_content_hash`` allows one undismissed row per content
hash (the same posting seen through two sources). Dismissing a posting frees
that slot, so a later fetch can bring in its twin. Clearing the dismissal then
used to collide with the twin: an IntegrityError and a 500. Now:

- Save and Restore refuse with a coded 409 (``DISCOVERED_JOB_DUPLICATE``),
  ``DISCOVERED_JOB_ALREADY_APPLIED`` when the twin is already an application,
  or ``DISCOVERED_JOB_NO_LONGER_LISTED`` when the twin has expired or closed.
- Apply promotes the twin — it is the same posting — even an expired one, and
  links the dismissed posting to the same application: it leaves Dismissed,
  Restore 404s on it, and Apply on it again returns that application.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.discovered_job_conflicts import (
    ALREADY_APPLIED_CODE,
    ALREADY_APPLIED_MESSAGE,
    DUPLICATE_CODE,
    DUPLICATE_MESSAGE,
    NO_LONGER_LISTED_CODE,
    NO_LONGER_LISTED_MESSAGE,
)
from app.models.discovery.discovered_job import DiscoveredJob

DUPLICATE_DETAIL = {"code": DUPLICATE_CODE, "message": DUPLICATE_MESSAGE}
ALREADY_APPLIED_DETAIL = {"code": ALREADY_APPLIED_CODE, "message": ALREADY_APPLIED_MESSAGE}
NO_LONGER_LISTED_DETAIL = {"code": NO_LONGER_LISTED_CODE, "message": NO_LONGER_LISTED_MESSAGE}
CONTENT_HASH = "a" * 64


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _make_job(
    db: AsyncSession, user_id: uuid.UUID, *, source: str, dismissed: bool,
) -> DiscoveredJob:
    job = DiscoveredJob(
        user_id=user_id,
        source=source,
        source_external_id=f"{source}-posting",
        title="Platform Engineer",
        company_name="Acme",
        remote_type="remote",
        content_hash=CONTENT_HASH,
        dismissed_at=_now() if dismissed else None,
        dismissed_reason="not_remote" if dismissed else None,
    )
    db.add(job)
    await db.commit()
    return job


async def _twins(
    db: AsyncSession, user_id: uuid.UUID, *, twin_expired: bool = False,
) -> tuple[DiscoveredJob, DiscoveredJob]:
    """A posting dismissed from one source, then fetched again from another (which may have expired since)."""
    dismissed = await _make_job(db, user_id, source="jsearch", dismissed=True)
    twin = await _make_job(db, user_id, source="greenhouse", dismissed=False)
    if twin_expired:
        twin.expired_at = _now()
        await db.commit()
    return dismissed, twin


@pytest.mark.asyncio
@pytest.mark.parametrize("action", ["save", "undo-dismiss"])
async def test_bringing_back_a_dismissed_posting_whose_twin_is_in_discover_is_refused(
    db: AsyncSession, client: AsyncClient, user_factory, as_user, action: str,
):
    user = await user_factory()
    dismissed, twin = await _twins(db, uuid.UUID(user["id"]))

    async with await as_user(user) as a:
        resp = await a.post(f"/discover/{dismissed.id}/{action}")

    assert resp.status_code == 409
    assert resp.json()["detail"] == DUPLICATE_DETAIL
    await db.refresh(dismissed)
    await db.refresh(twin)
    assert dismissed.dismissed_at is not None
    assert dismissed.dismissed_reason == "not_remote"
    assert dismissed.saved_at is None
    assert twin.dismissed_at is None
    assert twin.saved_at is None


@pytest.mark.asyncio
@pytest.mark.parametrize("action", ["save", "undo-dismiss"])
async def test_bringing_back_a_dismissed_posting_whose_twin_was_applied_to_says_so(
    db: AsyncSession, client: AsyncClient, user_factory, as_user, action: str,
):
    user = await user_factory()
    dismissed, twin = await _twins(db, uuid.UUID(user["id"]))

    async with await as_user(user) as a:
        assert (await a.post(f"/discover/{twin.id}/promote")).status_code == 201
        resp = await a.post(f"/discover/{dismissed.id}/{action}")

    assert resp.status_code == 409
    assert resp.json()["detail"] == ALREADY_APPLIED_DETAIL
    await db.refresh(dismissed)
    assert dismissed.dismissed_at is not None


@pytest.mark.asyncio
@pytest.mark.parametrize("twin_expired", [False, True], ids=["listed-twin", "expired-twin"])
async def test_applying_to_a_dismissed_posting_applies_its_twin_and_links_both(
    db: AsyncSession, client: AsyncClient, user_factory, as_user, twin_expired: bool,
):
    """The user asked for the application; the twin is the same posting, listed or not."""
    user = await user_factory()
    dismissed, twin = await _twins(db, uuid.UUID(user["id"]), twin_expired=twin_expired)

    async with await as_user(user) as a:
        first = await a.post(f"/discover/{dismissed.id}/promote")
        again = await a.post(f"/discover/{dismissed.id}/promote")
        totals = {
            state: (await a.get("/discover", params={"state": state})).json()["total"]
            for state in ("inbox", "dismissed")
        }
        restore = await a.post(f"/discover/{dismissed.id}/undo-dismiss")
        applications = (await a.get("/applications")).json()["total"]

    assert first.status_code == 201
    assert again.json()["id"] == first.json()["id"]
    assert applications == 1
    assert totals == {"inbox": 0, "dismissed": 0}
    assert restore.status_code == 404
    await db.refresh(dismissed)
    await db.refresh(twin)
    assert str(twin.promoted_application_id) == first.json()["id"]
    assert str(dismissed.promoted_application_id) == first.json()["id"]
    assert dismissed.promoted_at is not None
    assert dismissed.dismissed_at is not None


@pytest.mark.asyncio
async def test_applying_to_a_dismissed_posting_whose_twin_was_applied_returns_that_application(
    db: AsyncSession, client: AsyncClient, user_factory, as_user,
):
    user = await user_factory()
    dismissed, twin = await _twins(db, uuid.UUID(user["id"]))

    async with await as_user(user) as a:
        twins_application = (await a.post(f"/discover/{twin.id}/promote")).json()["id"]
        resp = await a.post(f"/discover/{dismissed.id}/promote")
        dismissed_total = (await a.get("/discover", params={"state": "dismissed"})).json()["total"]

    assert resp.json()["id"] == twins_application
    assert dismissed_total == 0
    await db.refresh(dismissed)
    assert str(dismissed.promoted_application_id) == twins_application


@pytest.mark.asyncio
@pytest.mark.parametrize("action", ["save", "undo-dismiss"])
async def test_bringing_back_a_dismissed_posting_whose_twin_has_expired_says_it_is_no_longer_listed(
    db: AsyncSession, client: AsyncClient, user_factory, as_user, action: str,
):
    """The expired twin still holds the slot; "already in Discover" would be untrue."""
    user = await user_factory()
    dismissed, _ = await _twins(db, uuid.UUID(user["id"]), twin_expired=True)

    async with await as_user(user) as a:
        resp = await a.post(f"/discover/{dismissed.id}/{action}")

    assert resp.status_code == 409
    assert resp.json()["detail"] == NO_LONGER_LISTED_DETAIL
    await db.refresh(dismissed)
    assert dismissed.dismissed_at is not None


@pytest.mark.asyncio
@pytest.mark.parametrize("action", ["save", "undo-dismiss", "promote"])
async def test_a_dismissed_posting_whose_twin_is_dismissed_too_comes_back(
    db: AsyncSession, client: AsyncClient, user_factory, as_user, action: str,
):
    """Only an undismissed twin holds the slot; two dismissed rows don't collide."""
    user = await user_factory()
    uid = uuid.UUID(user["id"])
    dismissed = await _make_job(db, uid, source="jsearch", dismissed=True)
    twin = await _make_job(db, uid, source="greenhouse", dismissed=True)

    async with await as_user(user) as a:
        resp = await a.post(f"/discover/{dismissed.id}/{action}")

    assert resp.status_code in (201, 204)
    await db.refresh(dismissed)
    await db.refresh(twin)
    assert dismissed.dismissed_at is None
    assert twin.dismissed_at is not None
