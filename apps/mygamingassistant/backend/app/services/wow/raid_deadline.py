"""Sign-up deadlines — when a raid's sign-ups close by themselves.  Pure; ``now`` is passed in.

A leader sets one with Raid: Edit → [Deadline] (or the create preview's
More options) in Raid-Helper's grammar: a number is hours (``2``, ``1.5``),
or ``30m``, ``1d``, ``1d 6h``; empty or ``0`` is none, and sign-ups close
when the raid starts.  At most ``MAX_MINUTES`` (7 days) before the start,
never after it (Raid-Helper's negative deadlines aren't offered).

Sign-ups close by the clock, from the deadline's second
(``deadline_due``, read by ``raid_context.signup_refusal``).  The
notification worker's sweep (``raid_sweeps``) then records the close,
greys the post and DMs the leader, once.  Every writer squares the row
with the deadline through ``reconcile``:

==============  ======================  =========================================
deadline        row                     then
==============  ======================  =========================================
none, or ahead  closed by the deadline  reopened: closed, reason, applied cleared
none, or ahead  otherwise               applied cleared (a leader's close stays)
passed          not applied, open       closed now as ``'deadline'``, applied now
passed          not applied, closed     applied now only
passed          applied                 nothing (closed, or reopened after it)
==============  ======================  =========================================
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Final, Literal

from platform_shared.services.discord import EmojiSet

from app.models.wow.wow_raid_event import WowRaidEvent
from app.services.wow.raid_text import icon_text

# The longest deadline, 7 days before the start (ck_wowraidevent_signup_deadline).
MAX_MINUTES: Final = 10080
STARTED_HINT: Final = "This raid has started."
CLOSED_HINT: Final = "Sign-ups are closed."

DeadlineChange = Literal["closed", "reopened"]

# A deadline's parts, largest first: (minutes, as the form writes it, as words).
_PARTS: Final = ((1440, "d", "day"), (60, "h", "hour"), (1, "m", "minute"))
_MINUTES_PER: Final = {short: size for size, short, _word in _PARTS}
_HOURS: Final = re.compile(r"\d+(?:\.\d+)?")
_TOKEN: Final = re.compile(r"\s*(\d+(?:\.\d+)?)\s*(days?|d|hours?|hrs?|h|minutes?|mins?|m)")


class DeadlineError(ValueError):
    """A deadline that doesn't read (``format``) or is over ``MAX_MINUTES`` (``too_long``)."""

    def __init__(self, kind: Literal["format", "too_long"]) -> None:
        super().__init__(kind)
        self.kind: Literal["format", "too_long"] = kind


@dataclass(frozen=True)
class Reconciled:
    """The close state to store, and what changed for members (None: nothing they'd see)."""

    closed_at: datetime | None
    close_reason: str | None
    applied_at: datetime | None
    change: DeadlineChange | None = None


# ---------------------------------------------------------------------------
# The form
# ---------------------------------------------------------------------------


def parse_deadline(text: str) -> int | None:
    """Minutes before the start, rounded; None for no deadline (empty or ``0``).  Raises ``DeadlineError``."""
    cleaned = text.strip().casefold()
    if _HOURS.fullmatch(cleaned):
        return _within_limit(float(cleaned) * 60)
    minutes = 0.0
    position = 0
    while position < len(cleaned):
        token = _TOKEN.match(cleaned, position)
        if token is None:
            raise DeadlineError("format")
        minutes += float(token[1]) * _MINUTES_PER[token[2][0]]
        position = token.end()
    return _within_limit(minutes)


def _within_limit(minutes: float) -> int | None:
    rounded = round(minutes)
    if rounded > MAX_MINUTES:
        raise DeadlineError("too_long")
    return rounded or None


def deadline_words(minutes: int) -> str:
    """'2 hours', '1 hour 30 minutes', '1 day 6 hours'."""
    return " ".join(_counted(count, word) for count, _short, word in _split(minutes))


def deadline_prefill(minutes: int | None) -> str:
    """What the Deadline form holds — '2h', '1h 30m', '1d 6h', or '' for none; it reads back the same."""
    if minutes is None:
        return ""
    return " ".join(f"{count}{short}" for count, short, _word in _split(minutes))


def _split(minutes: int) -> list[tuple[int, str, str]]:
    """(count, short, word) for each part that isn't zero, largest first."""
    parts: list[tuple[int, str, str]] = []
    for size, short, word in _PARTS:
        count, minutes = divmod(minutes, size)
        if count:
            parts.append((count, short, word))
    return parts


def _counted(count: int, word: str) -> str:
    if count == 1:
        return f"1 {word}"
    return f"{count} {word}s"


# ---------------------------------------------------------------------------
# The clock
# ---------------------------------------------------------------------------


def deadline_at(event: WowRaidEvent) -> datetime | None:
    """When the deadline closes sign-ups; None when the raid has none (they close at the start)."""
    if event.signup_deadline_minutes is None:
        return None
    return event.starts_at - timedelta(minutes=event.signup_deadline_minutes)


def deadline_passed(event: WowRaidEvent, now: datetime) -> bool:
    """The raid has a deadline and it's here, from its very second (like the start)."""
    at = deadline_at(event)
    return at is not None and at <= now


def deadline_due(event: WowRaidEvent, now: datetime) -> bool:
    """Passed but not applied: sign-ups are closed by the clock until the sweep records it."""
    return event.deadline_applied_at is None and deadline_passed(event, now)


def is_started(event: WowRaidEvent) -> bool:
    """The post shows the raid as started: the sweep greyed it, and it wasn't cancelled since."""
    return event.start_applied_at is not None and event.status in ("scheduled", "completed")


def closes_at(event: WowRaidEvent) -> datetime | None:
    """When the deadline will close sign-ups, for 'Sign-ups close <t:R>'; None when it won't."""
    if event.status not in ("draft", "scheduled") or event.closed_at is not None:
        return None
    if event.deadline_applied_at is not None or is_started(event):
        return None
    return deadline_at(event)


def status_lines(event: WowRaidEvent, emojis: EmojiSet) -> list[str]:
    """The post's line about sign-ups, under the time: started, closed, or when they close."""
    if is_started(event):
        return [icon_text(emojis, "info_lock", f"**{STARTED_HINT}**")]
    if event.closed_at is not None:
        return [icon_text(emojis, "info_lock", f"**{CLOSED_HINT}**")]
    closes = closes_at(event)
    if closes is None:
        return []
    return [icon_text(emojis, "info_lock", f"Sign-ups close <t:{int(closes.timestamp())}:R>")]


def reconcile(event: WowRaidEvent, now: datetime) -> Reconciled | None:
    """Square the raid's close state with its deadline as it stands; None when nothing changes.

    The module docstring's table, row by row.
    """
    if not deadline_passed(event, now):
        if event.close_reason == "deadline":
            return Reconciled(None, None, None, "reopened")
        if event.deadline_applied_at is None:
            return None
        return Reconciled(event.closed_at, event.close_reason, None)
    if event.deadline_applied_at is not None:
        return None
    if event.closed_at is None:
        return Reconciled(now, "deadline", now, "closed")
    return Reconciled(event.closed_at, event.close_reason, now)
