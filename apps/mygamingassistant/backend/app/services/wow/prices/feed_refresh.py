"""What one faction's refresh did — logged by the scheduler, printed by the CLI."""
from dataclasses import dataclass
from typing import Final

OUTCOME_UPDATED: Final = "updated"
# Blizzard listed nothing for the faction; stored prices, if any, kept.
OUTCOME_EMPTY: Final = "empty"
OUTCOME_FAILED: Final = "failed"
# Another worker holds the refresh lock.
OUTCOME_LOCKED: Final = "locked"


@dataclass(frozen=True)
class FeedRefresh:
    region: str
    faction: str
    outcome: str
    item_count: int
