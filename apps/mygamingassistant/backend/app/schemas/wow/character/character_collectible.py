"""One mount or pet a character has collected."""
from pydantic import BaseModel


class CharacterCollectible(BaseModel):
    # Blizzard's mount id or pet species id.
    id: int
    name: str
    # How many the character has (pets can be learned more than once); mounts are always 1.
    count: int
