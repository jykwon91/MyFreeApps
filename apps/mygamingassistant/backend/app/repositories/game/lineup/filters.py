"""Lineup query filters — the LineupFilters dataclass + the WHERE applier."""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy import Select, select

from app.models.game.lineup import Lineup
from app.models.game.utility_type import UtilityType


@dataclass
class LineupFilters:
    game_id: Optional[uuid.UUID] = None
    map_id: Optional[uuid.UUID] = None
    target_zone_id: Optional[uuid.UUID] = None
    stand_zone_id: Optional[uuid.UUID] = None
    # "side_a", "side_b", or None (no filter)
    side: Optional[str] = None
    utility_type_ids: list[uuid.UUID] = field(default_factory=list)
    # Valorant agent filter — matches lineups whose utility_type belongs to one
    # of these agents (agent is derived from utility_type.agent_id, not stored
    # on the lineup).
    agent_ids: list[uuid.UUID] = field(default_factory=list)
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
    if f.agent_ids:
        # Derive via utility_type → agent: match lineups whose utility belongs
        # to one of the requested agents. Composes with utility_type_ids (e.g.
        # agent=Sova + utility=shock narrows to Sova's shock lineups).
        stmt = stmt.where(
            Lineup.utility_type_id.in_(
                select(UtilityType.id).where(UtilityType.agent_id.in_(f.agent_ids))
            )
        )
    return stmt
