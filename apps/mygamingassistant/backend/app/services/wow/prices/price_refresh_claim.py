"""Whether an on-demand price refresh may run now, and for which house."""
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from app.services.wow.prices.mapped_house import MappedHouse

ClaimStatus = Literal["started", "cooldown", "refreshing"]


@dataclass(frozen=True)
class PriceRefreshClaim:
    house: MappedHouse
    # started: the caller now owns the refresh and must run it; cooldown: asked for too recently;
    # refreshing: another refresh holds the game's lock.
    status: ClaimStatus
    # Seconds until the house can be refreshed again.
    retry_after_seconds: int
    # When started: the stamp this claim put on ``checked_at``, and what it replaced (None = unset),
    # so a refresh that never stored a result can hand the cooldown back.
    claimed_at: datetime | None = None
    previous_checked_at: datetime | None = None
