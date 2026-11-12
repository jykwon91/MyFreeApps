"""The raw Blizzard answers one character page is built from."""
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class CharacterProfile:
    profile: dict[str, Any]
    media: dict[str, Any] | None
    equipment: dict[str, Any] | None
    statistics: dict[str, Any] | None
    # None when Blizzard failed on /specializations; {} when the character has none yet.
    specializations: dict[str, Any] | None
    # None when Blizzard failed on /professions; {} when the character has none yet.
    professions: dict[str, Any] | None
    # None when Blizzard failed on /reputations; {} when the character has met no faction.
    reputations: dict[str, Any] | None
    # None when Blizzard failed on /pvp-summary; {} when it has nothing for the character.
    pvp_summary: dict[str, Any] | None
    # None when Blizzard failed on /achievements/statistics; {} when it has none yet.
    achievement_statistics: dict[str, Any] | None
    # None when Blizzard failed on /collections/mounts; {} when the character has none.
    mounts: dict[str, Any] | None
    # None when Blizzard failed on /collections/pets; {} when the character has none.
    pets: dict[str, Any] | None
