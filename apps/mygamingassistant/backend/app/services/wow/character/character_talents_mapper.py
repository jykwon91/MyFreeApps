"""Blizzard's ``/specializations`` answer → ``CharacterTalents`` / talent-point summary.

Only each talent's id and rank are kept: names, icons and rank text come from
MGA's own talent tree files (the same Blizzard ids), so the page reads them
the way the talent calculator does.

``active_tree_points`` extracts only the per-tree point totals for the guild
roster (stored on ``wow_character.talent_points`` so guild queries don't need
to decode the full sheet JSON).
"""
from __future__ import annotations

from typing import Any

from app.schemas.wow.character.character_talent_group import CharacterTalentGroup
from app.schemas.wow.character.character_talent_pick import CharacterTalentPick
from app.schemas.wow.character.character_talents import CharacterTalents
from app.services.wow.character.character_json import as_dict, as_int, as_list


def active_tree_points(specializations: dict[str, Any] | None) -> list[dict[str, Any]] | None:
    """The active set's per-tree point totals for roster display.

    Returns None when Blizzard failed to answer (keeps any stored value),
    [] when the character has no points, or a list of {tree_id, points}
    for every tree with spent_points > 0.  Blizzard omits zero-point trees
    from its response, so only non-zero trees appear.
    """
    if specializations is None:
        return None
    result: list[dict[str, Any]] = []
    for group_raw in as_list(specializations.get("specialization_groups")):
        group = as_dict(group_raw)
        if group.get("is_active") is not True:
            continue
        for spec_raw in as_list(group.get("specializations")):
            spec = as_dict(spec_raw)
            tree_id = as_int(as_dict(spec.get("specialization")).get("id"))
            points = as_int(spec.get("spent_points"))
            if tree_id is not None and points is not None and points > 0:
                result.append({"tree_id": tree_id, "points": points})
    return result


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
    """None only when Blizzard failed to answer; a character with no points in any set has no groups."""
    if specializations is None:
        return None
    groups = [as_dict(raw) for raw in as_list(specializations.get("specialization_groups"))]
    talents = [CharacterTalentGroup(active=group.get("is_active") is True, picks=_picks(group)) for group in groups]
    if not any(group.picks for group in talents):
        return CharacterTalents(groups=[])
    # The active set stays even when empty (just respecced): showing the other set would lie.
    kept = [group for group in talents if group.picks or group.active]
    kept.sort(key=lambda group: not group.active)
    return CharacterTalents(groups=kept)
