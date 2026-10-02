"""What My sign-up says about a member's character name, their note for the leader, and [Forget my specs].

The character name is the in-game name the raid post shows instead of the
member's Discord name (``raid_character``).  *name* and *note* arrive
escaped where they come from the database; *class_label* is 'Shaman'.  The
note is for the raid leader and organisers only (``raid_note``); its switch
is on Raid: Edit and the draft's More options.
"""
from __future__ import annotations

from collections.abc import Sequence
from typing import Final

from app.services.wow.raid_character import NameProblem
from app.services.wow.raid_roster import ABSENCE_STATUS, TENTATIVE_STATUS

# My sign-up's button and line.
CHARACTER_BUTTON: Final = "Character name"
CHARACTER_NOT_SET: Final = "Character: not set, so I show your Discord name."

# The Character name form.
CHARACTER_TITLE: Final = "Your character name"
CHARACTER_LABEL: Final = "Character name (2-12 letters)"
CHARACTER_HINT: Final = "Shown on the raid post instead of your Discord name. Leave it empty to use your Discord name."
CHARACTER_PLACEHOLDER: Final = "e.g. Thrallbot"

# After the form.
CHAR_CLEARED: Final = "Okay, I'll use your Discord name."
CHAR_SAME: Final = "That's already the name I'm showing."
CHAR_NONE: Final = "You haven't set a character name yet."
CHAR_LETTERS: Final = "Character names use letters only, no spaces, numbers or symbols. Try again."
CHAR_NO_CLASS: Final = "Pick your class on the raid post first, then I can show your character name."

# /raid prefs character:
CHAR_PREFS_NEEDS_CLASS: Final = "Tell me which class that character plays: add `class:`."

# My sign-up's [Forget my specs] and the card asking first.
FORGET_BUTTON: Final = "Forget my specs"
FORGET_PROMPT: Final = "Forget what I've saved for you?"
FORGET_AFTER: Final = (
    "Next time you sign up I'll ask for your class and spec again. "
    "Your sign-ups, character names and DM reminders stay as they are."
)
FORGET_YES: Final = "Yes, forget them"
FORGET_KEEP: Final = "Keep them"
FORGET_DONE: Final = "Saved specs cleared. I'll ask again next time."
FORGET_NOTHING: Final = "I haven't saved anything for you yet."

# The notes switch (Raid: Edit, More options) and what it says.
NOTES_ON: Final = (
    "Player notes are on. Players can add a note from **My sign-up**; only the leader and organisers can read them."
)
NOTES_OFF: Final = "Player notes are off. Notes already written are kept but hidden."
NOTES_ALREADY_ON: Final = "Player notes were already on."
NOTES_ALREADY_OFF: Final = "Player notes were already off."

# My sign-up's button and line, and [Add reason] under the reply to a tap.
NOTE_ADD: Final = "Add note"
NOTE_EDIT: Final = "Edit note"
NOTE_NOT_SET: Final = "Note: none"
REASON_BUTTON: Final = "Add reason"

# The note form.
NOTE_TITLE: Final = "Note for the raid leader"
NOTE_LABEL: Final = "Note (optional)"
NOTE_HINT: Final = "Only the raid leader and organisers see this. Leave it empty to remove it."
_NOTE_PLACEHOLDERS: Final[dict[str, str]] = {
    "confirmed": "e.g. Can only stay 2 hours",
    "late": "e.g. Running 10 minutes late",
    TENTATIVE_STATUS: "e.g. Depends on my work shift",
    ABSENCE_STATUS: "e.g. Out of town this weekend",
}
_SPARE_PLACEHOLDER: Final = "e.g. Free from 8pm if you need me"  # queued or on the bench

# After the form.
NOTE_OK: Final = "Note saved. I'll clear it if you change your status."
NOTE_CLEARED: Final = "Note removed."
NOTE_SAME: Final = "That's already your note."
NOTE_NONE: Final = "You don't have a note to remove."

# When the raid's notes are off: on opening the form, and on its submit.
NOTES_OFF_NOW: Final = "Player notes are off for this raid."
NOTE_NOT_SAVED: Final = "Player notes are off for this raid, so I didn't save your note."

# Raid: Signed, when the notes are too long for the list.
NOTES_DID_NOT_FIT: Final = "Notes didn't fit here. Open a player in **Manage sign-ups** to read theirs."

# How the prompt after a tap names the status.
_REASON_WORDS: Final[dict[str, str]] = {"late": "late", TENTATIVE_STATUS: "tentative", ABSENCE_STATUS: "absent"}


def character_line(name: str) -> str:
    """My sign-up's and the player card's line: 'Character: **Thrallbot**'."""
    return f"Character: **{name}**"


def notes_toggle_label(enabled: bool) -> str:
    """The switch shows where notes stand: 'Notes: on' / 'Notes: off'."""
    if enabled:
        return "Notes: on"
    return "Notes: off"


def notes_toggled(enabled: bool, changed: bool) -> str:
    """What the card says after the switch; *changed* is False when notes already were that way."""
    if enabled:
        if changed:
            return NOTES_ON
        return NOTES_ALREADY_ON
    if changed:
        return NOTES_OFF
    return NOTES_ALREADY_OFF


def note_line(note: str) -> str:
    """My sign-up's and the player card's line: 'Note: "Running late"'."""
    return f'Note: "{note}"'


def note_placeholder(status: str) -> str:
    """The note form's example, fitting the member's status."""
    return _NOTE_PLACEHOLDERS.get(status, _SPARE_PLACEHOLDER)


def note_saved(note: str | None, changed: bool) -> str:
    """What the form's submit says; *changed* when the note on the sign-up changed."""
    if note is None:
        if changed:
            return NOTE_CLEARED
        return NOTE_NONE
    if changed:
        return NOTE_OK
    return NOTE_SAME


def reason_prompt(status: str) -> str:
    """The reply to a tap that made the member late, tentative or absent, above [Add reason]."""
    return f"You're marked **{_REASON_WORDS[status]}**. Want to tell the raid leader why?"


def name_saved(name: str | None, changed: bool) -> str:
    """What the card says after the form; *changed* when the sign-up or the saved name changed."""
    if name is None:
        if changed:
            return CHAR_CLEARED
        return CHAR_NONE
    if changed:
        return f"Saved. I'll show **{name}** on your sign-ups."
    return CHAR_SAME


def name_refusal(reason: NameProblem, length: int) -> str:
    """Why a typed name wasn't saved."""
    if reason == "letters":
        return CHAR_LETTERS
    return f"Character names are 2-12 letters, and that one has {length}. Try again."


def forget_saved(labels: Sequence[str]) -> str:
    """The asking card's middle line: 'Saved: Frost Mage, Holy Priest'."""
    return f"Saved: {', '.join(labels)}"


def prefs_named(name: str | None, class_label: str) -> str:
    """``/raid prefs character:``'s heading: the name saved for a class (None: cleared)."""
    if name is None:
        return f"Okay, I'll use your Discord name for your {class_label} sign-ups."
    return (
        f"Saved. I'll use **{name}** for your {class_label} sign-ups. "
        "On a raid you've already joined, tap **My sign-up**, then **Character name**."
    )
