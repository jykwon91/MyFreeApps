"""When a ruleset's current status began, as far as the recorded history shows."""
from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class StatusStreak:
    since: datetime
    # False when no other status is on record, so ``since`` is only the oldest
    # row we still have ("up for at least …").
    exact: bool
