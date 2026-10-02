"""/raid-admin setup's check — can the bot post where it was told to?

Runs as a background task after setup's deferred reply (``commands/raid_admin``),
like the rest of the bot's REST work (``raid_publisher``), and answers that
reply with what it found.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx
from platform_shared.services.discord import (
    EMBED_LINKS,
    MENTION_EVERYONE,
    SEND_MESSAGES,
    VIEW_CHANNEL,
    DiscordApiError,
    DiscordRestClient,
    compute_channel_permissions,
    has_permission,
    missing_permissions,
    permission_labels,
)

from app.services.discord import raid_copy, rest
from app.services.discord.interaction import ephemeral_data
from app.services.discord.raid_publisher import edit_original

logger = logging.getLogger(__name__)

_POST_PERMISSIONS = (VIEW_CHANNEL, SEND_MESSAGES, EMBED_LINKS)


@dataclass(frozen=True)
class SetupCheck:
    application_id: str
    token: str
    guild_discord_id: str
    channel_id: str
    ping_role_id: str | None
    role_mentionable: bool
    tz_name: str


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
        return [ok_line, raid_copy.SETUP_CHECK_FAILED]

    perms = compute_channel_permissions(
        guild_id=check.guild_discord_id,
        member_id=check.application_id,
        member_role_ids=member.get("roles") or [],
        guild_roles=roles,
        channel_overwrites=channel.get("permission_overwrites") or [],
    )
    missing = missing_permissions(perms, _POST_PERMISSIONS)
    lines = [ok_line]
    if missing:
        lines = [raid_copy.setup_missing_permissions(check.channel_id, permission_labels(missing))]
    can_ping = check.role_mentionable or has_permission(perms, MENTION_EVERYONE)
    if check.ping_role_id and not can_ping:
        lines.append(raid_copy.setup_role_not_pingable(check.ping_role_id))
    return lines
