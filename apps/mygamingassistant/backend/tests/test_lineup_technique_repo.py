"""DB-backed test for lineup_repo.set_technique (PR3).

The technique phrase must actually COMMIT (not just flush) — the same silent
data-loss class as PATCH #687 and PR2's clip_url repo: ``get_db`` doesn't
auto-commit, so a flush-only write is rolled back on session close and the
operator's technique silently never appears. This asserts the write survives
a fresh read.
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
async def test_set_technique_commits(db: AsyncSession):
    created = await lineup_repo.create_lineup(
        db, {"title": "technique repo test", "status": "pending_review"}
    )

    returned = await lineup_repo.set_technique(db, created, "Jumpthrow + LMB")
    assert returned.technique == "Jumpthrow + LMB"

    # Capture the PK *before* expire_all(): referencing an expired attribute
    # (created.id) inside the query expression triggers a synchronous lazy
    # reload — sync session.execute outside the async greenlet, i.e.
    # MissingGreenlet. The PK as a plain local has no such hazard.
    lineup_id = created.id

    db.expire_all()
    refetched = (
        await db.execute(select(Lineup).where(Lineup.id == lineup_id))
    ).scalar_one()
    assert refetched.technique == "Jumpthrow + LMB"


@pytest.mark.asyncio
async def test_set_technique_accepts_none(db: AsyncSession):
    """The repo signature allows None — used by the extractor for
    'cannot determine' answers when a row was previously populated and is
    being explicitly cleared. Verifies the column round-trips NULL."""
    created = await lineup_repo.create_lineup(
        db,
        {
            "title": "technique none test",
            "status": "pending_review",
            "technique": "old-phrase",
        },
    )
    await lineup_repo.set_technique(db, created, None)

    lineup_id = created.id
    db.expire_all()
    refetched = (
        await db.execute(select(Lineup).where(Lineup.id == lineup_id))
    ).scalar_one()
    assert refetched.technique is None


@pytest.mark.asyncio
async def test_set_technique_overwrite_is_idempotent(db: AsyncSession):
    """Backfill may re-evaluate a still-NULL technique row; a populated row
    drops out of the work set. Mirror the clip repo overwrite contract so a
    deterministic re-call is safe."""
    created = await lineup_repo.create_lineup(
        db, {"title": "technique overwrite test", "status": "pending_review"}
    )
    await lineup_repo.set_technique(db, created, "Run + RMB")
    await lineup_repo.set_technique(db, created, "Run + RMB")

    lineup_id = created.id
    db.expire_all()
    refetched = (
        await db.execute(select(Lineup).where(Lineup.id == lineup_id))
    ).scalar_one()
    assert refetched.technique == "Run + RMB"


@pytest.mark.asyncio
async def test_list_accepted_lineups_needing_technique_filters(
    db: AsyncSession,
):
    """Only accepted + has-source-video + no-technique rows are in the backfill
    set. The youtube_video_id IS NOT NULL clause is *input-modality* gating
    (manual uploads have no extractable technique) — verify a manual-upload
    accepted lineup is excluded."""
    game = Game(
        slug=f"g-{uuid.uuid4().hex[:8]}",
        name="G",
        side_a_label="A",
        side_b_label="B",
    )
    db.add(game)
    await db.flush()
    mp = Map(game_id=game.id, slug=f"m-{uuid.uuid4().hex[:8]}", name="M")
    db.add(mp)
    await db.flush()
    zone = MapZone(
        map_id=mp.id,
        slug=f"z-{uuid.uuid4().hex[:8]}",
        name="Z",
        polygon_points=[],
    )
    db.add(zone)
    util = UtilityType(
        game_id=game.id, slug=f"u-{uuid.uuid4().hex[:8]}", name="U"
    )
    db.add(util)
    await db.flush()

    def _accepted(**over):
        data = dict(
            game_id=game.id,
            map_id=mp.id,
            target_zone_id=zone.id,
            stand_zone_id=zone.id,
            side="side_a",
            utility_type_id=util.id,
            title="t",
            status="accepted",
            youtube_video_id="vidT",
            technique=None,
        )
        data.update(over)
        return data

    wanted = await lineup_repo.create_lineup(db, _accepted())
    # Excluded: already has a technique.
    await lineup_repo.create_lineup(
        db, _accepted(technique="Jumpthrow + LMB")
    )
    # Excluded: no source video (manual upload — modality gate).
    await lineup_repo.create_lineup(db, _accepted(youtube_video_id=None))
    # Excluded: still pending_review (not accepted).
    await lineup_repo.create_lineup(
        db,
        {
            "title": "p",
            "status": "pending_review",
            "youtube_video_id": "vidT",
        },
    )

    rows = await lineup_repo.list_accepted_lineups_needing_technique(db)
    ids = {r.id for r in rows}
    assert wanted.id in ids
    assert all(
        r.status == "accepted"
        and r.youtube_video_id
        and r.technique is None
        for r in rows
    )
