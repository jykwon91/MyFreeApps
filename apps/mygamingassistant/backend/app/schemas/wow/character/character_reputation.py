"""One faction's standing with a character, as the game's reputation pane shows it."""
from pydantic import BaseModel


class CharacterReputation(BaseModel):
    # Blizzard's faction id (the client's Faction table).
    id: int
    name: str
    # "Hated" … "Exalted".
    standing: str
    # 0 = Hated … 7 = Exalted.
    tier: int
    # Progress within the standing, out of ``max`` (0 at Exalted's cap).
    value: int
    max: int
