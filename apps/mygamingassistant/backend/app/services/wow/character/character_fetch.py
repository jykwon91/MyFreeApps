"""One look-up of a character: the sheet, Blizzard's answers behind it, and whether they are new."""
from dataclasses import dataclass

from app.schemas.wow.character.character_response import CharacterResponse
from app.services.wow.character.character_profile import CharacterProfile


@dataclass(frozen=True)
class CharacterFetch:
    response: CharacterResponse
    profile: CharacterProfile
    # True when Blizzard was asked for this look-up; False when it came from the in-process cache.
    fresh: bool
