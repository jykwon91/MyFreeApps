"""The raw Blizzard answers one character page is built from."""
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class CharacterProfile:
    profile: dict[str, Any]
    media: dict[str, Any] | None
    equipment: dict[str, Any] | None
