"""A character's mounts and pets, each null when Blizzard failed to send it."""
from pydantic import BaseModel

from app.schemas.wow.character.character_collectible import CharacterCollectible


class CharacterCollections(BaseModel):
    mounts: list[CharacterCollectible] | None
    pets: list[CharacterCollectible] | None
