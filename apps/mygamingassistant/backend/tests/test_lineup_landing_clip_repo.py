"""DB-backed tests for lineup_repo.set_landing_clip_url (PR5).

The landing-clip key must actually COMMIT (not just flush) — same silent
data-loss class as PATCH #687: ``get_db`` doesn't auto-commit, so a
flush-only write is rolled back on session close and the operator's
landing clip silently never appears. Asserts the write survives a fresh
read. Mirrors :mod:`test_lineup_clip_url_repo` exactly — the two columns
are independent and the landing-clip pipeline must preserve the same
commit-vs-flush discipline.
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game.game import Game
from app.models.game.lineup import Lineup
from app.models.game.map import Map
from app.models.game.map_zone import MapZone
from app.models.game.utility_type import UtilityType
from app.repositories.game import lineup_repo


@pytest.mark.asyncio
async def test_set_landing_clip_url_commits(db: AsyncSession):
    created = await lineup_repo.create_lineup(
        db, {"title": "landing repo test", "status": "pending_review"}
    )

    returned = await lineup_repo.set_landing_clip_url(
        db, created, "pending/vidX/12-landing.mp4"
    )
    assert returned.landing_clip_url == "pending/vidX/12-landing.mp4"

    # Capture the PK *before* expire_all(): referencing an expired attribute
    # (created.id) inside the query expression triggers a synchronous lazy
    # reload — sync session.execute outside the async greenlet, i.e.
    # MissingGreenlet. Pattern lifted verbatim from PR2's
    # test_lineup_clip_url_repo (kept synchronised on purpose).
    lineup_id = created.id

    db.expire_all()
    refetched = (
        await db.execute(select(Lineup).where(Lineup.id == lineup_id))
    ).scalar_one()
    assert refetched.landing_clip_url == "pending/vidX/12-landing.mp4"


@pytest.mark.asyncio
async def test_set_landing_clip_url_overwrite_is_idempotent(db: AsyncSession):
    """Backfill recomputes the same deterministic key — overwrite must work."""
    created = await lineup_repo.create_lineup(
        db, {"title": "landing overwrite test", "status": "pending_review"}
    )
    await lineup_repo.set_landing_clip_url(db, created, "pending/v/1-landing.mp4")
    await lineup_repo.set_landing_clip_url(db, created, "pending/v/1-landing.mp4")

    lineup_id = created.id
    db.expire_all()
    refetched = (
        await db.execute(select(Lineup).where(Lineup.id == lineup_id))
    ).scalar_one()
    assert refetched.landing_clip_url == "pending/v/1-landing.mp4"


@pytest.mark.asyncio
async def test_landing_clip_does_not_overwrite_throw_clip(db: AsyncSession):
    """The two columns are independent — setting one must not touch the other.

    Regression guard for the design intent: a lineup with a PR2 throw clip
    should keep it intact after a PR5 landing-clip backfill, and vice
    versa. If one setter ever drove a global UPDATE that nulled the sibling
    column, the backfills would silently destroy each other's work.
    """
    created = await lineup_repo.create_lineup(
        db, {"title": "both columns test", "status": "pending_review"}
    )
    await lineup_repo.set_clip_url(db, created, "pending/v/1-clip.mp4")
    await lineup_repo.set_landing_clip_url(db, created, "pending/v/1-landing.mp4")

    lineup_id = created.id
    db.expire_all()
    refetched = (
        await db.execute(select(Lineup).where(Lineup.id == lineup_id))
    ).scalar_one()
    assert refetched.clip_url == "pending/v/1-clip.mp4"
    assert refetched.landing_clip_url == "pending/v/1-landing.mp4"


@pytest.mark.asyncio
async def test_list_accepted_lineups_needing_landing_clips_filters(
    db: AsyncSession,
):
    """Only accepted + has-source-video + no-landing-clip rows are in the set.

    Mirrors :func:`test_list_accepted_lineups_needing_clips_filters` but for
    the ``landing_clip_url`` column. Critically asserts that having a PR2
    throw clip does NOT exclude a row from this set — the backfills are
    independent.
    """
    game = Game(
        slug=f"g-{uuid.uuid4().hex[:8]}", name="G",
        side_a_label="A", side_b_label="B",
    )
    db.add(game)
    await db.flush()
    mp = Map(game_id=game.id, slug=f"m-{uuid.uuid4().hex[:8]}", name="M")
    db.add(mp)
    await db.flush()
    zone = MapZone(
        map_id=mp.id, slug=f"z-{uuid.uuid4().hex[:8]}",
        name="Z", polygon_points=[],
    )
    db.add(zone)
    util = UtilityType(
        game_id=game.id, slug=f"u-{uuid.uuid4().hex[:8]}", name="U",
    )
    db.add(util)
    await db.flush()

    def _accepted(**over):
        data = dict(
            game_id=game.id, map_id=mp.id, target_zone_id=zone.id,
            stand_zone_id=zone.id, side="side_a", utility_type_id=util.id,
            title="t", status="accepted",
            youtube_video_id="vidQ",
            clip_url=None,
            landing_clip_url=None,
        )
        data.update(over)
        return data

    # Wanted #1: no clips at all.
    wanted_a = await lineup_repo.create_lineup(db, _accepted())
    # Wanted #2: has PR2 throw clip but no landing — backfill must still pick this up.
    wanted_b = await lineup_repo.create_lineup(
        db, _accepted(clip_url="pending/vidQ/3-clip.mp4")
    )
    # Excluded: already has a landing clip.
    await lineup_repo.create_lineup(
        db, _accepted(landing_clip_url="pending/vidQ/5-landing.mp4")
    )
    # Excluded: no source video to re-fetch.
    await lineup_repo.create_lineup(db, _accepted(youtube_video_id=None))
    # Excluded: still pending_review (not accepted).
    await lineup_repo.create_lineup(
        db, {"title": "p", "status": "pending_review", "youtube_video_id": "vidQ"}
    )

    rows = await lineup_repo.list_accepted_lineups_needing_landing_clips(db)
    ids = {r.id for r in rows}
    assert wanted_a.id in ids
    assert wanted_b.id in ids, (
        "Having a PR2 throw clip must NOT exclude a row from the PR5 backfill — "
        "the two NULL columns are independent."
    )
    assert all(
        r.status == "accepted"
        and r.youtube_video_id
        and r.landing_clip_url is None
        for r in rows
    )
