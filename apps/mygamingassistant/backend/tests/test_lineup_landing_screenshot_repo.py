"""DB-backed tests for lineup_repo.set_landing_screenshot_url (preview-stills PR).

Mirrors :mod:`test_lineup_screenshot_url_repo` exactly — same one-column
commit contract, independent column. The landing-poster setter MUST commit
(not just flush) so the operator's/backfill's freshly-extracted poster
survives past request-session close (same silent data-loss class as
PATCH #687 and the PR5/PR6 clip-setter discipline).
"""
from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game.lineup import Lineup
from app.repositories.game import lineup_repo


@pytest.mark.asyncio
async def test_set_landing_screenshot_url_commits(db: AsyncSession):
    created = await lineup_repo.create_lineup(
        db, {"title": "landing poster repo test", "status": "pending_review"}
    )

    returned = await lineup_repo.set_landing_screenshot_url(
        db, created, "pending/vidX/12-landing-poster.webp"
    )
    assert returned.landing_screenshot_url == "pending/vidX/12-landing-poster.webp"

    # Capture the PK BEFORE expire_all() to avoid the MissingGreenlet trap
    # documented in the PR2/PR6 sibling tests.
    lineup_id = created.id
    db.expire_all()
    refetched = (
        await db.execute(select(Lineup).where(Lineup.id == lineup_id))
    ).scalar_one()
    assert refetched.landing_screenshot_url == "pending/vidX/12-landing-poster.webp"


@pytest.mark.asyncio
async def test_set_landing_screenshot_url_overwrite_is_idempotent(db: AsyncSession):
    """Backfill/recut recomputes the same deterministic key — overwrite must work."""
    created = await lineup_repo.create_lineup(
        db, {"title": "landing poster overwrite test", "status": "pending_review"}
    )
    await lineup_repo.set_landing_screenshot_url(
        db, created, "pending/v/1-landing-poster.webp"
    )
    await lineup_repo.set_landing_screenshot_url(
        db, created, "pending/v/1-landing-poster.webp"
    )

    lineup_id = created.id
    db.expire_all()
    refetched = (
        await db.execute(select(Lineup).where(Lineup.id == lineup_id))
    ).scalar_one()
    assert refetched.landing_screenshot_url == "pending/v/1-landing-poster.webp"


@pytest.mark.asyncio
async def test_set_landing_screenshot_url_does_not_clobber_landing_clip(
    db: AsyncSession,
):
    """Setting the poster still must NOT null the sibling landing_clip_url —
    the LANDING pane can carry both a still and a clip (clip takes precedence
    at render time; the still is the instant-paint fallback)."""
    created = await lineup_repo.create_lineup(
        db, {"title": "landing poster + clip test", "status": "pending_review"}
    )
    await lineup_repo.set_landing_clip_url(
        db, created, "pending/vidX/12-landing.mp4"
    )
    await lineup_repo.set_landing_screenshot_url(
        db, created, "pending/vidX/12-landing-poster.webp"
    )

    lineup_id = created.id
    db.expire_all()
    refetched = (
        await db.execute(select(Lineup).where(Lineup.id == lineup_id))
    ).scalar_one()
    assert refetched.landing_clip_url == "pending/vidX/12-landing.mp4"
    assert refetched.landing_screenshot_url == "pending/vidX/12-landing-poster.webp"


@pytest.mark.asyncio
async def test_set_landing_screenshot_url_independent_from_stand_and_aim(
    db: AsyncSession,
):
    """The landing poster is independent of the stand/aim stills — setting
    one must never affect the others."""
    created = await lineup_repo.create_lineup(
        db, {"title": "three-still independence test", "status": "pending_review"}
    )
    await lineup_repo.set_stand_screenshot_url(
        db, created, "edits/lineupA/stand-still-A.png"
    )
    await lineup_repo.set_aim_screenshot_url(
        db, created, "edits/lineupA/aim-still-A.png"
    )
    await lineup_repo.set_landing_screenshot_url(
        db, created, "pending/vidX/12-landing-poster.webp"
    )

    lineup_id = created.id
    db.expire_all()
    refetched = (
        await db.execute(select(Lineup).where(Lineup.id == lineup_id))
    ).scalar_one()
    assert refetched.stand_screenshot_url == "edits/lineupA/stand-still-A.png"
    assert refetched.aim_screenshot_url == "edits/lineupA/aim-still-A.png"
    assert refetched.landing_screenshot_url == "pending/vidX/12-landing-poster.webp"
