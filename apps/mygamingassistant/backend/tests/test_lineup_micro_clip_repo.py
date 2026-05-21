"""DB-backed tests for lineup_repo.set_stand_clip_url / set_aim_clip_url (PR6).

The two micro-clip keys must actually COMMIT (not just flush) — same silent
data-loss class as PATCH #687 and the PR5 landing-clip discipline: ``get_db``
doesn't auto-commit, so a flush-only write is rolled back on session close
and the operator's micro-clip silently never appears. Asserts each write
survives a fresh read AND that the two columns are independent (a stand-
clip failure must NEVER null the aim clip and vice versa).

Mirrors :mod:`test_lineup_landing_clip_repo` exactly — the three NULL
columns (``clip_url``, ``landing_clip_url``, ``stand_clip_url`` /
``aim_clip_url``) are independent and each pipeline must preserve the same
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
async def test_set_stand_clip_url_commits(db: AsyncSession):
    created = await lineup_repo.create_lineup(
        db, {"title": "stand repo test", "status": "pending_review"}
    )

    returned = await lineup_repo.set_stand_clip_url(
        db, created, "pending/vidX/12-stand-micro.mp4"
    )
    assert returned.stand_clip_url == "pending/vidX/12-stand-micro.mp4"

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
    assert refetched.stand_clip_url == "pending/vidX/12-stand-micro.mp4"


@pytest.mark.asyncio
async def test_set_aim_clip_url_commits(db: AsyncSession):
    created = await lineup_repo.create_lineup(
        db, {"title": "aim repo test", "status": "pending_review"}
    )

    returned = await lineup_repo.set_aim_clip_url(
        db, created, "pending/vidX/12-aim-micro.mp4"
    )
    assert returned.aim_clip_url == "pending/vidX/12-aim-micro.mp4"

    lineup_id = created.id
    db.expire_all()
    refetched = (
        await db.execute(select(Lineup).where(Lineup.id == lineup_id))
    ).scalar_one()
    assert refetched.aim_clip_url == "pending/vidX/12-aim-micro.mp4"


@pytest.mark.asyncio
async def test_set_micro_clip_urls_are_independent(db: AsyncSession):
    """Setting stand must not touch aim and vice versa — the two columns are
    independent and a one-side failure must never roll back the other side."""
    created = await lineup_repo.create_lineup(
        db, {"title": "both micro test", "status": "pending_review"}
    )
    await lineup_repo.set_stand_clip_url(
        db, created, "pending/v/1-stand-micro.mp4"
    )
    await lineup_repo.set_aim_clip_url(
        db, created, "pending/v/1-aim-micro.mp4"
    )

    lineup_id = created.id
    db.expire_all()
    refetched = (
        await db.execute(select(Lineup).where(Lineup.id == lineup_id))
    ).scalar_one()
    assert refetched.stand_clip_url == "pending/v/1-stand-micro.mp4"
    assert refetched.aim_clip_url == "pending/v/1-aim-micro.mp4"


@pytest.mark.asyncio
async def test_micro_clips_do_not_overwrite_other_clip_columns(
    db: AsyncSession,
):
    """The three pipelines (PR2 throw, PR5 landing, PR6 micro) write to
    disjoint columns. If any setter ever drove a global UPDATE that nulled
    a sibling column, the backfills would silently destroy each other's
    work. Regression guard for that whole class of bug."""
    created = await lineup_repo.create_lineup(
        db, {"title": "four-column test", "status": "pending_review"}
    )
    await lineup_repo.set_clip_url(db, created, "pending/v/1-clip.mp4")
    await lineup_repo.set_landing_clip_url(
        db, created, "pending/v/1-landing.mp4"
    )
    await lineup_repo.set_stand_clip_url(
        db, created, "pending/v/1-stand-micro.mp4"
    )
    await lineup_repo.set_aim_clip_url(
        db, created, "pending/v/1-aim-micro.mp4"
    )

    lineup_id = created.id
    db.expire_all()
    refetched = (
        await db.execute(select(Lineup).where(Lineup.id == lineup_id))
    ).scalar_one()
    assert refetched.clip_url == "pending/v/1-clip.mp4"
    assert refetched.landing_clip_url == "pending/v/1-landing.mp4"
    assert refetched.stand_clip_url == "pending/v/1-stand-micro.mp4"
    assert refetched.aim_clip_url == "pending/v/1-aim-micro.mp4"


@pytest.mark.asyncio
async def test_list_accepted_lineups_needing_micro_clips_filters(
    db: AsyncSession,
):
    """The set is rows that are missing EITHER stand or aim. Confirms a
    half-populated row (one side filled, the other NULL) is included so the
    backfill picks it up — the generator handles partial state internally,
    so the repo set is correctly the union, not the intersection."""
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
            stand_clip_url=None,
            aim_clip_url=None,
        )
        data.update(over)
        return data

    # Wanted #1: neither side filled.
    wanted_a = await lineup_repo.create_lineup(db, _accepted())
    # Wanted #2: stand filled, aim missing — backfill must still pick this up.
    wanted_b = await lineup_repo.create_lineup(
        db, _accepted(stand_clip_url="pending/vidQ/3-stand-micro.mp4")
    )
    # Wanted #3: aim filled, stand missing — symmetric to wanted_b.
    wanted_c = await lineup_repo.create_lineup(
        db, _accepted(aim_clip_url="pending/vidQ/4-aim-micro.mp4")
    )
    # Excluded: both sides already filled.
    await lineup_repo.create_lineup(
        db,
        _accepted(
            stand_clip_url="pending/vidQ/5-stand-micro.mp4",
            aim_clip_url="pending/vidQ/5-aim-micro.mp4",
        ),
    )
    # Excluded: no source video to re-fetch.
    await lineup_repo.create_lineup(db, _accepted(youtube_video_id=None))
    # Excluded: still pending_review (not accepted).
    await lineup_repo.create_lineup(
        db, {"title": "p", "status": "pending_review", "youtube_video_id": "vidQ"}
    )

    rows = await lineup_repo.list_accepted_lineups_needing_micro_clips(db)
    ids = {r.id for r in rows}
    assert wanted_a.id in ids
    assert wanted_b.id in ids, (
        "A row with stand filled but aim missing must still be in the set — "
        "the two micro-clip columns are independent and the backfill is a "
        "union, not an intersection."
    )
    assert wanted_c.id in ids, (
        "A row with aim filled but stand missing must still be in the set."
    )
    for r in rows:
        assert r.status == "accepted"
        assert r.youtube_video_id
        # Each row must have AT LEAST ONE side still NULL.
        assert r.stand_clip_url is None or r.aim_clip_url is None


@pytest.mark.asyncio
async def test_set_stand_clip_url_without_offset_leaves_offset_unchanged(
    db: AsyncSession,
):
    """Default shape — ``offset_s=None`` — must not touch
    ``stand_clip_offset_s``. Backfill / ingest paths without a shared wider
    source rely on this NULL-stays-NULL behaviour to signal "no shift state
    available" to the PR2 shift overlay."""
    created = await lineup_repo.create_lineup(
        db, {"title": "no offset", "status": "pending_review"}
    )

    await lineup_repo.set_stand_clip_url(
        db, created, "pending/v/1-stand-micro.mp4"
    )

    lineup_id = created.id
    db.expire_all()
    refetched = (
        await db.execute(select(Lineup).where(Lineup.id == lineup_id))
    ).scalar_one()
    assert refetched.stand_clip_url == "pending/v/1-stand-micro.mp4"
    assert refetched.stand_clip_offset_s is None


