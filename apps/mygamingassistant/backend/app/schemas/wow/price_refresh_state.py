"""GET /wow/prices/refresh — what the Auction house page needs to run "Refresh now"."""
from datetime import datetime

from pydantic import BaseModel


class WowPriceRefreshState(BaseModel):
    # When Blizzard took the snapshot behind the stored prices. A refresh that leaves it unchanged
    # found nothing newer. None = no prices yet.
    source_updated_at: datetime | None
    # When we last stored a download of this house (moves on every successful refresh, newer snapshot or not).
    fetched_at: datetime | None
    # When "Refresh now" works again (the last time the house was asked for + the cooldown). None = now.
    refresh_available_at: datetime | None
    # When the last refresh failed; None once a later one worked. It changes with each failed try.
    refresh_failed_at: datetime | None
