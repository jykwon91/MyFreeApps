"""Raid: Edit → [Repeat] — post a raid again every few days.

The Repeat card (``raid_repeat_views.repeat_card``) says whether the raid
repeats and changes it.  It opens from Raid: Edit's [Repeat], the "Posted"
message's [Repeat this raid] and ``/raid-admin repeats``' menu; each answer
replaces it (type 7), apart from the two forms (type 9).

* How often? while Off starts a repeat from this raid
  (``raid_series_service.start``); while On it changes the interval.
  Other… opens a form for any number of days.
* When should I post each one?, [Skip <date>], [Change next date] (a form)
  and [Stop repeating] change the repeat; [Back] shows Raid: Edit's card.

Repeating needs Manage Events, like [Post raid].  A change takes the raid's
row lock, then the repeat's with SKIP LOCKED: while the worker is posting
the repeat's next raid, the card asks to try again (``BUSY``) rather than
wait on Discord.  A raid that's cancelled or finished can be repeated too.
"""
from __future__ import annotations

import uuid
from typing import Any, Final

from fastapi import BackgroundTasks
from platform_shared.services.discord import MANAGE_EVENTS
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import unit_of_work
from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.models.wow.wow_raid_series import WowRaidSeries
from app.repositories.wow import wow_raid_series_repo
from app.services.discord import raid_copy, raid_draft_copy, raid_repeat_copy
from app.services.discord.interaction import (
    Interaction,
    ephemeral_response,
    message_response,
    update_response,
    update_text_response,
)
from app.services.discord.raid_context import load_configured_guild, load_led_event, parse_event_id, utcnow
from app.services.discord.raid_edit_views import FIELD, edit_card
from app.services.discord.raid_repeat_views import (
    OTHER_DAYS,
    ahead_value,
    repeat_card,
    repeat_days_modal,
    repeat_next_modal,
    repeats_list,
)
from app.services.wow import raid_repeat, raid_series_service
from app.services.wow.raid_custom_id import RaidCustomId
from app.services.wow.raid_series_service import SeriesChange
from app.services.wow.raid_text import title_text
from app.services.wow.raid_time_parser import RaidTimeError, parse_raid_time

# What can be repeated: a posted raid, on or over.
_REPEATABLE: Final = ("scheduled", "cancelled", "completed")
# When should I post each one? — a choice's value → its hours (None = when the one before starts).
_AHEADS: Final = {ahead_value(hours): hours for hours in raid_repeat.AHEADS}
# The verbs that only show something: the card, the Change next date form, Raid: Edit's card.
_READS: Final = ("open", "next", "back")


