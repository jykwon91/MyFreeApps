"""Blizzard's ``/reputations`` answer → ``list[CharacterReputation]``."""
from __future__ import annotations

from typing import Any

from app.schemas.wow.character.character_reputation import CharacterReputation
from app.services.wow.character.character_json import as_dict, as_int, as_list, as_str, name_of


def _reputation(raw: Any) -> CharacterReputation | None:
    entry = as_dict(raw)
    faction = as_dict(entry.get("faction"))
    standing = as_dict(entry.get("standing"))
    faction_id = as_int(faction.get("id"))
    name = name_of(faction)
    standing_name = as_str(standing.get("name"))
    tier = as_int(standing.get("tier"))
    value = as_int(standing.get("value"))
    cap = as_int(standing.get("max"))
    if faction_id is None or name is None or standing_name is None or tier is None or value is None or cap is None:
        return None
    return CharacterReputation(id=faction_id, name=name, standing=standing_name, tier=tier, value=value, max=cap)


def to_character_reputations(reputations: dict[str, Any] | None) -> list[CharacterReputation] | None:
    """None only when Blizzard failed to answer; a character who has met no faction has an empty list."""
    if reputations is None:
        return None
    return [rep for entry in as_list(reputations.get("reputations")) if (rep := _reputation(entry)) is not None]
