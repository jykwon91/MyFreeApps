"""The words of Copy raid and Repeat — on Raid: Edit's card, the Repeat card,
``/raid-admin repeats`` and the DM when a repeat stops.

Titles come in already escaped (``raid_text.title_text``).
"""
from __future__ import annotations

from datetime import datetime
from typing import Final

from platform_shared.services.discord import MISSING_ACCESS, MISSING_PERMISSIONS, UNKNOWN_CHANNEL

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_series import WowRaidSeries
from app.services.discord.raid_views import unix
from app.services.wow import raid_repeat
from app.services.wow.raid_deadline import deadline_words

NOT_PERMITTED_COPY: Final = "Copying raids needs the Manage Events permission, like scheduling them."
NOT_PERMITTED_REPEAT: Final = "Repeating raids needs the Manage Events permission, like scheduling them."
COPY_MODAL: Final = "Copy raid"

# The Repeat card
REPEAT_BUTTON: Final = "Repeat"
REPEAT_THIS: Final = "Repeat this raid"
OFF: Final = (
    "**Repeat:** off. Pick how often to post this raid again. "
    "Each new raid copies the latest one: its settings, not its sign-ups."
)
EVERY_PLACEHOLDER: Final = "How often?"
AHEAD_PLACEHOLDER: Final = "When should I post each one?"
OTHER: Final = "Other…"
NEXT_BUTTON: Final = "Change next date"
STOP_BUTTON: Final = "Stop repeating"
AHEAD_CLEARED: Final = "Each raid now posts when the one before starts: it can't post further ahead than that."
DAYS_ERROR: Final = "Pick a number of days from 1 to 28."
STOPPED: Final = "Stopped. No new raids will post; the ones already posted stay."
BUSY: Final = "I'm posting the next raid in this repeat right now. Try again in a few seconds."
DELETE_NOTE: Final = (
    "**This raid repeats.** Deleting it doesn't stop new ones: they copy the latest raid left in the repeat, "
    "and the repeat ends when none is left. To stop it now: **Repeat** → **Stop repeating**."
)

# Forms
DAYS_MODAL: Final = "How often?"
DAYS_LABEL: Final = "Repeat every how many days?"
DAYS_HINT: Final = "A number from 1 to 28."
NEXT_MODAL: Final = "Change next date"

# /raid-admin repeats
REPEATS_NONE: Final = (
    "No raids repeat in this server. To repeat one, right-click its post → Apps → **Raid: Edit** → **Repeat**."
)
PICK_PLACEHOLDER: Final = "Pick a repeating raid"


def copied(title: str) -> str:
    """Above the create preview of a copy."""
    return f"A copy of **{title}**. Nobody's signed up yet. Check it, then **Post raid**."


def repeat_lines(event: WowRaidEvent) -> list[str]:
    """The edit card's Repeat line, while the raid is in a repeat."""
    if event.series_id is None:
        return []
    return ["**Repeat:** on"]


def posts_words(post_at: datetime, now: datetime) -> str:
    """When a raid posts: '<t:…:R>', or 'within a minute' once that's past (the worker's next tick)."""
    if post_at <= now:
        return "within a minute"
    return f"<t:{unix(post_at)}:R>"


def on_lines(series: WowRaidSeries, template: WowRaidEvent | None, now: datetime) -> list[str]:
    """The Repeat card while it's on: how often, the next raid, what it copies, and a heads-up on a conflict."""
    ahead = raid_repeat.ahead_words(series.post_ahead_hours)
    lines = [
        f"**Repeat:** {raid_repeat.every_words(series.every_days)}, each posted {ahead}.",
        f"**Next raid:** <t:{unix(series.next_starts_at)}:F>, posts {posts_words(raid_repeat.post_at(series), now)}",
    ]
    if template is None:
        return lines
    lines.append(
        f"**Copies:** the latest raid in the repeat (<t:{unix(template.starts_at)}:F>): its settings, not its "
        "sign-ups. Edit it to change the ones after it."
    )
    minutes = template.signup_deadline_minutes
    hours = raid_repeat.ahead_hours(series)
    if minutes is not None and raid_repeat.ahead_conflict(hours, minutes):
        lines.append(
            f"**Heads up:** sign-ups close {deadline_words(minutes)} before each raid but each posts "
            f"{raid_repeat.span_words(hours)} before, so it posts closed."
        )
    return lines


