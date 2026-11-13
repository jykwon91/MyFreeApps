"""One podium panel on the guild's link-preview card: a title and its top rows."""
from dataclasses import dataclass

from app.schemas.wow.guild.guild_preview_entry import GuildPreviewEntry


@dataclass(frozen=True)
class GuildPreviewBoard:
    title: str
    entries: tuple[GuildPreviewEntry, ...]
