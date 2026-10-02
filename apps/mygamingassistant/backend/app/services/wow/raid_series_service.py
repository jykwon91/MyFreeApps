"""Copies of a raid and its repeats — the writes, through the repositories.

* :func:`copy_as_draft` — Raid: Edit → Copy raid: a draft with the raid's
  settings for the create preview; the copier makes it.
* The Repeat card (``components/raid_repeat``): :func:`start`,
  :func:`set_every`, :func:`set_ahead`, :func:`skip`, :func:`set_next` and
  :func:`stop`.  Each says what it did (:class:`SeriesChange`); a refusal
  changes nothing.
* The worker's step (``raid_repeat_publisher``): :func:`catch_up`,
  :func:`create_next`, :func:`finish_posted` and :func:`end`.

A repeat's next raid copies the latest raid in it (:func:`template`), so
editing that raid changes every one after it.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.models.wow.wow_raid_series import WowRaidSeries
from app.repositories.wow import wow_raid_event_repo, wow_raid_notification_repo, wow_raid_series_repo
from app.services.wow import raid_advanced, raid_repeat


@dataclass(frozen=True)
class SeriesChange:
    """What a Repeat card change did.

    ``kind``: ``set``; ``same`` (nothing to change); ``conflict`` (raids
    would post with sign-ups already closed); ``too_long`` (posting further
    ahead than the interval); ``deadline_passed`` (sign-ups to that raid
    would already be closed).  ``cleared``: a shorter interval cleared a
    post-ahead longer than it.
    """

    kind: str
    series: WowRaidSeries | None
    cleared: bool = False


async def copy_as_draft(
    db: AsyncSession,
    *,
    source: WowRaidEvent,
    guild: WowRaidGuild,
    starts_at: datetime,
    user_id: str,
    display_name: str,
) -> WowRaidEvent:
    """A draft of *source* at *starts_at*, for the raid channel; nobody signed up.

    The copier is its creator.  A leader the raid was handed to stays its
    leader; with none, the copier leads, as on any new raid.
    """
    assert guild.raid_channel_id is not None, "guild must be configured before creating raids"
    return await wow_raid_event_repo.create_copy(
        db,
        source,
        starts_at=starts_at,
        status="draft",
        channel_id=guild.raid_channel_id,
        created_by_user_id=user_id,
        created_by_display_name=display_name,
    )


# ---------------------------------------------------------------------------
# The Repeat card
# ---------------------------------------------------------------------------


async def start(
    db: AsyncSession,
    *,
    event: WowRaidEvent,
    guild: WowRaidGuild,
    every_days: int,
    user_id: str,
    now: datetime,
) -> SeriesChange:
    """Repeat *event* every *every_days* days, at its time of day in the server's timezone.

    Each raid posts when the one before starts.  Refused when that's too
    late for *event*'s deadline.
    """
    if raid_repeat.ahead_conflict(raid_repeat.ahead_or_interval(None, every_days), event.signup_deadline_minutes):
        return SeriesChange("conflict", None)
    start_local = raid_repeat.local_clock(event.starts_at, guild.timezone)
    series = await wow_raid_series_repo.create(
        db,
        guild_id=guild.id,
        every_days=every_days,
        next_starts_at=raid_repeat.first_after(event.starts_at, every_days, start_local, guild.timezone, now),
        start_local=start_local,
        tz_name=guild.timezone,
        created_by_user_id=user_id,
    )
    await wow_raid_event_repo.set_series(db, event, series.id)
    return SeriesChange("set", series)


async def set_every(
    db: AsyncSession,
    series: WowRaidSeries,
    *,
    every_days: int,
    template: WowRaidEvent | None,
    now: datetime,
) -> SeriesChange:
    """Repeat every *every_days* days, on from the slot before the next one.

    A post-ahead longer than the new interval is cleared (each raid then
    posts when the one before starts).
    """
    if every_days == series.every_days:
        return SeriesChange("same", series)
    ahead = series.post_ahead_hours
    cleared = not raid_repeat.ahead_fits(ahead, every_days)
    if cleared:
        ahead = None
    if _conflicts(raid_repeat.ahead_or_interval(ahead, every_days), template):
        return SeriesChange("conflict", series)
    await wow_raid_series_repo.set_cadence(
        db,
        series,
        every_days=every_days,
        post_ahead_hours=ahead,
        next_starts_at=raid_repeat.rebase(series, every_days, now),
    )
    return SeriesChange("set", series, cleared=cleared)


async def set_ahead(
    db: AsyncSession, series: WowRaidSeries, *, hours: int | None, template: WowRaidEvent | None
) -> SeriesChange:
    """Post each raid *hours* before its start; None = when the one before starts."""
    if hours == series.post_ahead_hours:
        return SeriesChange("same", series)
    if not raid_repeat.ahead_fits(hours, series.every_days):
        return SeriesChange("too_long", series)
    if _conflicts(raid_repeat.ahead_or_interval(hours, series.every_days), template):
        return SeriesChange("conflict", series)
    await wow_raid_series_repo.set_cadence(
        db, series, every_days=series.every_days, post_ahead_hours=hours, next_starts_at=series.next_starts_at
    )
    return SeriesChange("set", series)


async def skip(db: AsyncSession, series: WowRaidSeries, now: datetime) -> SeriesChange:
    """Skip the next raid not yet posted; the repeat goes on from the slot after it."""
    slot = raid_repeat.first_after(series.next_starts_at, series.every_days, series.start_local, series.tz_name, now)
    await wow_raid_series_repo.set_next(db, series, slot)
    return SeriesChange("set", series)


async def set_next(
    db: AsyncSession,
    series: WowRaidSeries,
    starts_at: datetime,
    *,
    guild: WowRaidGuild,
    template: WowRaidEvent | None,
    now: datetime,
) -> SeriesChange:
    """The next raid at *starts_at*, and each one after it at that time of day in the server's timezone.

    Refused when the latest raid's deadline would already have closed sign-ups to it.
    """
    if template is not None and raid_repeat.closed_by_then(starts_at, template.signup_deadline_minutes, now):
        return SeriesChange("deadline_passed", series)
    await wow_raid_series_repo.set_anchor(
        db,
        series,
        starts_at=starts_at,
        start_local=raid_repeat.local_clock(starts_at, guild.timezone),
        tz_name=guild.timezone,
    )
    return SeriesChange("set", series)


async def stop(db: AsyncSession, series: WowRaidSeries, event: WowRaidEvent) -> None:
    """Stop repeating; the raids already posted stay.  *event* is re-read, out of the repeat."""
    await wow_raid_series_repo.delete(db, series)
    await wow_raid_event_repo.refresh_series(db, event)


async def template(db: AsyncSession, series: WowRaidSeries) -> WowRaidEvent | None:
    """The latest raid in the repeat: what its next raid copies.  None once every raid in it is deleted."""
    return await wow_raid_event_repo.latest_in_series(db, series.id)


def _conflicts(hours: int, template: WowRaidEvent | None) -> bool:
    return template is not None and raid_repeat.ahead_conflict(hours, template.signup_deadline_minutes)


# ---------------------------------------------------------------------------
# The worker's step
# ---------------------------------------------------------------------------


async def catch_up(db: AsyncSession, series: WowRaidSeries, now: datetime) -> bool:
    """Move a next raid whose start has passed (downtime) on past *now*: missed raids are never posted.

    False when the raid it lands on isn't due to post yet.
    """
    if series.next_starts_at > now:
        return True
    slot = raid_repeat.first_after(series.next_starts_at, series.every_days, series.start_local, series.tz_name, now)
    await wow_raid_series_repo.set_next(db, series, slot)
    return raid_repeat.post_at(series) <= now


def channel_for(guild: WowRaidGuild, template: WowRaidEvent) -> str:
    """Where the next raid posts: the server's raid channel now, as for [Post raid]; else the latest raid's."""
    return guild.raid_channel_id or template.channel_id


async def create_next(
    db: AsyncSession, series: WowRaidSeries, template: WowRaidEvent, channel_id: str
) -> WowRaidEvent:
    """The repeat's next raid: *template*'s settings at the next slot, in the repeat, made by *template*'s creator."""
    return await wow_raid_event_repo.create_copy(
        db,
        template,
        starts_at=series.next_starts_at,
        status="scheduled",
        channel_id=channel_id,
        created_by_user_id=template.created_by_user_id,
        created_by_display_name=template.created_by_display_name,
        series_id=series.id,
    )


async def finish_posted(
    db: AsyncSession,
    series: WowRaidSeries,
    event: WowRaidEvent,
    guild: WowRaidGuild,
    message_id: str,
    now: datetime,
) -> None:
    """After the post: keep its message, schedule its reminders, and move the repeat on a slot."""
    await wow_raid_event_repo.set_message_id(db, event, message_id)
    # The reminders raid_event_service.mark_posting schedules for [Post raid].
    await wow_raid_notification_repo.schedule_for_event(
        db, event_id=event.id, starts_at=event.starts_at, now=now,
        guild_settings=raid_advanced.notification_settings(event, guild),
    )
    slot = raid_repeat.following(event.starts_at, series.every_days, series.start_local, series.tz_name)
    await wow_raid_series_repo.set_next(db, series, slot)


async def end(db: AsyncSession, series: WowRaidSeries) -> None:
    """Delete a repeat: no raid is left to copy, or its post was refused."""
    await wow_raid_series_repo.delete(db, series)
