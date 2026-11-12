"""The sheet to store: a fresh fetch, with any section Blizzard failed to send kept from the stored sheet.

A section is None only when Blizzard failed on it (an empty answer maps to an
empty section), so a None never overwrites a stored value.
"""
from __future__ import annotations

from typing import Final

from app.schemas.wow.character.character_response import CharacterResponse

_SECTIONS: Final = ("stats", "talents", "professions", "reputations", "pvp", "dungeons")
_COLLECTIONS: Final = ("mounts", "pets")


def merge_sheet(fresh: CharacterResponse, stored: CharacterResponse | None) -> CharacterResponse:
    if stored is None:
        return fresh
    kept = {s: getattr(stored, s) for s in _SECTIONS if getattr(fresh, s) is None and getattr(stored, s) is not None}
    kept_collections = {
        c: getattr(stored.collections, c)
        for c in _COLLECTIONS
        if getattr(fresh.collections, c) is None and getattr(stored.collections, c) is not None
    }
    if kept_collections:
        kept["collections"] = fresh.collections.model_copy(update=kept_collections)
    return fresh.model_copy(update=kept) if kept else fresh
