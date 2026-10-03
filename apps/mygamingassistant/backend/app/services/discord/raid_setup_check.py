"""/raid-admin setup's check — can the bot post where it was told to?

Runs as a background task after setup's deferred reply (``commands/raid_admin``),
like the rest of the bot's REST work (``raid_publisher``), and answers that
reply with what it found: then what new raids get (a Discord event, a
thread) and what the bot still needs for them, from the same three reads.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import httpx
from platform_shared.services.discord import (
    CREATE_EVENTS,
    CREATE_PUBLIC_THREADS,
    EMBED_LINKS,
    MANAGE_EVENTS,
    MENTION_EVERYONE,
    PIN_MESSAGES,
    SEND_MESSAGES,
    VIEW_CHANNEL,
    DiscordApiError,
    DiscordRestClient,
    compute_channel_permissions,
    has_permission,
    missing_permissions,
    parse_bitfield,
    permission_labels,
)

from app.services.discord import raid_copy, raid_extras_copy, raid_post_options_copy, rest
from app.services.discord.interaction import ephemeral_data
from app.services.discord.raid_publisher import edit_original

logger = logging.getLogger(__name__)

_POST_PERMISSIONS = (VIEW_CHANNEL, SEND_MESSAGES, EMBED_LINKS)


@dataclass(frozen=True)
class SetupCheck:
    """*discord_events*, *threads* and *pin_posts* are the server's defaults as stored; *extras_given*: setup named
    the first two."""

    application_id: str
    token: str
    guild_discord_id: str
    channel_id: str
    ping_role_id: str | None
    role_mentionable: bool
    tz_name: str
    discord_events: bool = False
    threads: bool = False
    extras_given: bool = False
    pin_posts: bool = False


async def verify_setup(check: SetupCheck) -> None:
    """Compute the bot's permissions in the raid channel and answer the deferred reply.

    The interaction payload only carries the *invoking user's* permissions for
    a resolved channel (and ``app_permissions`` for the current channel), so
    the bot's own permissions in the chosen channel are computed from REST
    data: channel overwrites + the bot member's roles + the guild's roles.
    The bot's user ID equals its application ID.
    """
    try:
        async with rest.make_rest_client() as client:
            lines = await _setup_report(client, check)
            await edit_original(client, check.application_id, check.token, ephemeral_data("\n".join(lines)))
    except Exception:
        logger.exception("Raid bot: verify_setup failed")


async def _setup_report(client: DiscordRestClient, check: SetupCheck) -> list[str]:
    ok_line = raid_copy.setup_ok(check.channel_id, check.ping_role_id, check.tz_name)
    try:
        channel = await rest.bounded(client.get_channel(check.channel_id))
        member = await rest.bounded(client.get_guild_member(check.guild_discord_id, check.application_id))
        roles = await rest.bounded(client.get_guild_roles(check.guild_discord_id))
    except (DiscordApiError, TimeoutError, httpx.HTTPError) as exc:
        logger.warning("Raid bot: setup permission check failed (%s)", type(exc).__name__)
        return [ok_line, raid_copy.SETUP_CHECK_FAILED, *_defaults_line(check)]

    overwrites = channel.get("permission_overwrites") or []
    perms = _bot_permissions(check, member, roles, overwrites)
    missing = missing_permissions(perms, _POST_PERMISSIONS)
    lines = [ok_line]
    if missing:
        lines = [raid_copy.setup_missing_permissions(check.channel_id, permission_labels(missing))]
    can_ping = check.role_mentionable or has_permission(perms, MENTION_EVERYONE)
    if check.ping_role_id and not can_ping:
        lines.append(raid_copy.setup_role_not_pingable(check.ping_role_id))
    return [*lines, *_extras_lines(check, perms, _bot_permissions(check, member, roles, []), overwrites)]


def _bot_permissions(
    check: SetupCheck, member: dict[str, Any], roles: list[dict[str, Any]], overwrites: list[dict[str, Any]]
) -> int:
    """The bot's permissions under *overwrites* (none: its permissions in the server)."""
    return compute_channel_permissions(
        guild_id=check.guild_discord_id,
        member_id=check.application_id,
        member_role_ids=member.get("roles") or [],
        guild_roles=roles,
        channel_overwrites=overwrites,
    )


def _defaults_line(check: SetupCheck) -> list[str]:
    """What new raids get, once setup named a default or while one is on."""
    if check.extras_given or check.discord_events or check.threads:
        return [raid_extras_copy.setup_defaults(check.discord_events, check.threads)]
    return []


def _extras_lines(
    check: SetupCheck, channel_perms: int, server_perms: int, overwrites: list[dict[str, Any]]
) -> list[str]:
    """The defaults, then what the bot needs for them: Create Events in the server, Create Public Threads and
    (while raid posts are pinned) Pin Messages here."""
    lines = _defaults_line(check)
    can_make_events = has_permission(server_perms, CREATE_EVENTS) or has_permission(server_perms, MANAGE_EVENTS)
    if check.discord_events and not can_make_events:
        lines.append(raid_extras_copy.SETUP_NO_EVENTS)
    if check.threads and not has_permission(channel_perms, CREATE_PUBLIC_THREADS):
        lines.append(raid_extras_copy.setup_no_threads(check.channel_id))
    if check.discord_events and _hidden_from_everyone(check.guild_discord_id, overwrites):
        lines.append(raid_extras_copy.setup_private(check.channel_id))
    if check.pin_posts and not has_permission(channel_perms, PIN_MESSAGES):
        lines.append(raid_post_options_copy.setup_no_pins(check.channel_id))
    return lines


def _hidden_from_everyone(guild_discord_id: str, overwrites: list[dict[str, Any]]) -> bool:
    """@everyone's overwrite (its id is the server's) denies View Channel: the raid channel is private."""
    for overwrite in overwrites:
        if str(overwrite.get("id")) == guild_discord_id:
            return bool(parse_bitfield(overwrite.get("deny")) & VIEW_CHANNEL)
    return False
