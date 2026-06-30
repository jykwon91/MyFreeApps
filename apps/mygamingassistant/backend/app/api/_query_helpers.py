"""Shared query helpers for the lineups route module.

Extracted from ``lineups.py`` so that module stays under the file-size growth
guard (see apps/mygamingassistant/CLAUDE.md → Tech Debt Policy). Pure,
stateless query helpers — no router/request state.
"""
from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


async def resolve_slugs_to_ids(
    db: AsyncSession,
    model: type,
    raw: Optional[str],
    game_id: Optional[uuid.UUID],
) -> list[uuid.UUID]:
    """Resolve a comma-separated slug CSV to game-scoped row ids.

    Backs the ``utility_type_slugs`` / ``agent_slugs`` list filters — both
    resolve a slug CSV against a game-scoped table (``UtilityType`` / ``Agent``,
    each exposing ``game_id`` + ``slug`` columns). Returns ``[]`` when *raw* or
    *game_id* is missing, or nothing matches, so an unknown slug yields an empty
    filter rather than an error.
    """
    if not (raw and game_id):
        return []
    slugs = [s.strip() for s in raw.split(",") if s.strip()]
    if not slugs:
        return []
    result = await db.execute(
        select(model).where(model.game_id == game_id, model.slug.in_(slugs))
    )
    return [row.id for row in result.scalars().all()]
