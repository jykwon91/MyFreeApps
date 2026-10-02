"""A member's note for the raid leader: what's kept of what they typed, who reads it, when to ask for one.

A raid takes notes once its leader turns them on (Raid: Edit → Notes).  A
member writes their own from My sign-up, or from [Add reason] after a tap
that marks them late, tentative or absent; only the leader and organisers
read it.  A status change clears it (it was about the old status); a class
or spec change, or a move up from the queue, keeps it.  Turning notes off
hides them without deleting them.  Pure — nothing here logs a note.
"""
from __future__ import annotations

from typing import Final

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_signup import NOTE_MAX, WowRaidSignup
from app.services.wow.raid_roster import ABSENCE_STATUS, TENTATIVE_STATUS
from app.services.wow.raid_signup_service import StatusChange

# The statuses a member is asked to explain, after a tap that gave them one.
REASON_STATUSES: Final = ("late", TENTATIVE_STATUS, ABSENCE_STATUS)


def clean_note(typed: str) -> str | None:
    """What's kept of a typed note: one line of printable text, at most ``NOTE_MAX`` long; nothing → None."""
    printable = "".join(char for char in typed if char.isprintable() or char.isspace())
    note = " ".join(printable.split())[:NOTE_MAX].rstrip()
    return note or None


def shown_note(event: WowRaidEvent, signup: WowRaidSignup) -> str | None:
    """The note the leader reads: none while the raid's notes are off (it's kept, just hidden)."""
    if not event.signup_notes_enabled:
        return None
    return signup.note


def asks_reason(notes_on: bool, change: StatusChange) -> bool:
    """Whether to ask why after a tap: it made the member late, tentative or absent, and the raid takes notes.

    Never for the queue (a full raid isn't the member's call), nor for a tap
    that only changed the class or spec — the note they have still stands.
    """
    if not notes_on or change.outcome != "changed" or change.previous == change.status:
        return False
    return change.status in REASON_STATUSES
