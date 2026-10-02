"""A raid's editable details — the rules Raid: Edit applies, pure.

Who leads the raid (whoever created it, until someone hands it over), and
how a title, description, banner link and cancel reason are cleaned before
they're saved.  A banner link must be one Discord will take: a post whose
embed carries a link Discord rejects can't be edited any more, so anything
unusual is refused rather than passed on.
"""
from __future__ import annotations

import re
from typing import Final

from app.models.wow.wow_raid_event import WowRaidEvent
from app.services.wow.raid_catalog import raid_name

TITLE_MAX: Final = 60
DESCRIPTION_MAX: Final = 500
IMAGE_URL_MAX: Final = 512  # the column's size
REASON_MAX: Final = 200

# https, a dotted host name (no port), then only characters a link may carry
# as they are, or %-encoded ones.  No brackets: a path can't hold them as
# they are, and with none the link can't pass for a masked link either.
_IMAGE_URL: Final = re.compile(
    r"https://(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}"
    r"(?:[/?#](?:[A-Za-z0-9\-._~:/?#@!$&'()*+,;=]|%[0-9A-Fa-f]{2})*)?"
)


def leader_id(event: WowRaidEvent) -> str:
    """The leader's Discord user id: whoever the raid was handed to, else its creator."""
    return event.leader_user_id or event.created_by_user_id


def leader_name(event: WowRaidEvent) -> str | None:
    """The leader's name as captured when they became leader."""
    if event.leader_user_id is not None:
        return event.leader_display_name
    return event.created_by_display_name


def clean_title(text: str) -> str:
    """One line, single spaces, at most ``TITLE_MAX`` characters ('' when blank)."""
    return " ".join(text.split())[:TITLE_MAX]


def stored_title(raid_key: str, title: str) -> str | None:
    """What the event stores: None when *title* is just the raid's own name."""
    if title == raid_name(raid_key):
        return None
    return title


def clean_description(text: str) -> str | None:
    """The description to save, or None to clear it."""
    return text.strip()[:DESCRIPTION_MAX] or None


def clean_reason(text: str) -> str | None:
    """A cancel reason to save, or None for none."""
    return " ".join(text.split())[:REASON_MAX] or None


def image_link(text: str) -> str | None:
    """The banner link to save; None when blank (back to the raid's own banner).

    Raises ``ValueError`` for anything Discord might not take: not https,
    no proper host name, spaces or unusual characters, or too long.
    """
    link = text.strip()
    if not link:
        return None
    if len(link) > IMAGE_URL_MAX or _IMAGE_URL.fullmatch(link) is None:
        raise ValueError("not a usable https link")
    return link
