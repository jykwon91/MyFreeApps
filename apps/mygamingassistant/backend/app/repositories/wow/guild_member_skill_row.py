"""One profession skill of a stored guild member, as ``guild_repo.member_skills`` reads it."""
from __future__ import annotations

from typing import NamedTuple


class GuildMemberSkillRow(NamedTuple):
    slug: str
    # Blizzard's profession id (the client's SkillLine id).
    profession_id: int
    skill: int
    max_skill: int
