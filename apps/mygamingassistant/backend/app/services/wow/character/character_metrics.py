"""A character's leaderboard numbers from one fetch. None = Blizzard didn't send it."""
from dataclasses import dataclass

from app.services.wow.character.character_faction_standing import CharacterFactionStanding
from app.services.wow.character.character_profession_level import CharacterProfessionLevel


@dataclass(frozen=True)
class CharacterMetrics:
    level: int
    item_level: int | None
    honorable_kills: int | None
    killing_blows: int | None
    deaths_from_players: int | None
    total_kills: int | None
    total_deaths: int | None
    dungeons_done: int | None
    exalted_reputations: int | None
    # None when Blizzard failed to send the professions; empty when the character has none.
    professions: tuple[CharacterProfessionLevel, ...] | None
    # None when Blizzard failed to send the reputations; empty when the character has met none.
    reputations: tuple[CharacterFactionStanding, ...] | None
