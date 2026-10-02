"""What My sign-up says about a member's character name.

The character name is the in-game name the raid post shows instead of the
member's Discord name (``raid_character``).  *name* arrives escaped where it
comes from the database; *class_label* is 'Shaman'.
"""
from __future__ import annotations

from typing import Final

from app.services.wow.raid_character import NameProblem

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


def character_line(name: str) -> str:
    """My sign-up's and the player card's line: 'Character: **Thrallbot**'."""
    return f"Character: **{name}**"


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


def prefs_named(name: str | None, class_label: str) -> str:
    """``/raid prefs character:``'s heading: the name saved for a class (None: cleared)."""
    if name is None:
        return f"Okay, I'll use your Discord name for your {class_label} sign-ups."
    return (
        f"Saved. I'll use **{name}** for your {class_label} sign-ups. "
        "On a raid you've already joined, tap **My sign-up**, then **Character name**."
    )
