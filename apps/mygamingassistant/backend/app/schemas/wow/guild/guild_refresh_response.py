"""The answer to "Refresh now" on the guild page."""
from typing import Literal

from pydantic import BaseModel


class GuildRefreshResponse(BaseModel):
    # started: the refresh runs in the background; cooldown: the guild was asked for too recently.
    status: Literal["started", "cooldown"]
    # Seconds until the guild can be refreshed again (once started, the full cooldown).
    retry_after_seconds: int
