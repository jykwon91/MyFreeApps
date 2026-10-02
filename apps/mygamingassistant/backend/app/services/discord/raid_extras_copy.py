"""What the raid bot says about a raid's Discord event and thread (Event & thread).

The card (``raid_extras_views``), its notices and the Length form; the line
the "Posted" message gains; the detail line on More options and Raid: Edit;
/raid-admin setup's report lines; and Delete raid's note when the event
stays behind.
"""
from __future__ import annotations

from datetime import datetime
from typing import Final

from platform_shared.services.discord import (
    MAX_ACTIVE_THREADS,
    MAX_SCHEDULED_EVENTS,
    MISSING_ACCESS,
    MISSING_PERMISSIONS,
    THREAD_LOCKED,
)

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.services.discord import raid_draft_copy
from app.services.discord.raid_views import unix
from app.services.wow.raid_deadline import deadline_words
from app.services.wow.raid_extras_rules import (
    DEFAULT_LENGTH,
    Step,
    Synced,
    ends_at,
    event_state,
    length_of,
    thread_state,
)
from app.services.wow.raid_extras_service import LengthSaved

BUTTON: Final = "Event & thread"
LENGTH_BUTTON: Final = "Length"
TRY_AGAIN: Final = "Try again"
CARD_PROMPT: Final = (
    "A **Discord event** lists the raid in the server's Events tab, where people can mark it Interested "
    "and get Discord's reminder. A **thread** gives it a chat under its post."
)
FIX_HINT: Final = "Fix that, then tap **Try again**. The raid itself is fine."
NOT_MADE: Final = "not made · see **Event & thread**"

# The card while the Discord calls run, by what the leader tapped.
BUSY: Final[dict[str, str]] = {
    "event_on": "Making the Discord event…",
    "event_off": "Removing the Discord event…",
    "thread_on": "Starting the thread…",
    "thread_off": "Archiving the thread…",
    "retry": "Trying again…",
    "length": "Updating the Discord event…",
}

EVENT_UP: Final = "The Discord event is up."
THREAD_UP: Final = "The thread is up."
THREAD_THEIRS: Final = (
    "The raid post already had a thread, so the raid uses it. It isn't the bot's, so I won't rename or archive it."
)
EVENT_REMOVED: Final = "Discord event removed."
THREAD_ARCHIVED: Final = "Thread archived. It stays readable, and posting in it opens it again."
EVENT_GONE: Final = "Someone deleted the raid's Discord event, so it's off now. Turn it on to make a new one."
THREAD_GONE: Final = "Someone deleted the raid's thread, so it's off now."
FAILED: Final = "Discord didn't answer. Tap **Try again**."
STARTED: Final = "The raid has started, so it won't get a Discord event."
GONE: Final = "This raid can't be changed any more."
EVENT_OFF: Final = "Discord event off."
THREAD_OFF: Final = "Thread off."
END_LEFT: Final = (
    "I couldn't remove the raid's Discord event. Someone with **Manage Events** can delete it in the server's "
    "Events tab."
)

# A toggle on a draft: nothing is made until the raid is posted.
_DRAFT: Final[dict[str, str]] = {
    "event_on": "Discord event on: I'll make it when you post the raid.",
    "thread_on": "Thread on: I'll start it under the post when you post the raid.",
    "event_off": EVENT_OFF,
    "thread_off": THREAD_OFF,
}

LENGTH_TITLE: Final = "Raid length"
LENGTH_LABEL: Final = "How long does the raid run?"
LENGTH_HINT: Final = "A number is hours. Or 90m, 2h 30m. From 15 minutes to 6 hours. Empty: 3 hours."
LENGTH_PLACEHOLDER: Final = "e.g. 3h"
_LENGTH_FIXED: Final[dict[str, str]] = {
    "same": raid_draft_copy.NOTHING_CHANGED,
    "format": "I couldn't read that length. Try 3 (hours), 90m or 2h 30m.",
    "too_short": "A raid runs at least 15 minutes.",
    "too_long": "A raid can run at most 6 hours.",
}

