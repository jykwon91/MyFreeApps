"""WowRaidEvent repository — ORM operations for ``wow_raid_event``.

Standalone async functions; the caller owns the transaction.
"""
from __future__ import annotations

import copy
import uuid
from datetime import datetime
from typing import Final

from sqlalchemy import ColumnElement, Interval, func, literal_column, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent

# A sign-up deadline is stored in minutes: it falls at starts_at - minutes * this.
_MINUTE: Final = literal_column("interval '1 minute'", Interval())
# What a copy of a raid keeps (Copy raid): its settings.  Never its sign-ups, post,
# start, status or state (closed, cancelled, the sweeps' stamps), nor who made it.
COPIED: Final = (
    "raid_key", "title", "size_cap", "notes", "leader_user_id", "leader_display_name", "image_url", "color",
    "mention_role_ids", "role_limits", "class_limits", "signup_deadline_minutes", "signup_notes_enabled",
    "discord_event_enabled", "thread_enabled", "length_minutes",
)


async def create(
    db: AsyncSession,
    *,
    guild_id: uuid.UUID,
    raid_key: str,
    starts_at: datetime,
    size_cap: int,
    channel_id: str,
    created_by_user_id: str,
    title: str | None = None,
    notes: str | None = None,
    status: str = "scheduled",
    created_by_display_name: str | None = None,
    discord_event_enabled: bool = False,
    thread_enabled: bool = False,
) -> WowRaidEvent:
    """Insert a new raid event and flush.

    ``status="draft"`` is used by /raid-admin create: the row backs the
    organiser's private preview until they press [Post raid].  The extras'
    toggles come from the server's defaults.
    """
    row = WowRaidEvent(
        guild_id=guild_id,
        raid_key=raid_key,
        title=title,
        starts_at=starts_at,
        size_cap=size_cap,
        status=status,
        channel_id=channel_id,
        created_by_user_id=created_by_user_id,
        created_by_display_name=created_by_display_name,
        notes=notes,
        discord_event_enabled=discord_event_enabled,
        thread_enabled=thread_enabled,
    )
    db.add(row)
    await db.flush()
    return row


async def create_copy(
    db: AsyncSession,
    source: WowRaidEvent,
    *,
    starts_at: datetime,
    status: str,
    channel_id: str,
    created_by_user_id: str,
    created_by_display_name: str | None,
    series_id: uuid.UUID | None = None,
) -> WowRaidEvent:
    """Insert a raid with *source*'s settings (``COPIED``) at *starts_at* and flush; nobody is signed up.

    JSON values are deep-copied.  A None is left out so its column stays SQL
    NULL: plain JSONB would store JSON null, which the check constraints refuse.
    *series_id* puts it in a repeat (the raids a repeat posts).
    """
    kept = {name: copy.deepcopy(value) for name in COPIED if (value := getattr(source, name)) is not None}
    row = WowRaidEvent(
        guild_id=source.guild_id,
        starts_at=starts_at,
        status=status,
        channel_id=channel_id,
        created_by_user_id=created_by_user_id,
        created_by_display_name=created_by_display_name,
        series_id=series_id,
        **kept,
    )
    db.add(row)
    await db.flush()
    return row


async def get(db: AsyncSession, event_id: uuid.UUID) -> WowRaidEvent | None:
    """Return a single event by primary key."""
    return await db.get(WowRaidEvent, event_id)


