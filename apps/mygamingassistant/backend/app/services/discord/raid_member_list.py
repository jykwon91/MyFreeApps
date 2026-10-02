"""Reading a server's member list from Discord, for Raid: Unsigned.

:func:`fetch_members` pages through List Guild Members — ``PAGE_SIZE`` a
page in id order, each page after the highest id so far — until a short
page, or ``MAX_PAGES`` pages (the list is then marked truncated).  Every
call is bounded (``rest.bounded``), and the whole read by ``FETCH_BUDGET_S``.

Discord refuses the list without the **Server Members** privileged intent:
403 ``MISSING_ACCESS`` (50001).  A refusal is logged at WARNING with the
server and Discord's code, and raised as :class:`MemberListError`, as is no
answer at all.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx
from platform_shared.services.discord import MISSING_ACCESS, DiscordApiError, DiscordRestClient

from app.services.discord import rest
from app.services.discord.interaction import member_display_name
from app.services.wow.raid_unsigned import FETCH_BUDGET_S, MAX_PAGES, PAGE_SIZE, Member, MemberList

logger = logging.getLogger(__name__)


class MemberListError(Exception):
    """Discord didn't give the member list: its HTTP status and code, or no answer at all."""

    def __init__(self, status: int | None = None, code: int | None = None, *, unanswered: bool = False) -> None:
        super().__init__(f"member list refused: status={status} code={code} unanswered={unanswered}")
        self.status = status
        self.code = code
        self.unanswered = unanswered

    @property
    def intent_off(self) -> bool:
        """The bot lacks the Server Members intent (403 Missing Access)."""
        return self.status == 403 and self.code == MISSING_ACCESS


async def fetch_members(client: DiscordRestClient, guild_discord_id: str) -> MemberList:
    """The server's members, up to ``MAX_PAGES`` pages; raises :class:`MemberListError`."""
    try:
        return await asyncio.wait_for(_read_pages(client, guild_discord_id), FETCH_BUDGET_S)
    except DiscordApiError as exc:
        logger.warning(
            "Raid bot: Discord refused the member list of guild %s (status %s, code %s)",
            guild_discord_id,
            exc.status,
            exc.code,
        )
        raise MemberListError(exc.status, exc.code) from exc
    except (TimeoutError, httpx.HTTPError) as exc:
        logger.warning(
            "Raid bot: the member list of guild %s got no answer from Discord (%s)",
            guild_discord_id,
            type(exc).__name__,
        )
        raise MemberListError(unanswered=True) from exc


def parse_member(raw: Any) -> Member | None:
    """A guild member object as a :class:`Member`; None when it has no user id."""
    if not isinstance(raw, dict):
        return None
    user = raw.get("user")
    if not isinstance(user, dict) or not _is_id(user.get("id")):
        return None
    roles = raw.get("roles")
    if not isinstance(roles, list):
        roles = []
    return Member(
        user_id=str(user["id"]),
        name=member_display_name(raw),
        role_ids=frozenset(str(role_id) for role_id in roles),
        bot=user.get("bot") is True,
        pending=raw.get("pending") is True,
    )


async def _read_pages(client: DiscordRestClient, guild_discord_id: str) -> MemberList:
    members: list[Member] = []
    after = "0"
    for _ in range(MAX_PAGES):
        page = await rest.bounded(client.list_guild_members(guild_discord_id, limit=PAGE_SIZE, after=after))
        parsed = [member for raw in page if (member := parse_member(raw)) is not None]
        members.extend(parsed)
        if len(page) < PAGE_SIZE:
            return MemberList(tuple(members))
        # The next page starts after the highest id on this one.
        after = str(max([int(after), *(int(member.user_id) for member in parsed)]))
    return MemberList(tuple(members), truncated=True)


def _is_id(value: Any) -> bool:
    return isinstance(value, (str, int)) and str(value).isascii() and str(value).isdigit()