# What the card says after a sync the leader asked for, by what happened.
_EVENT_NOTICES: Final[dict[str, str]] = {
    "made": EVENT_UP,
    "adopted": EVENT_UP,
    "updated": EVENT_UP,
    "started": STARTED,
    "gone": EVENT_GONE,
    "failed": FAILED,
}
_THREAD_NOTICES: Final[dict[str, str]] = {
    "made": THREAD_UP,
    "updated": THREAD_UP,
    "adopted": THREAD_THEIRS,
    "gone": THREAD_GONE,
    "failed": FAILED,
}
# A toggle off that went through (``none``: there was nothing to remove).
_OFF_DONE: Final[dict[tuple[str, str], str]] = {
    ("event_off", "removed"): EVENT_REMOVED,
    ("event_off", "none"): EVENT_OFF,
    ("thread_off", "archived"): THREAD_ARCHIVED,
    ("thread_off", "none"): THREAD_OFF,
}

_EVENT_STATES: Final[dict[str, str]] = {
    "draft": "made when you post the raid",
    "busy": "on its way",
    "missing": "not made yet",
    "started": "none: the raid has started",
}
_THREAD_STATES: Final[dict[str, str]] = {
    "draft": "started under the post when you post the raid",
    "missing": "not made yet",
}
_UP_LINES: Final[dict[tuple[bool, bool], str]] = {
    (True, True): "Its Discord event and thread are up.",
    (True, False): "Its Discord event is up.",
    (False, True): "Its thread is up.",
}
_UP: Final = ("made", "adopted", "updated")
_PARTS: Final = {"event": "Discord event", "thread": "thread"}
_WHERE_TRY_AGAIN: Final = "Raid: Edit → **Event & thread** has **Try again**."


def reason(part: str, code: int | None, channel_id: str) -> str:
    """Why Discord said no to the *part* (``event`` or ``thread``), in the leader's words."""
    if code in (MISSING_ACCESS, MISSING_PERMISSIONS):
        if part == "event":
            return "the bot needs **Create Events** in this server"
        return f"the bot needs **Create Public Threads** in <#{channel_id}>"
    if code == MAX_SCHEDULED_EVENTS:
        return "the server has 100 upcoming Discord events, Discord's limit"
    if code == MAX_ACTIVE_THREADS:
        return "the server has as many active threads as Discord allows"
    if code == THREAD_LOCKED:
        return "a moderator locked the thread"
    return f"Discord said no (code {code})"


# ---------------------------------------------------------------------------
# The card
# ---------------------------------------------------------------------------


def event_line(event: WowRaidEvent, guild: WowRaidGuild, now: datetime) -> str:
    state = event_state(event, now)
    if state == "off":
        return "**Discord event:** off"
    detail = _EVENT_STATES.get(state)
    if state == "made":
        detail = f"[in the Events tab](https://discord.com/events/{guild.discord_guild_id}/{event.discord_event_id})"
    if state == "refused":
        detail = f"not made: {reason('event', event.discord_event_error, event.channel_id)}"
    return f"**Discord event:** on · {detail}"


def thread_line(event: WowRaidEvent) -> str:
    state = thread_state(event)
    if state == "off":
        return "**Thread:** off"
    detail = _THREAD_STATES.get(state)
    if state in ("made", "theirs"):
        detail = f"<#{event.thread_id}>"
    if state == "theirs":
        detail = f"{detail} · someone else's, so I leave it as it is"
    if state == "refused":
        detail = f"not made: {reason('thread', event.thread_error, event.channel_id)}"
    return f"**Thread:** on · {detail}"


def length_line(event: WowRaidEvent) -> str:
    return f"**Length:** {deadline_words(length_of(event))} · the event ends <t:{unix(ends_at(event))}:t>"


def toggle_label(name: str, enabled: bool) -> str:
    """'Discord event: on' — the toggle names where the extra stands."""
    if enabled:
        return f"{name}: on"
    return f"{name}: off"


def draft_notice(verb: str) -> str | None:
    return _DRAFT.get(verb)


def length_notice(saved: LengthSaved) -> str:
    """The card's first line after the Length form."""
    fixed = _LENGTH_FIXED.get(saved.kind)
    if fixed is not None:
        return fixed
    return f"The raid runs {deadline_words(saved.minutes or DEFAULT_LENGTH)}."


