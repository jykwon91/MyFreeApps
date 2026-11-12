"""A guild member's gains baseline: their numbers on an older stored day."""
from datetime import date

from pydantic import BaseModel


class GuildMemberBaselineResponse(BaseModel):
    # The stored day the gains boards count from.
    day: date
    # None = Blizzard didn't send that number that day.
    level: int | None
    honorable_kills: int | None
    killing_blows: int | None
    total_kills: int | None
    dungeons_done: int | None
