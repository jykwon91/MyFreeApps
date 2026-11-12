"""One faction's standing, as the daily history stores it."""
from dataclasses import dataclass


@dataclass(frozen=True)
class CharacterFactionStanding:
    faction_id: int
    # Stored once per faction in ``wow_faction``.
    faction_name: str
    tier: int
    value: int
    max: int
