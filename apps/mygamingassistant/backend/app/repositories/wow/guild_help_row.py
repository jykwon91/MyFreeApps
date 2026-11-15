"""One live guild member's stored sheet, as ``guild_repo.member_sheets`` reads it."""
from __future__ import annotations

from typing import Any, NamedTuple


class GuildHelpRow(NamedTuple):
    slug: str
    class_id: int
    sheet: dict[str, Any]
    sheet_version: int
