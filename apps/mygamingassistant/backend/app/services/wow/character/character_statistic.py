"""One row of the game's statistics pane."""
from dataclasses import dataclass


@dataclass(frozen=True)
class CharacterStatistic:
    quantity: int
    # What some statistics name beside the number ("Eastern Kingdoms").
    description: str | None
