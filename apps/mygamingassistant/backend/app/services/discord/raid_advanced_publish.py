"""The raid posts a server default reaches, re-rendered after /raid-admin advanced changes it.

A raid follows the server while its own column is NULL, so a change to the
server's allowed roles shows on those raids' posts ("Open to").
:func:`refresh_following` re-renders the open ones — posted, not started —
up to ``REFRESH_CAP``, soonest first, one after another (about one PATCH
each); any others catch up on their next refresh.
"""
from __future__ import annotations

import logging
import uuid
from typing import Final

from app.db.session import unit_of_work
from app.repositories.wow import wow_raid_advanced_repo
from app.services.discord import raid_publisher

logger = logging.getLogger(__name__)

# The most posts one server change re-renders.
REFRESH_CAP: Final = 25


async def refresh_following(guild_id: uuid.UUID, column: str) -> None:
    """Re-render the posts of the guild's open raids that leave *column* to the server.  Never raises."""
    try:
        async with unit_of_work() as db:
            event_ids = await wow_raid_advanced_repo.list_open_following(db, guild_id, column, limit=REFRESH_CAP)
        for event_id in event_ids:
            await raid_publisher.refresh_public_message(event_id)
    except Exception:
        logger.exception("Raid bot: refreshing the raid posts that follow guild %s's %s failed", guild_id, column)
