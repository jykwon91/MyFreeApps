"""What one house's refresh did — logged by the scheduler, printed by the CLI."""
from dataclasses import dataclass
from typing import Final

from app.services.wow.prices.mapped_house import MappedHouse

OUTCOME_UPDATED: Final = "updated"
# Blizzard listed nothing in the house; stored prices, if any, kept.
OUTCOME_EMPTY: Final = "empty"
OUTCOME_FAILED: Final = "failed"
# Another worker holds the refresh lock.
OUTCOME_LOCKED: Final = "locked"


@dataclass(frozen=True)
class FeedRefresh:
    region: str
    house: MappedHouse
    outcome: str
    item_count: int

    @property
    def label(self) -> str:
        return f"{self.region}/{self.house.label}"