@pytest.mark.asyncio
async def test_set_stand_clip_url_with_offset_persists_both_columns(
    db: AsyncSession,
):
    """``offset_s=`` set → both ``stand_clip_url`` and ``stand_clip_offset_s``
    commit in the same write."""
    created = await lineup_repo.create_lineup(
        db, {"title": "with offset", "status": "pending_review"}
    )

    await lineup_repo.set_stand_clip_url(
        db, created, "pending/v/1-stand-micro.mp4", offset_s=2.5,
    )

    lineup_id = created.id
    db.expire_all()
    refetched = (
        await db.execute(select(Lineup).where(Lineup.id == lineup_id))
    ).scalar_one()
    assert refetched.stand_clip_url == "pending/v/1-stand-micro.mp4"
    assert refetched.stand_clip_offset_s == pytest.approx(2.5)


@pytest.mark.asyncio
async def test_set_aim_clip_url_with_offset_persists_both_columns(
    db: AsyncSession,
):
    """Sibling test for the AIM setter — same two-column commit contract."""
    created = await lineup_repo.create_lineup(
        db, {"title": "aim with offset", "status": "pending_review"}
    )

    await lineup_repo.set_aim_clip_url(
        db, created, "pending/v/1-aim-micro.mp4", offset_s=4.25,
    )

    lineup_id = created.id
    db.expire_all()
    refetched = (
        await db.execute(select(Lineup).where(Lineup.id == lineup_id))
    ).scalar_one()
    assert refetched.aim_clip_url == "pending/v/1-aim-micro.mp4"
    assert refetched.aim_clip_offset_s == pytest.approx(4.25)


@pytest.mark.asyncio
async def test_set_stand_clip_url_with_offset_zero_is_distinct_from_null(
    db: AsyncSession,
):
    """Offset 0.0 is a real operator choice (the served 1s clip happens to
    start at the wider source's start); it must persist as 0.0, not be
    coalesced to NULL. The shift overlay relies on this distinction to know
    whether to open the slider at the saved position vs the default 0."""
    created = await lineup_repo.create_lineup(
        db, {"title": "zero offset", "status": "pending_review"}
    )

    await lineup_repo.set_stand_clip_url(
        db, created, "pending/v/1-stand-micro.mp4", offset_s=0.0,
    )

    lineup_id = created.id
    db.expire_all()
    refetched = (
        await db.execute(select(Lineup).where(Lineup.id == lineup_id))
    ).scalar_one()
    assert refetched.stand_clip_offset_s == pytest.approx(0.0)
    assert refetched.stand_clip_offset_s is not None
