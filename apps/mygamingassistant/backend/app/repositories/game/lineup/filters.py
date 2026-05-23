"""Lineup query filters — the LineupFilters dataclass + the WHERE applier."""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy import Select

from app.models.game.lineup import Lineup


@dataclass
class LineupFilters:
    game_id: Optional[uuid.UUID] = None
    map_id: Optional[uuid.UUID] = None
    target_zone_id: Optional[uuid.UUID] = None
    stand_zone_id: Optional[uuid.UUID] = None
    # "side_a", "side_b", or None (no filter)
    side: Optional[str] = None
    utility_type_ids: list[uuid.UUID] = field(default_factory=list)
    # None → only "accepted"; set explicitly to bypass
    status: Optional[str] = "accepted"


def _apply_filters(stmt: "Select[tuple[Lineup]]", f: LineupFilters) -> "Select[tuple[Lineup]]":
    if f.status is not None:
        stmt = stmt.where(Lineup.status == f.status)
    if f.game_id is not None:
        stmt = stmt.where(Lineup.game_id == f.game_id)
    if f.map_id is not None:
        stmt = stmt.where(Lineup.map_id == f.map_id)
    if f.target_zone_id is not None:
        stmt = stmt.where(Lineup.target_zone_id == f.target_zone_id)
    if f.stand_zone_id is not None:
        stmt = stmt.where(Lineup.stand_zone_id == f.stand_zone_id)
    if f.side is not None:
        # "any" semantics: lineup.side='any' always matches regardless of the
        # requested side.
        stmt = stmt.where(Lineup.side.in_([f.side, "any"]))
    if f.utility_type_ids:
        stmt = stmt.where(Lineup.utility_type_id.in_(f.utility_type_ids))
    return stmt