def sync_notice(verb: str, synced: Synced) -> str | None:
    """The card's first line after a sync the leader asked for; None leaves it to the card's lines."""
    notices: list[str | None] = []
    if verb in ("event_on", "retry"):
        notices.append(_EVENT_NOTICES.get(synced.event.verdict))
    if verb == "length" and synced.event.verdict in ("gone", "failed"):
        notices.append(_EVENT_NOTICES[synced.event.verdict])
    if verb in ("thread_on", "retry"):
        notices.append(_THREAD_NOTICES.get(synced.thread.verdict))
    kept = [notice for notice in dict.fromkeys(notices) if notice]
    return "\n".join(kept) or None


def off_notice(verb: str, step: Step, channel_id: str) -> str:
    """The card's first line after [Discord event: on] or [Thread: on] turned the extra off."""
    done = _OFF_DONE.get((verb, step.verdict))
    if done is not None:
        return done
    why = "Discord didn't answer"
    if step.verdict != "failed":
        why = reason(_part_of(verb), step.code, channel_id)
    if verb == "event_off":
        return (
            f"I couldn't remove the Discord event ({why}). "
            "Someone with **Manage Events** can delete it in the Events tab."
        )
    return f"I couldn't archive the thread ({why})."


def _part_of(verb: str) -> str:
    if verb.startswith("event"):
        return "event"
    return "thread"


# ---------------------------------------------------------------------------
# Elsewhere: the "Posted" message, the cards' detail line
# ---------------------------------------------------------------------------


def posted_line(synced: Synced, channel_id: str) -> str | None:
    """What [Post raid]'s "Posted" message adds about the event and thread; None when there's nothing to say."""
    lines: list[str] = []
    up = _UP_LINES.get((synced.event.verdict in _UP, synced.thread.verdict in _UP))
    if up is not None:
        lines.append(up)
    for part, step in (("event", synced.event), ("thread", synced.thread)):
        if step.verdict == "refused":
            lines.append(f"No {_PARTS[part]}: {reason(part, step.code, channel_id)}. {_WHERE_TRY_AGAIN}")
        if step.verdict == "failed":
            lines.append(f"Discord didn't answer when I made the {_PARTS[part]}. {_WHERE_TRY_AGAIN}")
    return "\n".join(lines) or None


def detail_lines(event: WowRaidEvent) -> list[str]:
    """'**Discord event:** on · **Thread:** off' — while either is on; one Discord refused or missed says so."""
    if not (event.discord_event_enabled or event.thread_enabled):
        return []
    discord_event = _detail(event.discord_event_enabled, _event_unmade(event))
    thread = _detail(event.thread_enabled, _thread_unmade(event))
    return [f"**Discord event:** {discord_event} · **Thread:** {thread}"]


def _detail(enabled: bool, unmade: bool) -> str:
    if not enabled:
        return "off"
    if unmade:
        return NOT_MADE
    return "on"


def _posted(event: WowRaidEvent) -> bool:
    return event.status == "scheduled" and event.message_id is not None


def _event_unmade(event: WowRaidEvent) -> bool:
    """Refused, or missing from a posted raid: no event, none on its way, and the raid not started."""
    if event.discord_event_error is not None:
        return True
    missing = event.discord_event_id is None and event.discord_event_claimed_at is None
    return _posted(event) and missing and event.start_applied_at is None


def _thread_unmade(event: WowRaidEvent) -> bool:
    return event.thread_error is not None or (_posted(event) and event.thread_id is None)


# ---------------------------------------------------------------------------
# /raid-admin setup
# ---------------------------------------------------------------------------


def setup_defaults(discord_events: bool, threads: bool) -> str:
    """What new raids get, after setup set the defaults."""
    if discord_events and threads:
        return "New raids get a Discord event and a thread; leaders can change that per raid under **Event & thread**."
    if discord_events:
        return "New raids get a Discord event; leaders can change that per raid under **Event & thread**."
    if threads:
        return "New raids get a thread; leaders can change that per raid under **Event & thread**."
    return "New raids get no Discord event or thread unless their leader turns them on."


SETUP_NO_EVENTS: Final = "New raids won't get their Discord event until the bot has **Create Events** in this server."


def setup_no_threads(channel_id: str) -> str:
    return f"New raids won't get their thread until the bot has **Create Public Threads** in <#{channel_id}>."


def setup_private(channel_id: str) -> str:
    return f"Discord events show to the whole server, even though <#{channel_id}> is private."