async def handle_repeat(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    """The Repeat card's menus and buttons, and the buttons that open it."""
    assert parsed.event_id is not None
    if not interaction.has_permission(MANAGE_EVENTS):
        return ephemeral_response(raid_repeat_copy.NOT_PERMITTED_REPEAT)
    verb = parsed.args[0]
    if verb in _READS:
        return await _show(interaction, parsed.event_id, verb)
    async with unit_of_work() as db:
        found = await load_led_event(db, interaction, parsed.event_id, lock=True, statuses=_REPEATABLE)
        if isinstance(found, str):
            return update_text_response(found)
        event, guild = found.event, found.guild
        series, busy = await _take_series(db, event)
        if busy:
            return await _busy(db, event, series)
        if verb == "every":
            return await _every(db, interaction, event, guild, series)
        if series is None:
            return update_response(repeat_card(event, None, None, now=utcnow()))  # stopped meanwhile
        if verb == "ahead":
            return await _ahead(db, interaction, event, series)
        if verb == "skip":
            return await _skip(db, event, series)
        await raid_series_service.stop(db, series, event)
        return update_response(repeat_card(event, None, None, now=utcnow(), notice=raid_repeat_copy.STOPPED))


async def handle_repeat_days_submit(
    interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks
) -> dict[str, Any]:
    """How often? → Other…'s form: repeat every 1–28 days."""
    assert parsed.event_id is not None
    if not interaction.has_permission(MANAGE_EVENTS):
        return ephemeral_response(raid_repeat_copy.NOT_PERMITTED_REPEAT)
    async with unit_of_work() as db:
        found = await load_led_event(db, interaction, parsed.event_id, lock=True, statuses=_REPEATABLE)
        if isinstance(found, str):
            return update_text_response(found)
        event = found.event
        series, busy = await _take_series(db, event)
        if busy:
            return await _busy(db, event, series)
        try:
            days = raid_repeat.parse_every(interaction.fields.get(FIELD, ""))
        except raid_repeat.RepeatError:
            template = await _template_of(db, series)
            notice = raid_repeat_copy.DAYS_ERROR
            return update_response(repeat_card(event, series, template, now=utcnow(), notice=notice))
        return await _set_every(db, interaction, event, found.guild, series, days)


async def handle_repeat_next_submit(
    interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks
) -> dict[str, Any]:
    """[Change next date]'s form: the next raid's date and time, and each one after it at that time."""
    assert parsed.event_id is not None
    if not interaction.has_permission(MANAGE_EVENTS):
        return ephemeral_response(raid_repeat_copy.NOT_PERMITTED_REPEAT)
    async with unit_of_work() as db:
        found = await load_led_event(db, interaction, parsed.event_id, lock=True, statuses=_REPEATABLE)
        if isinstance(found, str):
            return update_text_response(found)
        event, guild, now = found.event, found.guild, utcnow()
        series, busy = await _take_series(db, event)
        if busy:
            return await _busy(db, event, series)
        if series is None:
            return update_response(repeat_card(event, None, None, now=now))
        template = await raid_series_service.template(db, series)
        try:
            starts_at = parse_raid_time(interaction.fields.get(FIELD, ""), tz_name=guild.timezone, now=now)
        except RaidTimeError as exc:
            return update_response(repeat_card(event, series, template, now=now, notice=exc.user_message))
        change = await raid_series_service.set_next(db, series, starts_at, guild=guild, template=template, now=now)
        notice = raid_repeat_copy.next_set(starts_at, series.every_days)
        if change.kind == "deadline_passed":
            notice = raid_repeat_copy.next_deadline_passed(_deadline_minutes(template))
        return update_response(repeat_card(event, series, template, now=now, notice=notice))


async def handle_repeats_pick(
    interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks
) -> dict[str, Any]:
    """``/raid-admin repeats``' menu: the picked repeat's card, in place of the list."""
    if not interaction.has_permission(MANAGE_EVENTS):
        return ephemeral_response(raid_repeat_copy.NOT_PERMITTED_REPEAT)
    event_id = parse_event_id(_picked(interaction))
    if event_id is None:
        return update_text_response(raid_copy.GENERIC_ERROR)
    return await _show(interaction, event_id, "open")


async def list_repeats(interaction: Interaction) -> dict[str, Any]:
    """``/raid-admin repeats``: the server's repeats, soonest next raid first (its caller checks Manage Events)."""
    async with unit_of_work() as db:
        guild = await load_configured_guild(db, interaction)
        if guild is None:
            return ephemeral_response(raid_copy.NOT_CONFIGURED)
        listed = await wow_raid_series_repo.list_for_guild(db, guild.id)
        return message_response(repeats_list(listed))


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------


async def _show(interaction: Interaction, event_id: uuid.UUID, verb: str) -> dict[str, Any]:
    """The Repeat card ([Repeat], [Repeat this raid], a pick), the Change next date form, or Raid: Edit's card."""
    async with unit_of_work() as db:
        found = await load_led_event(db, interaction, event_id, lock=False, statuses=_REPEATABLE)
        if isinstance(found, str):
            return update_text_response(found)
        event = found.event
        if verb == "back":
            return update_response(edit_card(event))
        series = await _series_of(db, event)
        if series is not None and verb == "next":
            return repeat_next_modal(event, series, found.guild.timezone)
        template = await _template_of(db, series)
        return update_response(repeat_card(event, series, template, now=utcnow()))


async def _series_of(db: AsyncSession, event: WowRaidEvent) -> WowRaidSeries | None:
    if event.series_id is None:
        return None
    return await wow_raid_series_repo.get(db, event.series_id)


async def _template_of(db: AsyncSession, series: WowRaidSeries | None) -> WowRaidEvent | None:
    if series is None:
        return None
    return await raid_series_service.template(db, series)


async def _take_series(db: AsyncSession, event: WowRaidEvent) -> tuple[WowRaidSeries | None, bool]:
    """The raid's repeat, locked for a change, and whether the worker holds it (then it's read unlocked).

    The raid is locked, so its series_id can't be cleared meanwhile: a
    repeat SKIP LOCKED passes over is one the worker is posting.
    """
    if event.series_id is None:
        return None, False
    series = await wow_raid_series_repo.lock_for_change(db, event.series_id)
    if series is not None:
        return series, False
    held = await wow_raid_series_repo.get(db, event.series_id)
    return held, held is not None


async def _busy(db: AsyncSession, event: WowRaidEvent, series: WowRaidSeries | None) -> dict[str, Any]:
    template = await _template_of(db, series)
    return update_response(repeat_card(event, series, template, now=utcnow(), notice=raid_repeat_copy.BUSY))


# ---------------------------------------------------------------------------
# Changes
# ---------------------------------------------------------------------------


async def _every(
    db: AsyncSession, interaction: Interaction, event: WowRaidEvent, guild: WowRaidGuild, series: WowRaidSeries | None
) -> dict[str, Any]:
    """How often?: a preset (or the repeat's own interval), else Other…'s form."""
    value = _picked(interaction)
    current = None
    if series is not None:
        current = series.every_days
    if value == OTHER_DAYS:
        return repeat_days_modal(event, current)
    offered = {str(days) for days in raid_repeat.CADENCES}
    if current is not None:
        offered.add(str(current))
    if value not in offered:
        return update_text_response(raid_copy.GENERIC_ERROR)
    return await _set_every(db, interaction, event, guild, series, int(value))


async def _set_every(
    db: AsyncSession,
    interaction: Interaction,
    event: WowRaidEvent,
    guild: WowRaidGuild,
    series: WowRaidSeries | None,
    days: int,
) -> dict[str, Any]:
    """Start repeating every *days* days from this raid, or change the repeat's interval to that."""
    now = utcnow()
    if series is None:
        started = await raid_series_service.start(
            db, event=event, guild=guild, every_days=days, user_id=interaction.user_id, now=now
        )
        if started.series is None:
            notice = raid_repeat_copy.every_conflict(_deadline_minutes(event), days)
            return update_response(repeat_card(event, None, None, now=now, notice=notice))
        notice = raid_repeat_copy.started(title_text(event), days, raid_repeat.post_at(started.series), now)
        return update_response(repeat_card(event, started.series, event, now=now, notice=notice))
    template = await raid_series_service.template(db, series)
    change = await raid_series_service.set_every(db, series, every_days=days, template=template, now=now)
    return update_response(repeat_card(event, series, template, now=now, notice=_every_notice(change, days, template)))


def _every_notice(change: SeriesChange, days: int, template: WowRaidEvent | None) -> str:
    if change.kind == "same":
        return raid_draft_copy.NOTHING_CHANGED
    if change.kind == "conflict":
        minutes = _deadline_minutes(template)
        if raid_repeat.ahead_conflict(raid_repeat.ahead_or_interval(None, days), minutes):
            return raid_repeat_copy.every_conflict(minutes, days)
        return raid_repeat_copy.conflict(minutes)
    assert change.series is not None
    notice = raid_repeat_copy.every_set(days, change.series.next_starts_at)
    if change.cleared:
        return f"{notice} {raid_repeat_copy.AHEAD_CLEARED}"
    return notice


async def _ahead(
    db: AsyncSession, interaction: Interaction, event: WowRaidEvent, series: WowRaidSeries
) -> dict[str, Any]:
    """When should I post each one?: within the interval, and early enough for the raid's deadline."""
    value = _picked(interaction)
    if value not in _AHEADS:
        return update_text_response(raid_copy.GENERIC_ERROR)
    hours = _AHEADS[value]
    now = utcnow()
    template = await raid_series_service.template(db, series)
    change = await raid_series_service.set_ahead(db, series, hours=hours, template=template)
    notice = raid_repeat_copy.ahead_set(hours, raid_repeat.post_at(series), now)
    if change.kind == "same":
        notice = raid_draft_copy.NOTHING_CHANGED
    elif change.kind == "too_long":
        notice = raid_repeat_copy.too_long(series.every_days)
    elif change.kind == "conflict":
        notice = raid_repeat_copy.conflict(_deadline_minutes(template))
    return update_response(repeat_card(event, series, template, now=now, notice=notice))


async def _skip(db: AsyncSession, event: WowRaidEvent, series: WowRaidSeries) -> dict[str, Any]:
    """[Skip <date>]: the next raid not yet posted is skipped; one already posted is cancelled instead."""
    now = utcnow()
    skipped = series.next_starts_at
    await raid_series_service.skip(db, series, now)
    template = await raid_series_service.template(db, series)
    notice = raid_repeat_copy.skipped(skipped, series.next_starts_at, raid_repeat.post_at(series), now)
    return update_response(repeat_card(event, series, template, now=now, notice=notice))


def _picked(interaction: Interaction) -> str:
    """The menu's pick ('' when there's none)."""
    return next(iter(interaction.values), "")


def _deadline_minutes(raid: WowRaidEvent | None) -> int:
    """The raid's sign-up deadline in minutes: asked only after a conflict, which needs one."""
    assert raid is not None and raid.signup_deadline_minutes is not None
    return raid.signup_deadline_minutes
