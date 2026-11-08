"""What one feed's refresh did — logged by the scheduler, printed by the CLI."""
from dataclasses import dataclass
from typing import Final

OUTCOME_UPDATED: Final = "updated"
OUTCOME_NOT_MODIFIED: Final = "not_modified"
# The source answered with no prices; stored prices, if any, kept.
OUTCOME_EMPTY: Final = "empty"
OUTCOME_FAILED: Final = "failed"
# Another worker holds this feed's refresh lock.
OUTCOME_LOCKED: Final = "locked"


@dataclass(frozen=True)
class FeedRefresh:
    region: str
    source: str
    outcome: str
    item_count: int
