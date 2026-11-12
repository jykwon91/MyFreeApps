"""One stored guild member as ``guild_repo.members`` reads it."""
from __future__ import annotations

from datetime import datetime
from typing import NamedTuple


class GuildMemberRow(NamedTuple):
    slug: str
    name: str
    surname: str
    class_id: int
    rank: int | None
    fetched_at: datetime
    # From the member's newest daily row; None when it has none.
    level: int | None
    item_level: int | None
