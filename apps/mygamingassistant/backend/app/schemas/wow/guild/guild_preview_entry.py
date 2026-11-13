"""One podium row on the guild's link-preview card."""
from dataclasses import dataclass


@dataclass(frozen=True)
class GuildPreviewEntry:
    rank: int
    name: str
    class_name: str | None
    value: int
