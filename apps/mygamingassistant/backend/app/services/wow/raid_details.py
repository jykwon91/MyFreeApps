"""A raid's editable details — the rules Raid: Edit applies, pure.

Who leads the raid (whoever created it, until someone hands it over), who
it pings (and which roles a Mentions pick may add), and how a title,
description, banner link and cancel reason are cleaned before they're saved.  A banner link must be one Discord will
take: a post whose embed carries a link Discord rejects can't be edited
any more, so anything unusual is refused rather than passed on.
"""
from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Final

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
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


def mention_roles(event: WowRaidEvent, guild: WowRaidGuild) -> list[str]:
    """The roles the raid pings: those picked for it, else the server's ping role.

    Never ``@everyone`` (the role whose id is the server's own), whatever was saved.
    """
    if event.mention_role_ids is None:
        roles = server_ping_roles(guild)
    else:
        roles = [str(role_id) for role_id in event.mention_role_ids]
    return [role_id for role_id in roles if role_id != guild.discord_guild_id]


def server_ping_roles(guild: WowRaidGuild) -> list[str]:
    """The ping role ``/raid-admin setup`` chose, if any."""
    if guild.ping_role_id:
        return [guild.ping_role_id]
    return []


@dataclass(frozen=True)
class MentionPick:
    """A Mentions pick sorted out: the roles kept, and why any others weren't."""

    roles: list[str]
    everyone: bool = False  # @everyone was picked: never pinged
    left_out: list[str] = field(default_factory=list)  # not mentionable, and the picker can't ping them
    muted: list[str] = field(default_factory=list)  # kept, but not mentionable: may not ping


def mention_pick(
    picked: Sequence[str],
    *,
    mentionable: Mapping[str, bool],
    everyone_id: str | None,
    allowed: Sequence[str],
    may_ping_any: bool,
    limit: int,
) -> MentionPick:
    """The roles a Mentions pick keeps, so nobody gets the bot to ping a role they couldn't.

    Only roles Discord resolved for the pick count (*mentionable*: id →
    whether anyone may ping it), the first *limit* of them.  ``@everyone``
    (its id is the server's own) is never kept.  A role that isn't
    mentionable stays when it's *allowed* (the roles the raid pings now,
    and the server's ping role, which the raid pings by default anyway) or
    when the picker may ping any role themselves; else it's left out.

    *may_ping_any* comes from the picker's permissions in the channel they
    picked in, which Discord sends with the click; the raid may post in
    another channel, whose overwrites aren't known here.
    """
    roles: list[str] = []
    left_out: list[str] = []
    muted: list[str] = []
    everyone = False
    for role_id in picked[:limit]:
        if role_id not in mentionable:
            continue
        if role_id == everyone_id:
            everyone = True
        elif mentionable[role_id] or role_id in allowed:
            roles.append(role_id)
        elif may_ping_any:
            roles.append(role_id)
            muted.append(role_id)
        else:
            left_out.append(role_id)
    return MentionPick(roles=roles, everyone=everyone, left_out=left_out, muted=muted)


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
    """A cancel's or a "say why" form's reason, or None for none."""
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
