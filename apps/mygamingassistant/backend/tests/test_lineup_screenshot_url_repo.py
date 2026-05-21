"""DB-backed tests for lineup_repo.set_stand_screenshot_url + set_aim_screenshot_url (PR1).

The two operator-facing screenshot setters MUST commit (not just flush) —
same silent data-loss class as PATCH #687 and the PR5/PR6 clip-setter
discipline: ``get_db`` doesn't auto-commit, so a flush-only write is rolled
back on session close and the operator's just-uploaded still silently never
appears. Asserts each write survives a fresh read AND that the two columns
are independent (a stand-still replace must never affect aim, and vice
versa).

Mirrors :mod:`test_lineup_micro_clip_repo` exactly — the new operator-side
setters preserve the same one-column-commit contract as the
ingestion-side clip setters.
"""
from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game.lineup import Lineup
from app.repositories.game import lineup_repo


@pytest.mark.asyncio
async def test_set_stand_screenshot_url_commits(db: AsyncSession):
    created = await lineup_repo.create_lineup(
        db, {"title": "stand still repo test", "status": "pending_review"}
    )

    returned = await lineup_repo.set_stand_screenshot_url(
        db, created, "edits/00000000-0000-0000-0000-000000000abc/stand-still-xx.png"
    )
    assert returned.stand_screenshot_url == \
        "edits/00000000-0000-0000-0000-000000000abc/stand-still-xx.png"

    # Capture the PK BEFORE expire_all() to avoid the MissingGreenlet trap
    # documented in PR2/PR6 sibling tests.
    lineup_id = created.id
    db.expire_all()
    refetched = (
        await db.execute(select(Lineup).where(Lineup.id == lineup_id))
    ).scalar_one()
    assert refetched.stand_screenshot_url == \
        "edits/00000000-0000-0000-0000-000000000abc/stand-still-xx.png"


@pytest.mark.asyncio
async def test_set_aim_screenshot_url_commits(db: AsyncSession):
    created = await lineup_repo.create_lineup(
        db, {"title": "aim still repo test", "status": "pending_review"}
    )

    returned = await lineup_repo.set_aim_screenshot_url(
        db, created, "edits/00000000-0000-0000-0000-000000000def/aim-still-yy.png"
    )
    assert returned.aim_screenshot_url == \
        "edits/00000000-0000-0000-0000-000000000def/aim-still-yy.png"

    lineup_id = created.id
    db.expire_all()
    refetched = (
        await db.execute(select(Lineup).where(Lineup.id == lineup_id))
    ).scalar_one()
    assert refetched.aim_screenshot_url == \
        "edits/00000000-0000-0000-0000-000000000def/aim-still-yy.png"


@pytest.mark.asyncio
async def test_setters_are_independent(db: AsyncSession):
    """Stand replace must never affect aim, and vice versa.

    The two setters are siblings — operator may replace one slot without
    touching the other — so a stand write must persist as a stand-only
    change. Asserts both columns can hold distinct values simultaneously
    after independent writes.
    """
    created = await lineup_repo.create_lineup(
        db, {"title": "independence test", "status": "pending_review"}
    )

    await lineup_repo.set_stand_screenshot_url(
        db, created, "edits/lineupA/stand-still-A.png"
    )
    await lineup_repo.set_aim_screenshot_url(
        db, created, "edits/lineupA/aim-still-A.png"
    )

    lineup_id = created.id
    db.expire_all()
    refetched = (
        await db.execute(select(Lineup).where(Lineup.id == lineup_id))
    ).scalar_one()
    assert refetched.stand_screenshot_url == "edits/lineupA/stand-still-A.png"
    assert refetched.aim_screenshot_url   == "edits/lineupA/aim-still-A.png"


@pytest.mark.asyncio
async def test_setters_do_not_clobber_sibling_clip_columns(db: AsyncSession):
    """Replacing a still must NOT null the matching clip column.

    The operator may have both a clip and a still set on a pane (per LineupPanes
    fallback behavior — when both are present the clip wins). Replacing the
    still slot must leave the clip slot untouched so the prior clip continues
    to take precedence.
    """
    created = await lineup_repo.create_lineup(
        db, {"title": "clip preservation test", "status": "pending_review"}
    )
    await lineup_repo.set_stand_clip_url(
        db, created, "pending/vidX/12-stand-micro.mp4"
    )
    await lineup_repo.set_stand_screenshot_url(
        db, created, "edits/lineupB/stand-still-B.png"
    )

    lineup_id = created.id
    db.expire_all()
    refetched = (
        await db.execute(select(Lineup).where(Lineup.id == lineup_id))
    ).scalar_one()
    assert refetched.stand_clip_url        == "pending/vidX/12-stand-micro.mp4"
    assert refetched.stand_screenshot_url  == "edits/lineupB/stand-still-B.png"
