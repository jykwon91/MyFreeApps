"""Blizzard's ``/specializations`` answer → ``CharacterTalents``.

Only each talent's id and rank are kept: names, icons and rank text come from
MGA's own talent tree files (the same Blizzard ids), so the page reads them
the way the talent calculator does.
"""
from __future__ import annotations

from typing import Any

from app.schemas.wow.character.character_talent_group import CharacterTalentGroup
from app.schemas.wow.character.character_talent_pick import CharacterTalentPick
from app.schemas.wow.character.character_talents import CharacterTalents
from app.services.wow.character.character_json import as_dict, as_int, as_list


def _picks(group: dict[str, Any]) -> list[CharacterTalentPick]:
    ranks: dict[int, int] = {}
    for spec in as_list(group.get("specializations")):
        for raw in as_list(as_dict(spec).get("talents")):
            talent = as_dict(raw)
            talent_id = as_int(as_dict(talent.get("talent")).get("id"))
            rank = as_int(talent.get("talent_rank"))
            if talent_id is not None and rank is not None and rank > 0:
                ranks[talent_id] = rank
    return [CharacterTalentPick(id=talent_id, rank=rank) for talent_id, rank in ranks.items()]


def to_character_talents(specializations: dict[str, Any] | None) -> CharacterTalents | None:
    """None only when Blizzard failed to answer; a character with no points has no groups."""
    if specializations is None:
        return None
    groups = [as_dict(raw) for raw in as_list(specializations.get("specialization_groups"))]
    talents = [CharacterTalentGroup(active=group.get("is_active") is True, picks=_picks(group)) for group in groups]
    kept = [group for group in talents if group.picks]
    kept.sort(key=lambda group: not group.active)
    return CharacterTalents(groups=kept)
