"""What one guild's roster refresh cost, and whether Blizzard asked us to slow down."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class GuildRefreshOutcome:
    # Members fetched from Blizzard (counts against the run's budget).
    fetched: int
    # Blizzard answered 429: the run stops here.
    rate_limited: bool
