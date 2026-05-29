"""Tests for the discovery active-only inbox (dead-listing exclusion).

Covers the four guarantees of the active-only fix:

a. ``mark_missing_as_expired`` sets ``expired_at`` on a previously-seen
   posting that disappears from a successful, non-empty fetch.
b. The guard: ``mark_missing_as_expired`` is a no-op on an empty seen-set
   (the service skips the call entirely on empty/failed cycles; this test
   asserts the repository's own defensive backstop too).
c. ``list_discovered`` (inbox + saved) excludes both ``expired_at``-set rows
   and rows whose ``source_expires_at`` is in the past, while keeping active
   rows; ``state="all"`` still returns everything.
d. ``fetch_source`` does NOT mass-expire the inbox when a cycle returns
   empty (end-to-end guard via a stubbed adapter).

DB-backed; uses the rolled-back ``db`` session + ``user_factory`` fixtures.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discovery.discovered_job import DiscoveredJob
from app.models.discovery.discovery_source import DiscoverySource
from app.repositories.discovery import discovery_repository
from app.services.discovery import discovery_fetch_service


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uid(user: dict) -> uuid.UUID:
    return uuid.UUID(user["id"])


async def _make_source(
    db: AsyncSession, user_id: uuid.UUID, *, source: str = "jsearch",
) -> DiscoverySource:
    src = DiscoverySource(user_id=user_id, source=source, config={})
    db.add(src)
    await db.flush()
    return src


async def _make_job(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    source: str = "jsearch",
    external_id: str,
    expired_at: datetime | None = None,
    source_expires_at: datetime | None = None,
    dismissed_at: datetime | None = None,
    saved_at: datetime | None = None,
) -> DiscoveredJob:
    job = DiscoveredJob(
        user_id=user_id,
        source=source,
        source_external_id=external_id,
        title="Senior Backend Engineer",
        company_name="Acme",
        remote_type="remote",
        expired_at=expired_at,
        source_expires_at=source_expires_at,
        dismissed_at=dismissed_at,
        saved_at=saved_at,
    )
    db.add(job)
    await db.flush()
    return job


# ---------------------------------------------------------------------------
# (a) mark_missing_as_expired sets expired_at on vanished postings
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_mark_missing_expires_vanished_posting(
    db: AsyncSession, user_factory,
):
    user = await user_factory()
    uid = _uid(user)
    await _make_source(db, uid)

    kept = await _make_job(db, uid, external_id="still-here")
    gone = await _make_job(db, uid, external_id="vanished")

    # This fetch returned only "still-here" → "vanished" should expire.
    count = await discovery_repository.mark_missing_as_expired(
        db, user_id=uid, source="jsearch", seen_external_ids=["still-here"],
    )

    await db.refresh(kept)
    await db.refresh(gone)

    assert count == 1
    assert gone.expired_at is not None
    assert kept.expired_at is None


@pytest.mark.asyncio
async def test_mark_missing_is_source_scoped(db: AsyncSession, user_factory):
    """A posting on a different source must not be expired by another
    source's fetch (greenhouse fetch can't expire a jsearch row)."""
    user = await user_factory()
    uid = _uid(user)

    jsearch_job = await _make_job(
        db, uid, source="jsearch", external_id="js-1",
    )
    gh_job = await _make_job(
        db, uid, source="greenhouse", external_id="gh-1",
    )

    # A greenhouse fetch that returned nothing matching gh-1's id.
    count = await discovery_repository.mark_missing_as_expired(
        db, user_id=uid, source="greenhouse", seen_external_ids=["gh-2"],
    )

    await db.refresh(jsearch_job)
    await db.refresh(gh_job)

    assert count == 1
    assert gh_job.expired_at is not None
    # The jsearch row is untouched — different source.
    assert jsearch_job.expired_at is None


@pytest.mark.asyncio
async def test_mark_missing_does_not_rechurn_already_expired(
    db: AsyncSession, user_factory,
):
    """An already-expired row keeps its original timestamp (active-only
    filter excludes ``expired_at IS NULL`` candidates)."""
    user = await user_factory()
    uid = _uid(user)
    original = _now() - timedelta(days=3)
    already = await _make_job(
        db, uid, external_id="old", expired_at=original,
    )

    count = await discovery_repository.mark_missing_as_expired(
        db, user_id=uid, source="jsearch", seen_external_ids=["something-else"],
    )

    await db.refresh(already)
    assert count == 0
    assert already.expired_at == original


# ---------------------------------------------------------------------------
# (b) the guard — empty seen-set is a no-op
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_mark_missing_empty_set_is_noop(db: AsyncSession, user_factory):
    """Empty seen-set must NOT mass-expire the inbox — repository backstop."""
    user = await user_factory()
    uid = _uid(user)
    a = await _make_job(db, uid, external_id="a")
    b = await _make_job(db, uid, external_id="b")

    count = await discovery_repository.mark_missing_as_expired(
        db, user_id=uid, source="jsearch", seen_external_ids=[],
    )

    await db.refresh(a)
    await db.refresh(b)
    assert count == 0
    assert a.expired_at is None
    assert b.expired_at is None


# ---------------------------------------------------------------------------
# (c) list_discovered excludes expired + past-source_expires_at rows
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_inbox_excludes_expired_and_past_expiry(
    db: AsyncSession, user_factory,
):
    user = await user_factory()
    uid = _uid(user)

    active = await _make_job(db, uid, external_id="active")
    expired = await _make_job(
        db, uid, external_id="expired", expired_at=_now(),
    )
    closed = await _make_job(
        db,
        uid,
        external_id="closed",
        source_expires_at=_now() - timedelta(hours=1),
    )
    future_close = await _make_job(
        db,
        uid,
        external_id="future",
        source_expires_at=_now() + timedelta(days=7),
    )

    rows = await discovery_repository.list_discovered(db, uid, state="inbox")
    ids = {r.source_external_id for r in rows}

    assert "active" in ids
    assert "future" in ids  # future expiry is still active
    assert "expired" not in ids
    assert "closed" not in ids
    # silence unused-var linters; the rows are asserted via ids
    assert {active.id, future_close.id} == {
        r.id for r in rows if r.source_external_id in {"active", "future"}
    }
    assert expired.id and closed.id


@pytest.mark.asyncio
async def test_saved_view_excludes_expired(db: AsyncSession, user_factory):
    user = await user_factory()
    uid = _uid(user)
    now = _now()

    saved_active = await _make_job(
        db, uid, external_id="s-active", saved_at=now,
    )
    saved_expired = await _make_job(
        db, uid, external_id="s-expired", saved_at=now, expired_at=now,
    )
    saved_closed = await _make_job(
        db,
        uid,
        external_id="s-closed",
        saved_at=now,
        source_expires_at=now - timedelta(minutes=5),
    )

    rows = await discovery_repository.list_discovered(db, uid, state="saved")
    ids = {r.source_external_id for r in rows}

    assert "s-active" in ids
    assert "s-expired" not in ids
    assert "s-closed" not in ids
    assert saved_active.id and saved_expired.id and saved_closed.id


@pytest.mark.asyncio
async def test_all_state_includes_expired(db: AsyncSession, user_factory):
    """state="all" deliberately returns expired/closed rows too."""
    user = await user_factory()
    uid = _uid(user)
    await _make_job(db, uid, external_id="active")
    await _make_job(db, uid, external_id="expired", expired_at=_now())
    await _make_job(
        db,
        uid,
        external_id="closed",
        source_expires_at=_now() - timedelta(hours=1),
    )

    rows = await discovery_repository.list_discovered(db, uid, state="all")
    ids = {r.source_external_id for r in rows}

    assert {"active", "expired", "closed"} <= ids


# ---------------------------------------------------------------------------
# (d) fetch_source end-to-end guard — empty cycle does not mass-expire
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fetch_empty_cycle_does_not_expire_inbox(
    db: AsyncSession, user_factory, monkeypatch: pytest.MonkeyPatch,
):
    """A successful but EMPTY fetch must leave existing active rows alone."""
    user = await user_factory()
    uid = _uid(user)
    src = await _make_source(db, uid, source="jsearch")
    existing = await _make_job(db, uid, external_id="pre-existing")

    async def _empty_adapter(_config: dict) -> list[dict]:
        return []

    monkeypatch.setitem(
        discovery_fetch_service._ADAPTERS, "jsearch", _empty_adapter,
    )

    result = await discovery_fetch_service.fetch_source(db, uid, src.id)

    await db.refresh(existing)
    assert result["fetched_count"] == 0
    # The guard held — the pre-existing active row was NOT expired.
    assert existing.expired_at is None


@pytest.mark.asyncio
async def test_fetch_nonempty_cycle_expires_vanished(
    db: AsyncSession, user_factory, monkeypatch: pytest.MonkeyPatch,
):
    """A successful non-empty fetch expires a previously-seen posting that
    is absent from the returned set, end-to-end through fetch_source."""
    user = await user_factory()
    uid = _uid(user)
    src = await _make_source(db, uid, source="jsearch")
    vanished = await _make_job(db, uid, external_id="will-vanish")

    async def _adapter(_config: dict) -> list[dict]:
        return [
            {
                "source": "jsearch",
                "source_external_id": "fresh-1",
                "source_publisher": "LinkedIn",
                "source_url": "https://example.com/1",
                "title": "New Role",
                "company_name": "NewCo",
                "location": "Remote",
                "remote_type": "remote",
                "description": "desc",
                "posted_at": None,
                "source_expires_at": None,
                "salary_min": None,
                "salary_max": None,
                "salary_currency": "USD",
                "salary_period": None,
                "raw_payload": {"job_id": "fresh-1"},
            },
        ]

    monkeypatch.setitem(
        discovery_fetch_service._ADAPTERS, "jsearch", _adapter,
    )

    result = await discovery_fetch_service.fetch_source(db, uid, src.id)

    await db.refresh(vanished)
    assert result["fetched_count"] == 1
    # The previously-seen posting absent from this fetch is now expired.
    assert vanished.expired_at is not None
