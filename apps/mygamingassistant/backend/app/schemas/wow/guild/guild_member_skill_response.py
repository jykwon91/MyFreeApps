"""One profession a guild member has learned, for the guild leaderboards."""
from pydantic import BaseModel


class GuildMemberSkillResponse(BaseModel):
    # Blizzard's profession id: the client's SkillLine id (197 Tailoring, 185 Cooking...).
    id: int
    skill: int
    # The current rank's cap (75 / 150 / 225 / 300).
    max_skill: int
