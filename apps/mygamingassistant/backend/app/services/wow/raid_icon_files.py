"""The raid bot's icons as files, for the raid's web page.

The same art the bot uploads to Discord as application emojis
(``backend/data/discord_emojis/*.png``, ``app/services/discord/emojis.py``;
credits in NOTICE.md beside the PNGs).  ``GET /discord/raid-icons/<name>.png``
(``app/api/discord_raid_icons.py``) serves them, so the page shows the post's
class, spec, role and status icons without Discord.  Loaded once at import.

The page's icon URLs carry ``ICONS_VERSION``, a hash over every icon: new
art, new URLs, so a browser can keep an icon for a year.
"""
from __future__ import annotations

import hashlib
from collections.abc import Mapping
from pathlib import Path
from typing import Final

from app.services.discord.emojis import EMOJI_DIR

ROUTE_PREFIX: Final = "/discord/raid-icons"
VERSION_CHARS: Final = 8


def load_icons(directory: Path) -> dict[str, bytes]:
    """Every ``<name>.png`` in *directory*, by name."""
    return {path.stem: path.read_bytes() for path in sorted(directory.glob("*.png"))}


def icons_version(icons: Mapping[str, bytes]) -> str:
    """The start of a SHA-256 over every icon's name and bytes, in name order."""
    digest = hashlib.sha256()
    for name in sorted(icons):
        digest.update(name.encode())
        digest.update(b"\0")
        digest.update(icons[name])
    return digest.hexdigest()[:VERSION_CHARS]


ICONS: Final = load_icons(EMOJI_DIR)
ICONS_VERSION: Final = icons_version(ICONS)
_BY_FILE_NAME: Final = {f"{name}.png": png for name, png in ICONS.items()}


def icon_for_file(file_name: str) -> bytes | None:
    """The icon served as *file_name* (``warrior_fury.png``); None for anything else."""
    return _BY_FILE_NAME.get(file_name)
