"""DB-backed tests for lineup_repo.set_clip_url + set_clip_url_trim.

The clip key must actually COMMIT (not just flush) — the same silent
data-loss class as PATCH #687: ``get_db`` doesn't auto-commit, so a
flush-only write is rolled back on session close and the operator's clip
silently never appears. These tests assert the writes survive a fresh read
and that the PR4 cut-from-original contract holds:

  * ``set_clip_url`` (Replace + ingest) writes BOTH ``clip_url`` AND
    ``clip_url_original`` to the same key, and NULLs the trim offset pair.
  * ``set_clip_url_trim`` (Trim) writes ONLY ``clip_url`` + the offsets;
    ``clip_url_original`` is preserved so the next trim cuts from the same
    source and the operator can widen past the previous trim's bounds.
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
async def test_set_clip_url_commits_both_url_and_original(db: AsyncSession):
    """Replace/ingest writes clip_url AND clip_url_original to the same key,
    and NULLs the trim offset pair so the editor opens with bounds = full
    duration on every fresh upload (PR4)."""
    created = await lineup_repo.create_lineup(
        db, {"title": "clip repo test", "status": "pending_review"}
    )

    returned = await lineup_repo.set_clip_url(
        db, created, "pending/vidX/12-clip.mp4"
    )
    assert returned.clip_url == "pending/vidX/12-clip.mp4"
    assert returned.clip_url_original == "pending/vidX/12-clip.mp4"
    assert returned.clip_trim_start_s is None
    assert returned.clip_trim_end_s is None

    # Capture the PK *before* expire_all(): referencing an expired attribute
    # (created.id) inside the query expression triggers a synchronous lazy
    # reload — sync session.execute outside the async greenlet, i.e.
    # MissingGreenlet. The PK as a plain local has no such hazard.
    lineup_id = created.id

    # Fresh query (expire_on_commit=False keeps the instance, so expire then
    # re-select to prove it's the committed DB state, not the in-session attr).
    db.expire_all()
    refetched = (
        await db.execute(select(Lineup).where(Lineup.id == lineup_id))
    ).scalar_one()
    assert refetched.clip_url == "pending/vidX/12-clip.mp4"
    assert refetched.clip_url_original == "pending/vidX/12-clip.mp4"
    assert refetched.clip_trim_start_s is None
    assert refetched.clip_trim_end_s is None


@pytest.mark.asyncio
async def test_set_clip_url_clears_prior_trim_offsets(db: AsyncSession):
    """A fresh Replace after a Trim must reset the offset pair to NULL.

    Otherwise the editor would open with thumbs pre-filled to the OLD trim
    window over a brand-new source clip — a state that's never correct.
    """
    created = await lineup_repo.create_lineup(
        db, {"title": "replace-after-trim", "status": "pending_review"}
    )
    await lineup_repo.set_clip_url(db, created, "pending/v/orig.mp4")
    await lineup_repo.set_clip_url_trim(
        db, created, "edits/v/trimmed.mp4", 1.0, 3.0
    )
    # Sanity: trim setter persisted the offsets and kept the original.
    assert created.clip_trim_start_s == 1.0
    assert created.clip_url_original == "pending/v/orig.mp4"

    # Now Replace — must NULL the offsets and overwrite the original.
    await lineup_repo.set_clip_url(db, created, "pending/v/replaced.mp4")

    lineup_id = created.id
    db.expire_all()
    refetched = (
        await db.execute(select(Lineup).where(Lineup.id == lineup_id))
    ).scalar_one()
    assert refetched.clip_url == "pending/v/replaced.mp4"
    assert refetched.clip_url_original == "pending/v/replaced.mp4"
    assert refetched.clip_trim_start_s is None
    assert refetched.clip_trim_end_s is None


@pytest.mark.asyncio
async def test_set_clip_url_trim_preserves_original(db: AsyncSession):
    """Trim writes clip_url + offsets; clip_url_original is preserved so the
    next trim cuts from the same source (PR4 widen-past-previous-trim model)."""
    created = await lineup_repo.create_lineup(
        db, {"title": "trim preserves original", "status": "pending_review"}
    )
    await lineup_repo.set_clip_url(db, created, "pending/v/orig.mp4")
    await lineup_repo.set_clip_url_trim(
        db, created, "edits/v/trimmed-1.mp4", 0.5, 2.5
    )

    lineup_id = created.id
    db.expire_all()
    refetched = (
        await db.execute(select(Lineup).where(Lineup.id == lineup_id))
    ).scalar_one()
    assert refetched.clip_url == "edits/v/trimmed-1.mp4"
    assert refetched.clip_url_original == "pending/v/orig.mp4"  # preserved!
    assert refetched.clip_trim_start_s == 0.5
    assert refetched.clip_trim_end_s == 2.5

    # A second trim still cuts from the SAME original — it must not be
    # silently rewritten to point at the previously-trimmed clip.
    await lineup_repo.set_clip_url_trim(
        db, refetched, "edits/v/trimmed-2.mp4", 0.0, 4.0
    )
    db.expire_all()
    refetched2 = (
        await db.execute(select(Lineup).where(Lineup.id == lineup_id))
    ).scalar_one()
    assert refetched2.clip_url == "edits/v/trimmed-2.mp4"
    assert refetched2.clip_url_original == "pending/v/orig.mp4"  # still preserved
    assert refetched2.clip_trim_start_s == 0.0
    assert refetched2.clip_trim_end_s == 4.0


@pytest.mark.asyncio
async def test_set_clip_url_overwrite_is_idempotent(db: AsyncSession):
    """Backfill recomputes the same deterministic key — overwrite must work."""
    created = await lineup_repo.create_lineup(
        db, {"title": "clip overwrite test", "status": "pending_review"}
    )
    await lineup_repo.set_clip_url(db, created, "pending/v/1-clip.mp4")
    await lineup_repo.set_clip_url(db, created, "pending/v/1-clip.mp4")

    # PK captured before expire_all() — see test_set_clip_url_commits.
    lineup_id = created.id
    db.expire_all()
    refetched = (
        await db.execute(select(Lineup).where(Lineup.id == lineup_id))
    ).scalar_one()
    assert refetched.clip_url == "pending/v/1-clip.mp4"


@pytest.mark.asyncio
async def test_list_accepted_lineups_needing_clips_filters(db: AsyncSession):
    """Only accepted + has-source-video + no-clip rows are in the backfill set."""
    game = Game(slug=f"g-{uuid.uuid4().hex[:8]}", name="G",
                side_a_label="A", side_b_label="B")
    db.add(game)
    await db.flush()
    mp = Map(game_id=game.id, slug=f"m-{uuid.uuid4().hex[:8]}", name="M")
    db.add(mp)
    await db.flush()
    zone = MapZone(map_id=mp.id, slug=f"z-{uuid.uuid4().hex[:8]}",
                   name="Z", polygon_points=[])
    db.add(zone)
    util = UtilityType(game_id=game.id, slug=f"u-{uuid.uuid4().hex[:8]}",
                       name="U")
    db.add(util)
    await db.flush()

    def _accepted(**over):
        data = dict(
            game_id=game.id, map_id=mp.id, target_zone_id=zone.id,
            stand_zone_id=zone.id, side="side_a", utility_type_id=util.id,
            title="t", status="accepted",
            youtube_video_id="vidQ", clip_url=None,
        )
        data.update(over)
        return data

    wanted = await lineup_repo.create_lineup(db, _accepted())
    # Excluded: already has a clip.
    await lineup_repo.create_lineup(
        db, _accepted(clip_url="pending/vidQ/3-clip.mp4")
    )
    # Excluded: no source video to re-fetch.
    await lineup_repo.create_lineup(db, _accepted(youtube_video_id=None))
    # Excluded: still pending_review (not accepted).
    await lineup_repo.create_lineup(
        db, {"title": "p", "status": "pending_review",
             "youtube_video_id": "vidQ"}
    )

    rows = await lineup_repo.list_accepted_lineups_needing_clips(db)
    ids = {r.id for r in rows}
    assert wanted.id in ids
    assert all(
        r.status == "accepted" and r.youtube_video_id and r.clip_url is None
        for r in rows
    )
