"""Unit tests for the discovery_fetch_reaper.

Scenarios covered:

1. Stale running row (started_at > 30 min ago) → reaped to error.
2. Fresh running row (started_at < 30 min ago) → left untouched.
3. Non-running rows (pending / success / error) → left untouched regardless
   of age.
4. Reaper returns the correct reaped count.
5. Idempotency — running the reaper twice leaves rows in their post-first-run
   state (an already-reaped error row is not double-touched).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.discovery.discovery_fetch import DiscoveryFetch
from app.models.discovery.discovery_source import DiscoverySource
from app.services.discovery.discovery_fetch_reaper import (
    REAP_AFTER_MINUTES,
    reap_stale_running_fetches,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uid(user: dict) -> uuid.UUID:
    return uuid.UUID(user["id"])


async def _make_source(db: AsyncSession, user_id: uuid.UUID) -> DiscoverySource:
    src = DiscoverySource(user_id=user_id, source="jsearch", config={})
    db.add(src)
    await db.flush()
    return src


def _fetch(
    user_id: uuid.UUID,
    source_id: uuid.UUID,
    started_at: datetime,
    status: str = "running",
) -> DiscoveryFetch:
    return DiscoveryFetch(
        user_id=user_id,
        discovery_source_id=source_id,
        source="jsearch",
        started_at=started_at,
        status=status,
    )


@pytest.mark.asyncio
async def test_stale_running_row_is_reaped(db: AsyncSession, user_factory):
    user = await user_factory()
    uid = _uid(user)
    src = await _make_source(db, uid)

    stale_started = _now() - timedelta(minutes=REAP_AFTER_MINUTES + 1)
    row = _fetch(uid, src.id, started_at=stale_started)
    db.add(row)
    await db.flush()
    row_id = row.id

    count = await reap_stale_running_fetches(db)

    result = await db.execute(
        select(DiscoveryFetch).where(DiscoveryFetch.id == row_id)
    )
    updated = result.scalar_one()

    assert count == 1
    assert updated.status == "error"
    assert updated.error_message == "reaped: server restart or stuck >30min"


@pytest.mark.asyncio
async def test_fresh_running_row_is_untouched(db: AsyncSession, user_factory):
    user = await user_factory()
    uid = _uid(user)
    src = await _make_source(db, uid)

    fresh_started = _now() - timedelta(minutes=REAP_AFTER_MINUTES - 1)
    row = _fetch(uid, src.id, started_at=fresh_started)
    db.add(row)
    await db.flush()
    row_id = row.id

    count = await reap_stale_running_fetches(db)

    result = await db.execute(
        select(DiscoveryFetch).where(DiscoveryFetch.id == row_id)
    )
    untouched = result.scalar_one()

    assert count == 0
    assert untouched.status == "running"


@pytest.mark.asyncio
async def test_non_running_rows_are_untouched(db: AsyncSession, user_factory):
    """Rows already in success / error are never touched, regardless of age."""
    user = await user_factory()
    uid = _uid(user)
    src = await _make_source(db, uid)

    very_old = _now() - timedelta(hours=24)
    for terminal_status in ("success", "error", "partial"):
        db.add(_fetch(uid, src.id, started_at=very_old, status=terminal_status))
    await db.flush()

    count = await reap_stale_running_fetches(db)
    assert count == 0


@pytest.mark.asyncio
async def test_returns_correct_count_for_multiple_stale_rows(
    db: AsyncSession, user_factory
):
    user = await user_factory()
    uid = _uid(user)
    src = await _make_source(db, uid)

    very_old = _now() - timedelta(hours=2)
    for _ in range(3):
        db.add(_fetch(uid, src.id, started_at=very_old))
    # One fresh running row that should NOT be reaped.
    fresh_started = _now() - timedelta(minutes=5)
    db.add(_fetch(uid, src.id, started_at=fresh_started))
    await db.flush()

    count = await reap_stale_running_fetches(db)
    assert count == 3


@pytest.mark.asyncio
async def test_reaper_is_idempotent(db: AsyncSession, user_factory):
    """Running the reaper twice on the same data produces no additional changes."""
    user = await user_factory()
    uid = _uid(user)
    src = await _make_source(db, uid)

    stale_started = _now() - timedelta(hours=1)
    row = _fetch(uid, src.id, started_at=stale_started)
    db.add(row)
    await db.flush()
    row_id = row.id

    first_count = await reap_stale_running_fetches(db)
    second_count = await reap_stale_running_fetches(db)

    result = await db.execute(
        select(DiscoveryFetch).where(DiscoveryFetch.id == row_id)
    )
    final_row = result.scalar_one()

    assert first_count == 1
    assert second_count == 0
    assert final_row.status == "error"
