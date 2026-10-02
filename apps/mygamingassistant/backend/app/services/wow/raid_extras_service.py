"""Event & thread — the leader's choices for a raid's Discord event and thread, written through the repo.

``components/raid_extras`` calls these under the raid's row lock; the
Discord calls (``D/raid_extras``) run after the commit.  Turning an extra on
clears the code Discord last refused it with, so the next sync tries again;
Try again clears both.
"""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.repositories.wow import wow_raid_event_repo
from app.services.wow.raid_extras_rules import LengthError, parse_length


@dataclass(frozen=True)
class LengthSaved:
    """What the Length form did: ``set``, ``same`` (nothing changed), or why it didn't read
    (``format``, ``too_short``, ``too_long``).  *minutes* is what's stored (None = 3 hours)."""

    kind: str
    minutes: int | None = None

    @property
    def changed(self) -> bool:
        return self.kind == "set"


async def apply(db: AsyncSession, event: WowRaidEvent, verb: str) -> None:
    """Write a toggle (``event_on``, ``event_off``, ``thread_on``, ``thread_off``) or ``retry``."""
    discord_event = event.discord_event_enabled
    thread = event.thread_enabled
    if verb in ("event_on", "event_off"):
        discord_event = verb == "event_on"
    if verb in ("thread_on", "thread_off"):
        thread = verb == "thread_on"
    await wow_raid_event_repo.set_extras_options(
        db, event, discord_event=discord_event, thread=thread, length_minutes=event.length_minutes
    )
    if verb in ("event_on", "retry"):
        await wow_raid_event_repo.set_discord_event_state(
            db,
            event,
            event_id=event.discord_event_id,
            digest=event.discord_event_digest,
            starts_at=event.discord_event_starts_at,
            error=None,
            claimed_at=event.discord_event_claimed_at,
        )
    if verb in ("thread_on", "retry"):
        await wow_raid_event_repo.set_thread_state(
            db, event, thread_id=event.thread_id, name=event.thread_name, error=None
        )


async def set_length(db: AsyncSession, event: WowRaidEvent, text: str) -> LengthSaved:
    """The Length form's submit: how long the raid runs (empty = 3 hours)."""
    try:
        minutes = parse_length(text)
    except LengthError as exc:
        return LengthSaved(exc.kind)
    if minutes == event.length_minutes:
        return LengthSaved("same", minutes)
    await wow_raid_event_repo.set_extras_options(
        db, event, discord_event=event.discord_event_enabled, thread=event.thread_enabled, length_minutes=minutes
    )
    return LengthSaved("set", minutes)
