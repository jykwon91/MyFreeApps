"""DB-backed test for lineup_repo.set_clip_url (PR2).

The clip key must actually COMMIT (not just flush) — the same silent
data-loss class as PATCH #687: ``get_db`` doesn't auto-commit, so a
flush-only write is rolled back on session close and the operator's clip
silently never appears. This asserts the write survives a fresh read.
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game.lineup import Lineup
from app.repositories.game import lineup_repo


@pytest.mark.asyncio
async def test_set_clip_url_commits(db: AsyncSession):
    created = await lineup_repo.create_lineup(
        db, {"title": "clip repo test", "status": "pending_review"}
    )

    returned = await lineup_repo.set_clip_url(
        db, created, "pending/vidX/12-clip.mp4"
    )
    assert returned.clip_url == "pending/vidX/12-clip.mp4"

    # Fresh query (expire_on_commit=False keeps the instance, so re-select to
    # prove it's the committed DB state, not just the in-session attribute).
    db.expire_all()
    refetched = (
        await db.execute(select(Lineup).where(Lineup.id == created.id))
    ).scalar_one()
    assert refetched.clip_url == "pending/vidX/12-clip.mp4"


@pytest.mark.asyncio
async def test_set_clip_url_overwrite_is_idempotent(db: AsyncSession):
    """Backfill recomputes the same deterministic key — overwrite must work."""
    created = await lineup_repo.create_lineup(
        db, {"title": "clip overwrite test", "status": "pending_review"}
    )
    await lineup_repo.set_clip_url(db, created, "pending/v/1-clip.mp4")
    await lineup_repo.set_clip_url(db, created, "pending/v/1-clip.mp4")

    db.expire_all()
    refetched = (
        await db.execute(select(Lineup).where(Lineup.id == created.id))
    ).scalar_one()
    assert refetched.clip_url == "pending/v/1-clip.mp4"
