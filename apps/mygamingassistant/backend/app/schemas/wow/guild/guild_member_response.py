"""One stored member of a guild, for the guild page's member list and leaderboards."""
from datetime import datetime

from pydantic import BaseModel

from app.schemas.wow.guild.guild_member_skill_response import GuildMemberSkillResponse


class GuildMemberResponse(BaseModel):
    slug: str
    name: str
    surname: str
    # Blizzard's class name ("Warlock"); None when the stored sheet has none.
    class_name: str | None
    # The numbers below are from the member's newest stored day; None = Blizzard
    # never sent that number (never 0 for "unknown").
    level: int | None
    item_level: int | None
    honorable_kills: int | None
    killing_blows: int | None
    deaths_from_players: int | None
    total_kills: int | None
    total_deaths: int | None
    # Tracked dungeons with a final-boss kill.
    dungeons_done: int | None
    exalted_reputations: int | None
    # From the newest stored day that has professions; [] when none is stored.
    professions: list[GuildMemberSkillResponse]
    # 0 = guild master; None until the roster refresh has ranked the member.
    rank: int | None
    # When the member's character was last fetched from Blizzard.
    refreshed_at: datetime