def started(title: str, every_days: int, post_at: datetime, now: datetime) -> str:
    every = raid_repeat.every_words(every_days)
    return f"**{title}** now repeats {every}. The next one posts {posts_words(post_at, now)}."


def every_set(every_days: int, next_starts_at: datetime) -> str:
    return f"Now {raid_repeat.every_words(every_days)}. Next raid: <t:{unix(next_starts_at)}:F>."


def ahead_set(hours: int | None, post_at: datetime, now: datetime) -> str:
    return f"Each raid now posts {raid_repeat.ahead_words(hours)}. The next one posts {posts_words(post_at, now)}."


def conflict(minutes: int) -> str:
    """A post-ahead too short for the raid's deadline."""
    return (
        f"Sign-ups close {deadline_words(minutes)} before the start, so each raid has to post earlier than that. "
        "Pick an earlier time, or shorten the Deadline first."
    )


def every_conflict(minutes: int, every_days: int) -> str:
    """An interval too short for the raid's deadline: no raid could post early enough."""
    span = raid_repeat.span_words(raid_repeat.ahead_or_interval(None, every_days))
    return (
        f"Sign-ups close {deadline_words(minutes)} before the start, so each raid has to post earlier than that, "
        f"and a raid that repeats {raid_repeat.every_words(every_days)} posts at most {span} before. "
        "Pick a longer time between raids, or shorten the Deadline first."
    )


def too_long(every_days: int) -> str:
    span = raid_repeat.span_words(raid_repeat.ahead_or_interval(None, every_days))
    return (
        f"This raid repeats {raid_repeat.every_words(every_days)}, so each one can post at most {span} "
        "before it starts. Pick a shorter time."
    )


def skipped(old: datetime, new: datetime, post_at: datetime, now: datetime) -> str:
    return f"Skipped <t:{unix(old)}:F>. Next raid: <t:{unix(new)}:F>, posts {posts_words(post_at, now)}."


def next_set(starts_at: datetime, every_days: int) -> str:
    return f"The next raid is <t:{unix(starts_at)}:F>, then {raid_repeat.every_words(every_days)} at that time."


def next_deadline_passed(minutes: int) -> str:
    return (
        f"Sign-ups would already be closed then (they close {deadline_words(minutes)} before the start). "
        "Pick a later time."
    )


def repeats_header(count: int) -> str:
    """Above ``/raid-admin repeats``'s menu."""
    if count == 1:
        return "**1 raid repeats in this server.** Pick it to see or change it."
    return f"**{count} raids repeat in this server.** Pick one to see or change it."


def stop_reason(channel_id: str | None, status: int | None, code: int | None) -> str:
    """Why a repeat's post failed, from Discord's answer (*status* None: it broke on our side)."""
    if status is None:
        return "something went wrong posting it"
    if code in (MISSING_ACCESS, MISSING_PERMISSIONS) and channel_id:
        return f"I don't have permission to post in <#{channel_id}>"
    if code == UNKNOWN_CHANNEL:
        return "I can't find its channel anymore"
    return "Discord didn't accept the post"


def stopped_dm(title: str, reason: str, link: str | None) -> str:
    """The DM to a repeat's creator when its post failed and it stopped."""
    text = (
        f"I couldn't post the next **{title}**, so its repeat has stopped: {reason}. Once that's fixed, turn it "
        "back on: right-click the raid's post → Apps → **Raid: Edit** → **Repeat**."
    )
    if link is None:
        return text
    return f"{text}\n{link}"
