"""Where everyone goes on the raid post — pure, no Discord payloads.

Columns
-------
The post has one column per button: **Tanks** (every tank spec, whatever
the class), then one per class in ``CLASSES`` order.  A column lists the
players coming as that spec — seat holders (``confirmed`` / ``late``) and
the queue — in line order, so its count matches its button.  A sign-up from
before specs uses its legacy default spec; one with no class at all goes in
the "No class yet" column.  Tentative, bench and absence are listed under
the columns, not in them.

Letter tiles
------------
A short title is spelled with the bot's letter-tile emojis (Raid-Helper's
boxed-letter title, in our own art): up to ``MAX_TILES`` characters of
A-Z, 0-9 and the punctuation we have tiles for, accents dropped.  Words are
joined by a gap tile with a space each side, so a phone wraps between words.
Any other title — or any tile not uploaded yet — falls back to plain text.
"""
from __future__ import annotations

import unicodedata
from collections.abc import Iterable, Sequence
from typing import Final

from platform_shared.services.discord import EmojiSet

from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.wow.raid_catalog import CLASSES_BY_KEY, POST_COLUMNS, effective_spec
from app.services.wow.raid_roster import LINE_STATUSES, SEAT_STATUSES, in_line_order

NO_CLASS_COLUMN: Final = "none"
NO_CLASS_LABEL: Final = "No class yet"

# The role row above the columns: (display role, label, icon).
ROLE_ROW: Final = (
    ("tank", "Tanks", "role_tank"),
    ("melee", "Melee", "role_melee"),
    ("ranged", "Ranged", "role_ranged"),
    ("healer", "Healers", "role_healer"),
)

MAX_TILES: Final = 19
TILE_GAP: Final = "tile_gap"
_TILE_PUNCTUATION: Final[dict[str, str]] = {
    "'": "tile_apos",
    "’": "tile_apos",  # typographic apostrophe
    "-": "tile_dash",
    "&": "tile_amp",
    "!": "tile_excl",
    "?": "tile_qmark",
    ".": "tile_dot",
    ":": "tile_colon",
    ",": "tile_comma",
}


# ---------------------------------------------------------------------------
# Columns
# ---------------------------------------------------------------------------


def column_of(signup: WowRaidSignup) -> str:
    """The column a sign-up shows in: Tanks, its class, or ``NO_CLASS_COLUMN``."""
    spec = effective_spec(signup.wow_class, signup.role, signup.spec)
    if spec is not None:
        return spec.column
    if signup.wow_class in CLASSES_BY_KEY:
        return signup.wow_class
    return NO_CLASS_COLUMN


def post_columns(signups: Iterable[WowRaidSignup]) -> dict[str, list[WowRaidSignup]]:
    """Column → its players in line order: every button column (maybe empty), then
    ``NO_CLASS_COLUMN`` when anyone is in it."""
    columns: dict[str, list[WowRaidSignup]] = {column: [] for column in POST_COLUMNS}
    for signup in in_line_order(signups):
        if signup.status in LINE_STATUSES:
            columns.setdefault(column_of(signup), []).append(signup)
    return columns


def column_counts(signups: Iterable[WowRaidSignup]) -> dict[str, int]:
    """How many players each button's column lists."""
    return {column: len(players) for column, players in post_columns(signups).items()}


def role_counts(signups: Iterable[WowRaidSignup]) -> dict[str, int]:
    """Seat holders per display role (tank / melee / ranged / healer)."""
    counts = dict.fromkeys((role for role, _, _ in ROLE_ROW), 0)
    for signup in signups:
        if signup.status not in SEAT_STATUSES:
            continue
        spec = effective_spec(signup.wow_class, signup.role, signup.spec)
        if spec is not None:
            counts[spec.display_role] += 1
    return counts


def with_status(signups: Sequence[WowRaidSignup], status: str) -> list[WowRaidSignup]:
    """Players with *status*, in line order."""
    return [signup for signup in in_line_order(signups) if signup.status == status]


# ---------------------------------------------------------------------------
# Letter tiles
# ---------------------------------------------------------------------------


def tile_words(title: str) -> list[list[str]] | None:
    """The title's words as tile emoji names, or None when it can't be tiled."""
    folded = "".join(
        char for char in unicodedata.normalize("NFKD", title) if not unicodedata.combining(char)
    )
    text = " ".join(folded.upper().split())
    if not text or len(text) > MAX_TILES:
        return None
    words: list[list[str]] = []
    for word in text.split(" "):
        names = [_tile_name(char) for char in word]
        if any(name is None for name in names):
            return None
        words.append([name for name in names if name is not None])
    return words


def tile_line(title: str, emojis: EmojiSet) -> str | None:
    """The title in letter tiles, or None (not tileable, or a tile isn't uploaded)."""
    words = tile_words(title)
    if words is None:
        return None
    needed = {name for word in words for name in word}
    if len(words) > 1:
        needed.add(TILE_GAP)
    if not all(emojis.has(name) for name in needed):
        return None  # never a half-tiled title
    gap = f" {emojis.markup(TILE_GAP)} "
    return gap.join("".join(emojis.markup(name) for name in word) for word in words)


def _tile_name(char: str) -> str | None:
    if "A" <= char <= "Z":
        return f"tile_{char.lower()}"
    if "0" <= char <= "9":
        return f"tile_{char}"
    return _TILE_PUNCTUATION.get(char)
