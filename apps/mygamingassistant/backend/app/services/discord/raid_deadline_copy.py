"""What the raid bot says about sign-up deadlines (``raid_deadline``).

Raid: Edit → [Deadline]'s form and the card's notice after it, the notice
after a move, [Post raid] once the deadline has passed, Raid: Open's answer
and the leader's DM when the deadline closes sign-ups.
"""
from __future__ import annotations

from datetime import datetime
from typing import Final

from app.models.wow.wow_raid_event import WowRaidEvent
from app.services.discord import raid_copy, raid_draft_copy
from app.services.discord.raid_views import unix
from app.services.wow.raid_deadline import deadline_at, deadline_words
from app.services.wow.raid_event_service import DeadlineSaved
from app.services.wow.raid_text import title_text

MODAL_TITLE: Final = "Sign-up deadline"
LABEL: Final = "Close sign-ups how long before the start?"
HINT: Final = "A number is hours. Or 30m, 1d, 1d 6h. Empty: they close when the raid starts."
PLACEHOLDER: Final = "e.g. 2h"

FORMAT: Final = "I couldn't read that deadline. Try 2 (hours), 30m, 1d or 1d 6h."
TOO_LONG: Final = "A deadline can be at most 7 days before the start."
CLOSED_NOW: Final = "That deadline has passed, so sign-ups are **closed** now. Raid: Open lets people in again."
STAYS_CLOSED: Final = "They stay closed until you reopen them."
CLEARED: Final = "No deadline: sign-ups stay open until the raid starts."
CLEARED_CLOSED: Final = "No deadline: once you reopen sign-ups, they stay open until the raid starts."
CLEARED_REOPENED: Final = "No deadline: sign-ups are **open** again until the raid starts."
POST_PASSED: Final = (
    "Sign-ups would already be closed: the deadline has passed. "
    "Change the **Date & Time** or the **Deadline**, then post."
)
MOVED_CLOSED: Final = "The deadline has passed at the new time, so sign-ups are **closed**."
MOVED_REOPENED: Final = "Sign-ups are **open** again: the deadline is ahead at the new time."
OPENED_PAST: Final = (
    "Sign-ups are **open** again until the raid starts. The deadline has passed, so it won't close them."
)

# The notices that don't depend on the deadline itself.
_FIXED: Final[dict[str, str]] = {
    "same": raid_draft_copy.NOTHING_CHANGED,
    "format": FORMAT,
    "too_long": TOO_LONG,
    "started": raid_copy.RAID_STARTED,
    "closed_now": CLOSED_NOW,
}


def deadline_notice(saved: DeadlineSaved) -> str:
    """The card's first line after the Deadline form: the deadline now, and where sign-ups stand."""
    fixed = _FIXED.get(saved.kind)
    if fixed is not None:
        return fixed
    if saved.minutes is None:
        return _no_deadline(saved)
    before = f"{deadline_words(saved.minutes)} before the start"
    if saved.kind == "reopened":
        return f"Sign-ups are **open** again until the deadline, {before} (<t:{saved.closes_unix}:R>)."
    if saved.kind == "draft_passed":
        return (
            f"Sign-ups close {before}, which has already passed. "
            "Change the Date & Time or the deadline before you post."
        )
    text = f"Sign-ups close {before} (<t:{saved.closes_unix}:R>)."
    if saved.still_closed:
        return f"{text} {STAYS_CLOSED}"
    return text


def _no_deadline(saved: DeadlineSaved) -> str:
    if saved.kind == "reopened":
        return CLEARED_REOPENED
    if saved.still_closed:
        return CLEARED_CLOSED
    return CLEARED


def deadline_lines(event: WowRaidEvent) -> list[str]:
    """The edit card's Deadline line, while the raid has one."""
    if event.signup_deadline_minutes is None:
        return []
    return [f"**Deadline:** {deadline_words(event.signup_deadline_minutes)} before the start"]


def moved_notice(moved: str, change: str | None) -> str:
    """Raid: Edit → Date & Time's notice, plus what the move did to sign-ups by the deadline."""
    if change == "closed":
        return f"{moved} {MOVED_CLOSED}"
    if change == "reopened":
        return f"{moved} {MOVED_REOPENED}"
    return moved


def opened(event: WowRaidEvent, now: datetime) -> str:
    """Raid: Open's answer: how long sign-ups now stay open."""
    at = deadline_at(event)
    if at is None:
        return raid_copy.OPENED_OK
    if at <= now:
        return OPENED_PAST
    return f"{raid_copy.OPENED_OK} They close again <t:{unix(at)}:R>, at the deadline."


def closed_dm(event: WowRaidEvent, link: str | None) -> str:
    """The leader's DM when the deadline closes sign-ups."""
    text = (
        f"Sign-ups for **{title_text(event)}** (<t:{unix(event.starts_at)}:F>) closed at the deadline. "
        "To let people in again, right-click the raid post → Apps → **Raid: Open**."
    )
    if link:
        return f"{text}\n[Jump to the raid]({link})"
    return text
