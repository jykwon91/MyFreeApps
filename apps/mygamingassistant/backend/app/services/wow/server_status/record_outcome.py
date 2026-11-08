"""What one region's recording did — logged by the scheduler, printed by the CLI."""
from dataclasses import dataclass
from typing import Final

OUTCOME_RECORDED: Final = "recorded"
# Blizzard answered with no rulesets for the region; nothing stored.
OUTCOME_EMPTY: Final = "empty"
# Blizzard couldn't be reached or answered with errors; nothing stored (a gap
# in the history, never "down").
OUTCOME_FAILED: Final = "failed"
# Another worker holds this region's recording lock.
OUTCOME_LOCKED: Final = "locked"


@dataclass(frozen=True)
class RegionRecordOutcome:
    region: str
    outcome: str
    # Rows written: status changes plus checkpoints.
    written: int
    error: str | None = None
