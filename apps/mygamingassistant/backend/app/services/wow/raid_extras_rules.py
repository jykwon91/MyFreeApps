"""Event & thread — a raid's Discord event and thread, decided without Discord.  Pure; ``now`` is passed in.

A raid can have two extras (migration 0038), off unless the server's
defaults or its leader turn them on:

* a **Discord scheduled event**, EXTERNAL, whose location is the raid
  post's link, kept in step with every edit (:func:`event_payload`; an
  unchanged raid sends nothing, by :func:`payload_digest`);
* a **public thread on the post**, named "{title} · {day}"
  (:func:`thread_name`) and renamed with the raid.

:func:`plan` says what a sync does to each, :func:`classify` what a Discord
answer means, and :func:`leftovers` what cancelling or deleting the raid
must clean up.  ``D/raid_extras`` makes the calls; ``raid_extras_service``
writes the leader's choices.

The event (first match wins; only a posted, ``scheduled`` raid gets anything):

=========================================================  ===================
off, or refused (``discord_event_error``)                  none
the raid has started, or no id and it starts within        started (Discord
``CREATE_LEAD``                                            runs it from here)
no id, a create claimed less than ``CLAIM_STALE`` ago      busy
no id, an older claim (a create that may have landed)      adopt_or_create
no id                                                      create
an id whose start Discord holds has passed                 replace
an id, and the payload differs from the one Discord took   patch
=========================================================  ===================

The thread: off or refused → none; no id → create; someone else's
(``thread_name`` NULL) → none; its name differs, or it's being reopened →
rename (which also unarchives it).
"""
from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Final, Literal

from platform_shared.services.discord import EVENT_FINISHED, THREAD_ALREADY_CREATED

from app.models.wow.wow_raid_event import LENGTH_RANGE, WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.services.wow.raid_catalog import raid_name
from app.services.wow.raid_deadline import DeadlineError, parse_deadline
from app.services.wow.raid_text import display_title, local_day_label

# How long a raid runs when its leader hasn't said (minutes).
DEFAULT_LENGTH: Final = 180
# A create claim this old may have timed out: the next sync looks for the event before making one.
CLAIM_STALE: Final = timedelta(minutes=2)
# No event is made this close to the start (Discord refuses a start in the past).
CREATE_LEAD: Final = timedelta(minutes=2)
NAME_MAX: Final = 100
DESCRIPTION_MAX: Final = 1000
# A thread archives itself after a quiet week (minutes).
THREAD_ARCHIVE_MINUTES: Final = 10080
# A create's fixed fields: EXTERNAL (a place, not a channel), seen by the server only.
_ENTITY_EXTERNAL: Final = 3
_GUILD_ONLY: Final = 2

LengthErrorKind = Literal["format", "too_short", "too_long"]


class LengthError(ValueError):
    """A length that doesn't read (``format``), or is under or over ``LENGTH_RANGE``."""

    def __init__(self, kind: LengthErrorKind) -> None:
        super().__init__(kind)
        self.kind: LengthErrorKind = kind


@dataclass(frozen=True)
class Plan:
    """What a sync does: ``event`` and ``thread`` name a step (see the module's tables)."""

    event: str
    thread: str


@dataclass(frozen=True)
class Step:
    """What a sync did to one extra, and Discord's code when it said no.

    ``none``, ``made``, ``adopted`` (a thread that isn't the bot's), ``updated``,
    ``started``, ``busy``, ``gone`` (someone deleted it; the toggle is off now),
    ``refused`` (stored; nothing retries), ``failed`` (no answer; the next sync
    retries), and for the toggles ``removed`` and ``archived``.
    """

    verdict: str
    code: int | None = None


@dataclass(frozen=True)
class Synced:
    """What a sync did to the raid's event and to its thread."""

    event: Step
    thread: Step


@dataclass(frozen=True)
class Leftovers:
    """What cancelling or deleting a raid must clean up in Discord (plain values, read in its transaction).

    *raid_id* is the raid's own id, for the log when Discord says no.
    """

    guild_discord_id: str
    event_id: str | None
    thread_id: str | None
    raid_id: uuid.UUID


# ---------------------------------------------------------------------------
# Length
# ---------------------------------------------------------------------------


def length_of(event: WowRaidEvent) -> int:
    """How long the raid runs, in minutes."""
    return event.length_minutes or DEFAULT_LENGTH


def ends_at(event: WowRaidEvent) -> datetime:
    """When the raid's Discord event ends."""
    return event.starts_at + timedelta(minutes=length_of(event))


def parse_length(text: str) -> int | None:
    """Minutes, in the Deadline form's grammar (a number is hours; ``90m``, ``2h 30m``); None when empty.

    Raises ``LengthError``.
    """
    if not text.strip():
        return None
    try:
        minutes = parse_deadline(text)
    except DeadlineError as exc:
        raise LengthError(exc.kind) from exc
    shortest, longest = LENGTH_RANGE
    if minutes is None or minutes < shortest:
        raise LengthError("too_short")
    if minutes > longest:
        raise LengthError("too_long")
    return minutes


# ---------------------------------------------------------------------------
# What Discord holds
# ---------------------------------------------------------------------------


