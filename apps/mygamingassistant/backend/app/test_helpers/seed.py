"""Test-only seed endpoints for E2E test data management.

Provides lightweight helpers to create and clean up pending_review lineups
so E2E tests can exercise the review queue accept flow without requiring the
full ingestion pipeline.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete as _sa_delete, select as _sa_select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import current_active_user
from app.core.config import settings
from app.db.session import get_db
from app.models.game.game import Game
from app.models.game.lineup import Lineup
from app.models.game.map import Map
from app.models.user.user import User

router = APIRouter()


def _require_test_mode() -> None:
    if not settings.mga_enable_test_helpers:
        raise HTTPException(status_code=404, detail="Not found")


class _SeedLineupRequest(BaseModel):
    game_slug: str
    map_slug: str
    title: str = "E2E Test Lineup"
    chapter_title: str = "E2E Test Chapter"


class _SeedLineupResponse(BaseModel):
    lineup_id: str
    status: str


@router.post("/seed-lineup", response_model=_SeedLineupResponse)
async def seed_lineup(
    body: _SeedLineupRequest,
    _user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
) -> _SeedLineupResponse:
    """Create a pending_review lineup for E2E testing.

    Requires authentication. Creates a minimal lineup with status='pending_review'
    and null classification fields — mirrors what the ingestion pipeline produces
    before the classifier runs.

    Only available when MGA_ENABLE_TEST_HELPERS=1.
    """
    _require_test_mode()

    # Resolve game
    game = (
        await db.execute(_sa_select(Game).where(Game.slug == body.game_slug))
    ).scalar_one_or_none()
    if game is None:
        raise HTTPException(
            status_code=422, detail=f"Game '{body.game_slug}' not found in fixtures"
        )

    # Resolve map
    map_obj = (
        await db.execute(
            _sa_select(Map).where(Map.game_id == game.id, Map.slug == body.map_slug)
        )
    ).scalar_one_or_none()
    if map_obj is None:
        raise HTTPException(
            status_code=422,
            detail=f"Map '{body.map_slug}' not found for game '{body.game_slug}'",
        )

    # Create a minimal pending_review lineup
    lineup = Lineup(
        id=uuid.uuid4(),
        game_id=game.id,
        map_id=map_obj.id,
        title=body.title,
        chapter_title=body.chapter_title,
        status="pending_review",
        # Classification fields null — same as ingestion path before classifier
        target_zone_id=None,
        stand_zone_id=None,
        utility_type_id=None,
        side=None,
    )
    db.add(lineup)
    await db.flush()
    await db.commit()

    return _SeedLineupResponse(lineup_id=str(lineup.id), status=lineup.status)


@router.delete("/seed-lineup/{lineup_id}", status_code=204)
async def delete_seeded_lineup(
    lineup_id: uuid.UUID,
    _user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Hard-delete a seeded test lineup.

    Used by E2E teardown to clean up test data.
    Only available when MGA_ENABLE_TEST_HELPERS=1.
    """
    _require_test_mode()
    await db.execute(
        _sa_delete(Lineup).where(Lineup.id == lineup_id)
    )
    await db.commit()