async def get_for_update(
    db: AsyncSession, event_id: uuid.UUID
) -> WowRaidEvent | None:
    """Return the event with a row lock (SELECT … FOR UPDATE).

    Every signup mutation locks its event first so concurrent clicks on the
    same raid serialise — two players can't both take the last seat.
    ``populate_existing`` refreshes an already-loaded instance.
    """
    result = await db.execute(
        select(WowRaidEvent)
        .where(WowRaidEvent.id == event_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


async def get_by_message_id(
    db: AsyncSession, *, guild_id: uuid.UUID, message_id: str, lock: bool = False
) -> WowRaidEvent | None:
    """The guild's event whose raid post is *message_id*, or None.

    How the raid post's right-click menu finds its raid.  ``lock=True``
    takes the same row lock as :func:`get_for_update`.
    """
    stmt = select(WowRaidEvent).where(
        WowRaidEvent.guild_id == guild_id,
        WowRaidEvent.message_id == message_id,
    )
    if lock:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    result = await db.execute(stmt)
    return result.scalars().first()


async def delete(db: AsyncSession, event: WowRaidEvent) -> None:
    """Hard-delete an event: a discarded draft, or Raid: Edit → Delete raid."""
    await db.delete(event)
    await db.flush()


async def list_upcoming(
    db: AsyncSession,
    guild_id: uuid.UUID,
    *,
    after: datetime | None = None,
    limit: int = 20,
) -> list[WowRaidEvent]:
    """Return scheduled events for *guild_id* ordered by ``starts_at`` ASC.

    If *after* is given, only events starting after that timestamp are
    returned (useful for cursor-based pagination).
    """
    stmt = (
        select(WowRaidEvent)
        .where(
            WowRaidEvent.guild_id == guild_id,
            WowRaidEvent.status == "scheduled",
        )
        .order_by(WowRaidEvent.starts_at)
        .limit(limit)
    )
    if after is not None:
        stmt = stmt.where(WowRaidEvent.starts_at > after)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def list_scheduled_starting_after(
    db: AsyncSession, *, after: datetime
) -> list[WowRaidEvent]:
    """Every guild's ``scheduled`` events starting after *after*, soonest first.

    Ties go by id, so concurrent workers visit the events in the same order.
    """
    result = await db.execute(
        select(WowRaidEvent)
        .where(
            WowRaidEvent.status == "scheduled",
            WowRaidEvent.starts_at > after,
        )
        .order_by(WowRaidEvent.starts_at, WowRaidEvent.id)
    )
    return list(result.scalars().all())


async def set_message_id(
    db: AsyncSession, event: WowRaidEvent, message_id: str
) -> WowRaidEvent:
    """Persist the Discord message ID of the signup embed."""
    event.message_id = message_id
    await db.flush()
    return event


async def clear_message_id(db: AsyncSession, event: WowRaidEvent) -> WowRaidEvent:
    """Forget the raid's post: it was deleted, and the raid isn't posted again."""
    event.message_id = None
    await db.flush()
    return event


async def latest_in_series(db: AsyncSession, series_id: uuid.UUID) -> WowRaidEvent | None:
    """The repeat's latest raid (by start, ties by id, any status): what its next raid copies."""
    result = await db.execute(
        select(WowRaidEvent)
        .where(WowRaidEvent.series_id == series_id)
        .order_by(WowRaidEvent.starts_at.desc(), WowRaidEvent.id.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def set_series(db: AsyncSession, event: WowRaidEvent, series_id: uuid.UUID) -> WowRaidEvent:
    """Put the raid in a repeat: the raid a repeat is turned on from."""
    event.series_id = series_id
    await db.flush()
    return event


async def refresh_series(db: AsyncSession, event: WowRaidEvent) -> WowRaidEvent:
    """Re-read the raid's series_id: deleting its repeat cleared it in the database (ON DELETE SET NULL)."""
    await db.refresh(event, attribute_names=["series_id"])
    return event


async def set_role_limits(
    db: AsyncSession, event: WowRaidEvent, limits: dict[str, int] | None
) -> WowRaidEvent:
    """Persist how many may come as each role; None = no limits (SQL NULL)."""
    event.role_limits = limits
    await db.flush()
    return event


async def set_class_limits(
    db: AsyncSession, event: WowRaidEvent, limits: dict[str, int] | None
) -> WowRaidEvent:
    """Persist how many may come in each class column; None = no limits (SQL NULL)."""
    event.class_limits = limits
    await db.flush()
    return event


async def set_signup_notes_enabled(db: AsyncSession, event: WowRaidEvent, enabled: bool) -> WowRaidEvent:
    """Persist whether members can leave the leader a note (off hides the notes, keeping them)."""
    event.signup_notes_enabled = enabled
    await db.flush()
    return event


async def set_signup_deadline(db: AsyncSession, event: WowRaidEvent, minutes: int | None) -> WowRaidEvent:
    """Persist how long before the start sign-ups close (None = at the start), to be applied afresh."""
    event.signup_deadline_minutes = minutes
    event.deadline_applied_at = None
    await db.flush()
    return event


async def set_close_state(
    db: AsyncSession,
    event: WowRaidEvent,
    *,
    closed_at: datetime | None,
    close_reason: str | None,
    applied_at: datetime | None,
) -> WowRaidEvent:
    """Persist whether sign-ups are closed, who closed them, and when the deadline was applied."""
    event.closed_at = closed_at
    event.close_reason = close_reason
    event.deadline_applied_at = applied_at
    await db.flush()
    return event


async def set_start_applied(db: AsyncSession, event: WowRaidEvent, at: datetime | None) -> WowRaidEvent:
    """Persist when the post was re-rendered as started; None once the raid moves into the future."""
    event.start_applied_at = at
    await db.flush()
    return event


async def set_extras_options(
    db: AsyncSession, event: WowRaidEvent, *, discord_event: bool, thread: bool, length_minutes: int | None
) -> WowRaidEvent:
    """Persist the leader's Event & thread choices: the two toggles and the length (None = 3 hours)."""
    event.discord_event_enabled = discord_event
    event.thread_enabled = thread
    event.length_minutes = length_minutes
    await db.flush()
    return event


async def claim_discord_event(db: AsyncSession, event: WowRaidEvent, now: datetime) -> WowRaidEvent:
    """Mark a Discord event create in flight, so a second sync doesn't make another."""
    event.discord_event_claimed_at = now
    await db.flush()
    return event


async def set_discord_event_state(
    db: AsyncSession,
    event: WowRaidEvent,
    *,
    event_id: str | None,
    digest: str | None,
    starts_at: datetime | None,
    error: int | None,
    claimed_at: datetime | None = None,
) -> WowRaidEvent:
    """Persist the raid's Discord event: its id, the payload Discord took, its start, a refusal, a create in flight."""
    event.discord_event_id = event_id
    event.discord_event_digest = digest
    event.discord_event_starts_at = starts_at
    event.discord_event_error = error
    event.discord_event_claimed_at = claimed_at
    await db.flush()
    return event


async def set_thread_state(
    db: AsyncSession, event: WowRaidEvent, *, thread_id: str | None, name: str | None, error: int | None
) -> WowRaidEvent:
    """Persist the raid's thread: its id, the name the bot gave it (None = not the bot's) and a refusal."""
    event.thread_id = thread_id
    event.thread_name = name
    event.thread_error = error
    await db.flush()
    return event


async def cancel(db: AsyncSession, event: WowRaidEvent) -> WowRaidEvent:
    """Transition event to 'cancelled'."""
    event.status = "cancelled"
    await db.flush()
    return event


async def mark_completed(
    db: AsyncSession, event: WowRaidEvent
) -> WowRaidEvent:
    """Transition event to 'completed'."""
    event.status = "completed"
    await db.flush()
    return event


async def complete_started_events(db: AsyncSession, *, started_before: datetime) -> int:
    """Flip every ``scheduled`` event that started before *started_before* to ``completed``.

    Run by the notification worker each tick so finished raids drop out of
    ``scheduled`` (listings, autocomplete, the worker's own sends).  Returns
    the number of events completed.
    """
    result = await db.execute(
        update(WowRaidEvent)
        .where(
            WowRaidEvent.status == "scheduled",
            WowRaidEvent.starts_at < started_before,
        )
        .values(status="completed", updated_at=func.now())
    )
    await db.flush()
    return result.rowcount or 0


async def lock_deadline_due(db: AsyncSession, now: datetime) -> WowRaidEvent | None:
    """The soonest scheduled raid whose sign-up deadline has passed unapplied, before its start; row-locked.

    The notification worker's deadline sweep (``raid_sweeps``) takes them one at a time.
    """
    deadline = WowRaidEvent.starts_at - WowRaidEvent.signup_deadline_minutes * _MINUTE
    return await _lock_first_scheduled(
        db,
        WowRaidEvent.signup_deadline_minutes.is_not(None),
        WowRaidEvent.deadline_applied_at.is_(None),
        WowRaidEvent.starts_at > now,
        deadline <= now,
    )


async def lock_start_due(db: AsyncSession, now: datetime) -> WowRaidEvent | None:
    """The soonest scheduled raid that has started but whose post isn't shown as started yet; row-locked."""
    return await _lock_first_scheduled(db, WowRaidEvent.start_applied_at.is_(None), WowRaidEvent.starts_at <= now)


async def _lock_first_scheduled(db: AsyncSession, *where: ColumnElement[bool]) -> WowRaidEvent | None:
    """The soonest-starting ``scheduled`` event matching *where* (ties by id), FOR UPDATE SKIP LOCKED.

    A row another transaction holds (a sign-up, another worker) is skipped and
    taken on a later tick.  ``populate_existing`` refreshes a loaded instance.
    """
    result = await db.execute(
        select(WowRaidEvent)
        .where(WowRaidEvent.status == "scheduled", *where)
        .order_by(WowRaidEvent.starts_at, WowRaidEvent.id)
        .limit(1)
        .with_for_update(skip_locked=True)
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


async def lock_attendance_due(db: AsyncSession, now: datetime) -> WowRaidEvent | None:
    """The earliest completed raid whose attendance isn't recorded yet (ties by id), FOR UPDATE SKIP LOCKED.

    The notification worker's attendance sweep (``raid_sweeps``) takes them one at a time.  Like every
    sweep's lock it only sees raids due by *now* (here: started by then).
    """
    result = await db.execute(
        select(WowRaidEvent)
        .where(
            WowRaidEvent.status == "completed",
            WowRaidEvent.attendance_recorded_at.is_(None),
            WowRaidEvent.starts_at <= now,
        )
        .order_by(WowRaidEvent.starts_at, WowRaidEvent.id)
        .limit(1)
        .with_for_update(skip_locked=True)
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


async def set_attendance_recorded(db: AsyncSession, event: WowRaidEvent, at: datetime) -> WowRaidEvent:
    """Persist when the raid's sign-ups were frozen as its attendance."""
    event.attendance_recorded_at = at
    await db.flush()
    return event


async def set_attendance_counted(db: AsyncSession, event: WowRaidEvent, counted: bool) -> WowRaidEvent:
    """Persist whether the raid counts toward attendance."""
    event.attendance_counted = counted
    await db.flush()
    return event


async def list_counted_window(
    db: AsyncSession, guild_id: uuid.UUID, *, raid_key: str | None, limit: int
) -> list[WowRaidEvent]:
    """The guild's last *limit* completed raids that count and are recorded, newest first; *raid_key* = one raid's."""
    stmt = (
        select(WowRaidEvent)
        .where(
            WowRaidEvent.guild_id == guild_id,
            WowRaidEvent.status == "completed",
            WowRaidEvent.attendance_counted.is_(True),
            WowRaidEvent.attendance_recorded_at.is_not(None),
        )
        .order_by(WowRaidEvent.starts_at.desc(), WowRaidEvent.id.desc())
        .limit(limit)
    )
    if raid_key is not None:
        stmt = stmt.where(WowRaidEvent.raid_key == raid_key)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def list_recent(db: AsyncSession, guild_id: uuid.UUID, *, limit: int = 25) -> list[WowRaidEvent]:
    """The guild's scheduled and completed raids, latest start first (``/raid-admin export``'s raid picker)."""
    result = await db.execute(
        select(WowRaidEvent)
        .where(WowRaidEvent.guild_id == guild_id, WowRaidEvent.status.in_(("scheduled", "completed")))
        .order_by(WowRaidEvent.starts_at.desc(), WowRaidEvent.id.desc())
        .limit(limit)
    )
    return list(result.scalars().all())