def event_payload(event: WowRaidEvent, *, leader: str, post_link: str) -> dict[str, Any]:
    """The fields a PATCH sends (``create_body`` adds a create's): name, description, times, location."""
    head = f"{raid_name(event.raid_key)} · {event.size_cap} players · led by {leader}"
    tail = f"Sign up on the raid post: {post_link}"
    lines = [head]
    if event.notes:
        lines.append(_cut(event.notes, DESCRIPTION_MAX - len(head) - len(tail) - 2))
    lines.append(tail)
    return {
        "name": _cut(display_title(event), NAME_MAX),
        "description": _cut("\n".join(lines), DESCRIPTION_MAX),
        "scheduled_start_time": _iso(event.starts_at),
        "scheduled_end_time": _iso(ends_at(event)),
        "entity_metadata": {"location": post_link},
    }


def create_body(payload: dict[str, Any]) -> dict[str, Any]:
    """A create's body: the payload, EXTERNAL, for this server only.  No image."""
    return {**payload, "entity_type": _ENTITY_EXTERNAL, "privacy_level": _GUILD_ONLY}


def payload_digest(payload: dict[str, Any]) -> str:
    """The sha256 of the payload, stable under key order: stored once Discord takes it."""
    text = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def thread_name(event: WowRaidEvent, tz_name: str) -> str:
    """'Onyxia's Lair · Sat Oct 10' — the title cut so the whole name fits Discord's 100."""
    day = f" · {local_day_label(event.starts_at, tz_name)}"
    return _cut(display_title(event), NAME_MAX - len(day)) + day


def thread_body(name: str) -> dict[str, Any]:
    """A thread create's body: the name, archived after a quiet week."""
    return {"name": name, "auto_archive_duration": THREAD_ARCHIVE_MINUTES}


# ---------------------------------------------------------------------------
# What a sync does
# ---------------------------------------------------------------------------


def plan(
    event: WowRaidEvent, *, payload: dict[str, Any], thread_name: str, now: datetime, reopen_thread: bool = False
) -> Plan:
    """The step for the event and for the thread; ``none`` for both unless the raid is posted and scheduled."""
    if event.status != "scheduled" or event.message_id is None:
        return Plan("none", "none")
    return Plan(_event_step(event, payload, now), _thread_step(event, thread_name, reopen_thread))


def _event_step(event: WowRaidEvent, payload: dict[str, Any], now: datetime) -> str:
    if not event.discord_event_enabled or event.discord_event_error is not None:
        return "none"
    if event.starts_at <= now:
        return "started"
    if event.discord_event_id is None:
        return _create_step(event, now)
    held = event.discord_event_starts_at
    if held is not None and held <= now:
        return "replace"
    if event.discord_event_digest != payload_digest(payload):
        return "patch"
    return "none"


def _create_step(event: WowRaidEvent, now: datetime) -> str:
    if event.starts_at - now < CREATE_LEAD:
        return "started"
    if event.discord_event_claimed_at is None:
        return "create"
    if claim_fresh(event, now):
        return "busy"
    return "adopt_or_create"


def _thread_step(event: WowRaidEvent, name: str, reopen: bool) -> str:
    if not event.thread_enabled or event.thread_error is not None:
        return "none"
    if event.thread_id is None:
        return "create"
    if event.thread_name is None:
        return "none"  # someone else's thread: never renamed
    if event.thread_name != name or reopen:
        return "rename"
    return "none"


def claim_fresh(event: WowRaidEvent, now: datetime) -> bool:
    """A create is in flight: claimed less than ``CLAIM_STALE`` ago."""
    claimed = event.discord_event_claimed_at
    return claimed is not None and now - claimed < CLAIM_STALE


def classify(status: int | None, code: int | None) -> str:
    """What a Discord answer that wasn't a success means.

    ``gone`` (404: the event, thread, message or channel was deleted),
    ``exists`` (the post already has a thread), ``finished`` (the event has
    ended), ``transient`` (no answer, 429 or 5xx: try again later) or
    ``refused`` (any other 4xx: a missing permission, a limit, a bad body).
    """
    if status == 404:
        return "gone"
    if code == THREAD_ALREADY_CREATED:
        return "exists"
    if code == EVENT_FINISHED:
        return "finished"
    if status is None or status == 429 or status >= 500:
        return "transient"
    return "refused"


# ---------------------------------------------------------------------------
# What the leader sees
# ---------------------------------------------------------------------------


def event_state(event: WowRaidEvent, now: datetime) -> str:
    """The Discord event, for the card: off, draft, refused, made, busy, started or missing."""
    if not event.discord_event_enabled:
        return "off"
    if event.status == "draft":
        return "draft"
    if event.discord_event_error is not None:
        return "refused"
    if event.discord_event_id is not None:
        return "made"
    if claim_fresh(event, now):
        return "busy"
    if event.starts_at - now < CREATE_LEAD:
        return "started"
    return "missing"


def thread_state(event: WowRaidEvent) -> str:
    """The thread, for the card: off, draft, refused, made, theirs (a member's) or missing."""
    if not event.thread_enabled:
        return "off"
    if event.status == "draft":
        return "draft"
    if event.thread_error is not None:
        return "refused"
    if event.thread_id is None:
        return "missing"
    if event.thread_name is None:
        return "theirs"
    return "made"


def leftovers(guild: WowRaidGuild, event: WowRaidEvent) -> Leftovers | None:
    """What cancelling or deleting the raid must clean up; a thread that isn't the bot's is left alone."""
    thread_id = None
    if event.thread_name is not None:
        thread_id = event.thread_id
    if event.discord_event_id is None and thread_id is None:
        return None
    return Leftovers(guild.discord_guild_id, event.discord_event_id, thread_id, event.id)


def _cut(text: str, limit: int) -> str:
    """*text* in at most *limit* characters, ending "…" when cut."""
    if len(text) <= limit:
        return text
    return text[: max(limit - 1, 0)].rstrip() + "…"


def _iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).isoformat()
