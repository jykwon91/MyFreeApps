"""A stored guild as one row of the guild search."""
from app.models.wow.guild import WowGuild
from app.schemas.wow.guild.guild_summary_response import GuildSummaryResponse


def to_guild_summary(guild: WowGuild) -> GuildSummaryResponse:
    return GuildSummaryResponse(
        slug=guild.slug, name=guild.name, faction=guild.faction.lower(), member_count=guild.member_count,
    )
