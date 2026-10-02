"""Raid: Signed → [Attendance]: a raid's attendance card, its player card and its export; and the
/raid-admin attendance summary's buttons.

``at`` — the raid's leader, or anyone with Manage Events (``load_led_event``),
on a raid that's on or completed:

* ``open`` the card (and the player card's [Back]); ``who`` a player menu →
  that player's card; ``set`` / ``drop`` the player card's buttons;
* ``add`` the walk-in menu; ``record`` [Record now]; ``count`` / ``nocount``;
* ``csv`` [Export CSV]: 'thinking…' now, the file after (``raid_export``).

Writes run under the raid's row lock, so two leaders' changes take turns.
Every answer replaces the card (type 7), apart from the export's: a new
private reply (type 5) that the file lands on.

``as`` — Manage Events, re-checked: [Previous] / [Next] and [Export CSV].
The id carries the window but no raid; the server is the interaction's.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Final

from fastapi import BackgroundTasks
from platform_shared.services.discord import MANAGE_EVENTS
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import unit_of_work
from app.models.wow.wow_raid_event import WowRaidEvent
from app.services.discord import raid_attendance_copy, raid_copy, raid_export
from app.services.discord.interaction import (
    Interaction,
    deferred_ephemeral_response,
    update_response,
    update_text_response,
)
from app.services.discord.raid_attendance_views import attendance_card, player_card, summary_card
from app.services.discord.raid_context import load_configured_guild, load_led_event, utcnow
from app.services.discord.raid_views import unix
from app.services.wow import raid_attendance_service
from app.services.wow.raid_attendance import WindowQuery, can_record_now, record_due_at, shown_name
from app.services.wow.raid_custom_id import RaidCustomId, is_member_id
from app.services.wow.raid_text import escape_name

# A raid's attendance opens once it's on, and stays open once it's done.
_STATUSES: Final = ("scheduled", "completed")
# The verbs that write, under the raid's row lock.
_LOCKED: Final = ("add", "record", "count", "nocount", "set", "drop")
_COUNTED_NOTICES: Final = {True: raid_attendance_copy.NOW_COUNTED, False: raid_attendance_copy.NOW_NOT_COUNTED}


async def handle_attendance(
    interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks
) -> dict[str, Any]:
    """Every button and menu on the Attendance card and its player card."""
    assert parsed.event_id is not None
    verb, member, arg = parsed.args
    now = utcnow()
    async with unit_of_work() as db:
        found = await load_led_event(db, interaction, parsed.event_id, lock=verb in _LOCKED, statuses=_STATUSES)
        if isinstance(found, str):
            return update_text_response(found)
        event = found.event
        if verb == "csv":
            background.add_task(raid_export.export_raid, event.id, interaction.application_id, interaction.token)
            return deferred_ephemeral_response()
        if verb == "who":
            return await _player(db, event, interaction, now)
        notice = await _apply(db, event, interaction, verb, member, arg, now)
        sheet = await raid_attendance_service.raid_sheet(db, event)
        return update_response(attendance_card(event, sheet, now=now, notice=notice))


async def handle_summary(
    interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks
) -> dict[str, Any]:
    """The summary's [Previous] / [Next] (another page of it now) and [Export CSV] (its files after)."""
    verb, raid, count, bench, page = parsed.args
    query = WindowQuery.from_args(raid, count, bench)
    assert query is not None  # raid_custom_id.parse read it back
    if not interaction.has_permission(MANAGE_EVENTS):
        return update_text_response(raid_copy.NOT_PERMITTED_EVENTS)
    async with unit_of_work() as db:
        guild = await load_configured_guild(db, interaction)
        if guild is None:
            return update_text_response(raid_copy.NOT_CONFIGURED)
        if verb == "csv":
            app_id, token = interaction.application_id, interaction.token
            background.add_task(raid_export.export_window, guild.id, query, app_id, token)
            return deferred_ephemeral_response()
        window = await raid_attendance_service.window(db, guild.id, query)
    return update_response(summary_card(window, query, int(page)))


