"""One profession's skill, as the daily history stores it."""
from dataclasses import dataclass


@dataclass(frozen=True)
class CharacterProfessionLevel:
    profession_id: int
    skill: int
    max_skill: int
