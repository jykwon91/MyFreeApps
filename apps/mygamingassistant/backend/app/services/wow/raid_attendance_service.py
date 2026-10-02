"""Raid attendance — writes and reads, through the repositories only.

``record`` freezes a raid's sign-ups as its attendance: the worker's sweep at
completion, or a leader's [Record now].  Leaders then correct the record:
``set_outcome`` on a player's row (``player_mark``), ``add_players``
(walk-ins), ``drop_player`` (a walk-in added by mistake), and ``set_counted``
before or after.  ``window`` and ``player_window`` read the last N counted
raids; ``raid_sheet`` one raid's sign-ups and rows (its card and its export,
``exported_raid``).

Every write runs under the raid's row lock (``load_led_event(lock=True)``, or
the sweep's SKIP LOCKED), so two leaders' changes serialise; the unique
(raid, player) key with ON CONFLICT DO NOTHING is the backstop.
"""
from __future__ import annotations

import dataclasses
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_attendance import WowRaidAttendance
from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.repositories.wow import wow_raid_attendance_repo, wow_raid_event_repo, wow_raid_signup_repo
from app.services.wow.raid_attendance import WindowQuery, snapshot

NotRecorded = Literal["not_recorded"]


@dataclass(frozen=True)
class Window:
    """The last N counted raids (newest first) and their rows."""

    raids: list[WowRaidEvent]
    marks: list[WowRaidAttendance]


@dataclass(frozen=True)
class RaidSheet:
    """One raid's sign-ups (in sign-up order) and its attendance rows (none until recorded)."""

    signups: list[WowRaidSignup]
    marks: list[WowRaidAttendance]


async def record(db: AsyncSession, event: WowRaidEvent, now: datetime) -> int:
    """Freeze the raid's sign-ups as its attendance and stamp it; returns how many rows went in."""
    signups = await wow_raid_signup_repo.list_for_event(db, event.id)
    rows = [dataclasses.asdict(row) for row in snapshot(signups)]
    added = await wow_raid_attendance_repo.add_many(db, event.id, rows)
    await wow_raid_event_repo.set_attendance_recorded(db, event, now)
    return added


async def player_mark(db: AsyncSession, event: WowRaidEvent, member: str) -> WowRaidAttendance | None:
    """*member*'s row on the raid; None when they aren't on it (or it isn't recorded yet)."""
    return await wow_raid_attendance_repo.get(db, event_id=event.id, discord_user_id=member)


async def set_outcome(db: AsyncSession, mark: WowRaidAttendance, outcome: str, *, by: str, now: datetime) -> None:
    """A leader marking one player; their change (who, when) is kept on the row."""
    await wow_raid_attendance_repo.set_outcome(db, mark, outcome, by=by, at=now)


async def add_players(
    db: AsyncSession, event: WowRaidEvent, picks: Sequence[tuple[str, str]], *, by: str, now: datetime
) -> tuple[list[str], list[str]] | NotRecorded:
    """Add walk-ins (*picks* are (user id, name), bots already left out) as attended.

    Returns the names added and the names already listed.
    """
    if event.attendance_recorded_at is None:
        return "not_recorded"
    added: list[str] = []
    already: list[str] = []
    for member, name in picks:
        inserted = await wow_raid_attendance_repo.add(
            db,
            event_id=event.id,
            discord_user_id=member,
            display_name=name,
            outcome="attended",
            marked_by_user_id=by,
            marked_at=now,
        )
        if inserted:
            added.append(name)
        else:
            already.append(name)
    return added, already


async def drop_player(db: AsyncSession, mark: WowRaidAttendance) -> bool:
    """Take a walk-in off the record; False for a player who signed up (they stay: mark them instead)."""
    if mark.signup_status is not None:
        return False
    await wow_raid_attendance_repo.delete(db, mark)
    return True


async def set_counted(db: AsyncSession, event: WowRaidEvent, counted: bool) -> None:
    """Whether the raid counts toward attendance."""
    await wow_raid_event_repo.set_attendance_counted(db, event, counted)


async def window(db: AsyncSession, guild_id: uuid.UUID, query: WindowQuery) -> Window:
    """The guild's last ``query.count`` counted, recorded raids (of ``query.raid_key`` if set) and their rows."""
    raids = await wow_raid_event_repo.list_counted_window(db, guild_id, raid_key=query.raid_key, limit=query.count)
    marks = await wow_raid_attendance_repo.list_for_events(db, [event.id for event in raids])
    return Window(raids=raids, marks=marks)


async def player_window(db: AsyncSession, guild_id: uuid.UUID, query: WindowQuery, member: str) -> Window:
    """The same window with only *member*'s rows."""
    raids = await wow_raid_event_repo.list_counted_window(db, guild_id, raid_key=query.raid_key, limit=query.count)
    marks = await wow_raid_attendance_repo.list_for_events(db, [event.id for event in raids], member=member)
    return Window(raids=raids, marks=marks)


async def raid_record(db: AsyncSession, event: WowRaidEvent) -> list[WowRaidAttendance]:
    """The raid's attendance rows (none until it's recorded)."""
    return await wow_raid_attendance_repo.list_for_event(db, event.id)


async def raid_sheet(db: AsyncSession, event: WowRaidEvent) -> RaidSheet:
    """The raid's sign-ups and attendance rows."""
    signups = await wow_raid_signup_repo.list_for_event(db, event.id)
    return RaidSheet(signups=signups, marks=await raid_record(db, event))


async def exported_raid(db: AsyncSession, event_id: uuid.UUID) -> tuple[WowRaidEvent, RaidSheet] | None:
    """A raid and its sheet for its CSV; None when it's gone since the click (or is a draft)."""
    event = await wow_raid_event_repo.get(db, event_id)
    if event is None or event.status == "draft":
        return None
    return event, await raid_sheet(db, event)


async def window_signups(db: AsyncSession, raids: Sequence[WowRaidEvent]) -> dict[uuid.UUID, list[WowRaidSignup]]:
    """The sign-ups of every raid in a window, by raid id (the long export file)."""
    return await wow_raid_signup_repo.list_for_events(db, [event.id for event in raids])
