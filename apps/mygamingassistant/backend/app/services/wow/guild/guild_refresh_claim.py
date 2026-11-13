"""Whether an on-demand guild refresh may run now, and the guild to run it on."""
from dataclasses import dataclass
from datetime import datetime

from app.models.wow.guild import WowGuild


@dataclass(frozen=True)
class GuildRefreshClaim:
    guild: WowGuild
    # The moment of the claim: the refresh is stamped with it.
    at: datetime
    # True: the caller now owns the refresh and must run it; False: the guild is cooling down.
    started: bool
    # Seconds until the guild can be refreshed again.
    retry_after_seconds: int
