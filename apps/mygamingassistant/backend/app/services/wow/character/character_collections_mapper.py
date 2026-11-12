"""Blizzard's ``/collections/mounts`` + ``/collections/pets`` → ``CharacterCollections``."""
from __future__ import annotations

from collections import Counter
from typing import Any

from app.schemas.wow.character.character_collectible import CharacterCollectible
from app.schemas.wow.character.character_collections import CharacterCollections
from app.services.wow.character.character_json import as_dict, as_int, as_list, as_str


def _collectibles(answer: dict[str, Any] | None, list_key: str, ref_key: str) -> list[CharacterCollectible] | None:
    """Alphabetical, one line per mount or pet species with how many are owned; None when the call failed."""
    if answer is None:
        return None
    names: dict[int, str] = {}
    counts: Counter[int] = Counter()
    for entry in as_list(answer.get(list_key)):
        ref = as_dict(as_dict(entry).get(ref_key))
        ref_id, name = as_int(ref.get("id")), as_str(ref.get("name"))
        if ref_id is None or not name:
            continue
        names[ref_id] = name
        counts[ref_id] += 1
    return sorted(
        (CharacterCollectible(id=ref_id, name=name, count=counts[ref_id]) for ref_id, name in names.items()),
        key=lambda item: (item.name.casefold(), item.id),
    )


def to_character_collections(mounts: dict[str, Any] | None, pets: dict[str, Any] | None) -> CharacterCollections:
    return CharacterCollections(
        mounts=_collectibles(mounts, "mounts", "mount"),
        pets=_collectibles(pets, "pets", "species"),
    )
