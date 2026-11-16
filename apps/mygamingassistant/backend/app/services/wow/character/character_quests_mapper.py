"""Blizzard's ``/quests/completed`` → ``CharacterCompletedQuests``."""
from __future__ import annotations

from typing import Any

from app.schemas.wow.character.character_completed_quests import CharacterCompletedQuests
from app.services.wow.character.character_json import as_int


def to_completed_quests(raw: dict[str, Any] | None) -> CharacterCompletedQuests:
    """Each turned-in quest's id, sorted and once; rows without an id are dropped. None (404) = none yet."""
    rows = (raw or {}).get("quests")
    ids = {as_int(row.get("id")) for row in rows if isinstance(row, dict)} if isinstance(rows, list) else set()
    return CharacterCompletedQuests(quest_ids=sorted(i for i in ids if i is not None))
