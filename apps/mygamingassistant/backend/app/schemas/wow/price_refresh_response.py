"""The answer to POST /wow/prices/refresh ("Refresh now" on the Auction house page)."""
from typing import Literal

from pydantic import BaseModel


class WowPriceRefreshResponse(BaseModel):
    # started: the house is being pulled from Blizzard in the background; cooldown: it was asked
    # for too recently; refreshing: a scheduled refresh is already running, so it will land on its own.
    status: Literal["started", "cooldown", "refreshing"]
    # Seconds until the house can be refreshed again (once started, the full cooldown; 0 while refreshing).
    retry_after_seconds: int