async def _player(
    db: AsyncSession, event: WowRaidEvent, interaction: Interaction, now: datetime
) -> dict[str, Any]:
    """A player menu's pick → their player card; the raid card when they've gone from it meanwhile."""
    picked = interaction.values
    if len(picked) != 1 or not is_member_id(picked[0]):
        return update_text_response(raid_copy.GENERIC_ERROR)
    mark = await raid_attendance_service.player_mark(db, event, picked[0])
    if mark is not None:
        return update_response(player_card(event, mark))
    sheet = await raid_attendance_service.raid_sheet(db, event)
    notice = raid_attendance_copy.not_listed(f"<@{picked[0]}>")
    return update_response(attendance_card(event, sheet, now=now, notice=notice))


async def _apply(
    db: AsyncSession, event: WowRaidEvent, interaction: Interaction, verb: str, member: str, arg: str, now: datetime
) -> str | None:
    """Do what *verb* asks; what the card says about it after (nothing for ``open``)."""
    if verb == "record":
        return await _record(db, event, now)
    if verb in ("count", "nocount"):
        counted = verb == "count"
        await raid_attendance_service.set_counted(db, event, counted)
        return _COUNTED_NOTICES[counted]
    if verb == "add":
        return await _add(db, event, interaction, now)
    if verb in ("set", "drop"):
        return await _change(db, event, interaction.user_id, verb, member, arg, now)
    return None


async def _record(db: AsyncSession, event: WowRaidEvent, now: datetime) -> str | None:
    """[Record now]: freeze the raid's sign-ups while it's on and started.

    A raid that finished meanwhile records itself (the card says so), so it's left to the worker.
    """
    if event.attendance_recorded_at is not None:
        return raid_attendance_copy.ALREADY_RECORDED
    if event.starts_at > now:
        return raid_attendance_copy.NOT_STARTED
    if can_record_now(event, now):
        await raid_attendance_service.record(db, event, now)
    return None


async def _add(db: AsyncSession, event: WowRaidEvent, interaction: Interaction, now: datetime) -> str:
    """The walk-in menu: everyone picked who isn't a bot or listed already goes in as attended."""
    bots = [user_id for user_id in interaction.values if interaction.resolved_is_bot(user_id)]
    picks = [
        (user_id, interaction.resolved_display_name(user_id))
        for user_id in interaction.values
        if is_member_id(user_id) and user_id not in bots
    ]
    result = await raid_attendance_service.add_players(db, event, picks, by=interaction.user_id, now=now)
    if isinstance(result, str):
        return raid_attendance_copy.not_recorded_yet(unix(record_due_at(event)))
    added, already = result
    notices = []
    if added:
        notices.append(raid_attendance_copy.added([escape_name(name) for name in added]))
    if already:
        notices.append(raid_attendance_copy.already_listed([escape_name(name) for name in already]))
    if bots:
        notices.append(raid_attendance_copy.SKIPPED_BOTS)
    return "\n".join(notices)


async def _change(
    db: AsyncSession, event: WowRaidEvent, by: str, verb: str, member: str, outcome: str, now: datetime
) -> str:
    """The player card's outcome buttons (``set``) and [Remove] (``drop``, for someone a leader added)."""
    mark = await raid_attendance_service.player_mark(db, event, member)
    if mark is None:
        return raid_attendance_copy.not_listed(f"<@{member}>")
    name = escape_name(shown_name(mark))
    if verb == "set":
        await raid_attendance_service.set_outcome(db, mark, outcome, by=by, now=now)
        return raid_attendance_copy.marked(name, outcome)
    if await raid_attendance_service.drop_player(db, mark):
        return raid_attendance_copy.removed(name)
    return raid_attendance_copy.cant_remove_signup(name)
