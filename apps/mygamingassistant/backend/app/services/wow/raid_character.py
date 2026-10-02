"""Character names for the raid bot — the in-game name a member shows instead of their Discord name.

Pure rules, no I/O.  A member keeps one name per class
(``WowRaidMemberPref.character_names``); each sign-up carries its own copy
(``WowRaidSignup.character_name``), which every surface renders
(``raid_text.shown_name``).  A name is 2-12 letters of any alphabet,
capitalised like the game shows it ("thrallbot" → "Thrallbot").
"""
from __future__ import annotations

import unicodedata
from collections.abc import Mapping
from typing import Literal

from app.models.wow.wow_raid_signup import CHARACTER_NAME_MAX, CHARACTER_NAME_MIN
from app.services.wow.raid_catalog import CLASSES_BY_KEY

NameProblem = Literal["letters", "length"]


class CharacterNameError(ValueError):
    """A typed name the game wouldn't take: *reason* says why, *length* how long it was."""

    def __init__(self, reason: NameProblem, length: int) -> None:
        super().__init__(reason)
        self.reason: NameProblem = reason
        self.length = length


def clean_name(text: str) -> str | None:
    """The name to save for *text*: capitalised, or None when it's blank (clear the name).

    Raises ``CharacterNameError`` for anything but letters (checked first),
    or for fewer than 2 or more than 12 of them.
    """
    stripped = unicodedata.normalize("NFC", text).strip()
    if not stripped:
        return None
    if not stripped.isalpha():
        raise CharacterNameError("letters", len(stripped))
    # Measured after capitalising: a leading "ß" becomes "Ss".
    name = unicodedata.normalize("NFC", stripped.capitalize())
    if not CHARACTER_NAME_MIN <= len(name) <= CHARACTER_NAME_MAX:
        raise CharacterNameError("length", len(name))
    return name


def saved_name(names: Mapping[str, object] | None, wow_class: str | None) -> str | None:
    """The name a member saved for *wow_class* in ``character_names``; junk reads as None."""
    if not names or wow_class not in CLASSES_BY_KEY:
        return None
    name = names.get(wow_class)
    if not isinstance(name, str):
        return None
    try:
        return clean_name(name)
    except CharacterNameError:
        return None
