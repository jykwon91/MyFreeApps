"""Background work for the raid bot — every outbound Discord REST call.

Interaction handlers must answer Discord within 3 seconds, so they only do
local DB work and return the interaction response.  Anything that talks to
Discord's REST API (posting the raid, editing the public post after a
private flow, DMs, the setup permission check — and the leader's ping, in
``raid_ping``) is scheduled via FastAPI ``BackgroundTasks``, which
Starlette runs right after the response is sent.  Each task:

* opens its own short transaction(s) — the request's transaction has
  already committed;
* bounds every REST call with ``rest.bounded`` (timeout) — the shared client
  already honours 429 ``retry_after``;
* treats "Discord never answered" — ``TimeoutError`` or an ``httpx.HTTPError``
  (see ``rest.bounded``) — like a refusal;
* never raises: failures are logged with the Discord error code (the shared
  client logs status + code + route) and, where a user is waiting on a
  deferred/"Posting…" message, that message is edited with an explanation.

Deleted public post (Discord error 10008) is handled by reposting for a
scheduled raid, or clearing ``message_id`` for a cancelled one.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Any

import httpx
from platform_shared.services.discord import (
    CANNOT_SEND_MESSAGES_TO_USER,
    EMBED_LINKS,
    MENTION_EVERYONE,
    SEND_MESSAGES,
    UNKNOWN_MESSAGE,
    VIEW_CHANNEL,
    DiscordApiError,
    DiscordRestClient,
    compute_channel_permissions,
    has_permission,
    missing_permissions,
    permission_labels,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import unit_of_work
from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.repositories.wow import wow_raid_event_repo, wow_raid_signup_repo
from app.services.discord import emojis, raid_copy, rest
from app.services.discord.interaction import NO_MENTIONS, ephemeral_data
from app.services.discord.raid_views import preview_data, unix
from app.services.wow import raid_event_service
from app.services.wow.raid_embed import build_initial_post, build_signup_message
from app.services.wow.raid_text import display_title, local_day_label

logger = logging.getLogger(__name__)

_POST_PERMISSIONS = (VIEW_CHANNEL, SEND_MESSAGES, EMBED_LINKS)


@dataclass(frozen=True)
class _Snapshot:
    """Everything a task needs after its transaction closes (plain values)."""

    event_id: uuid.UUID
    status: str
    channel_id: str
    message_id: str | None
    guild_discord_id: str
    title: str
    day_label: str
    starts_unix: int
    cancel_reason: str | None
    message: dict[str, Any]


async def _load(db: AsyncSession, event_id: uuid.UUID, *, initial_post: bool = False) -> _Snapshot | None:
    event = await wow_raid_event_repo.get(db, event_id)
    if event is None:
        return None
    guild = await db.get(WowRaidGuild, event.guild_id)
    if guild is None:
        return None
    signups = await wow_raid_signup_repo.list_for_event(db, event.id)
    icons = emojis.current()
    if initial_post:
        message = build_initial_post(event, signups, guild, ping_role=True, emojis=icons)
    else:
        message = build_signup_message(event, signups, guild, emojis=icons)
    return _Snapshot(
        event_id=event.id,
        status=event.status,
        channel_id=event.channel_id,
        message_id=event.message_id,
        guild_discord_id=guild.discord_guild_id,
        title=display_title(event),
        day_label=local_day_label(event.starts_at, guild.timezone),
        starts_unix=unix(event.starts_at),
        cancel_reason=event.cancel_reason,
        message=message,
    )


def _snapshot_link(snapshot: _Snapshot) -> str | None:
    if snapshot.message_id is None:
        return None
    return rest.message_link(snapshot.guild_discord_id, snapshot.channel_id, snapshot.message_id)


def _edit_body(data: dict[str, Any]) -> dict[str, Any]:
    """Webhook message edits can't change flags — strip them."""
    body = dict(data)
    body.pop("flags", None)
    return body


async def edit_original(client: DiscordRestClient, application_id: str, token: str, data: dict[str, Any]) -> None:
    """Replace a deferred reply or "Posting…" card; a failure is logged, never raised."""
    try:
        await rest.bounded(client.edit_original_interaction_response(application_id, token, _edit_body(data)))
    except (DiscordApiError, TimeoutError, httpx.HTTPError) as exc:
        logger.warning("Raid bot: could not edit the original interaction response (%s)", type(exc).__name__)


async def _send_dm(client: DiscordRestClient, user_id: str, content: str) -> bool:
    try:
        await rest.bounded(client.send_dm(user_id, {"content": content, "allowed_mentions": NO_MENTIONS}))
        return True
    except DiscordApiError as exc:
        if exc.code == CANNOT_SEND_MESSAGES_TO_USER:
            logger.info("Raid bot: user has DMs closed (50007); skipping DM")
        return False
    except (TimeoutError, httpx.HTTPError) as exc:
        logger.warning("Raid bot: DM got no answer from Discord (%s)", type(exc).__name__)
        return False


# ---------------------------------------------------------------------------
# Posting the raid ([Post raid] on the create preview)
# ---------------------------------------------------------------------------


async def post_raid(event_id: uuid.UUID, application_id: str, token: str) -> None:
    """Post the public signup message, then update the organiser's preview."""
    try:
        async with unit_of_work() as db:
            snapshot = await _load(db, event_id, initial_post=True)
        if snapshot is None or snapshot.status != "scheduled" or snapshot.message_id is not None:
            return
        async with rest.make_rest_client() as client:
            try:
                created = await rest.bounded(client.create_message(snapshot.channel_id, snapshot.message))
            except DiscordApiError as exc:
                await _post_failed(client, event_id, application_id, token, snapshot.channel_id, exc.code)
                return
            except (TimeoutError, httpx.HTTPError) as exc:
                logger.warning("Raid bot: posting raid %s got no answer from Discord (%s)", event_id, type(exc).__name__)
                await _post_failed(client, event_id, application_id, token, snapshot.channel_id, None)
                return

            message_id = str(created.get("id", ""))
            async with unit_of_work() as db:
                event = await wow_raid_event_repo.get_for_update(db, event_id)
                if event is not None:
                    await wow_raid_event_repo.set_message_id(db, event, message_id)
            link = rest.message_link(snapshot.guild_discord_id, snapshot.channel_id, message_id)
            await edit_original(client, application_id, token, ephemeral_data(raid_copy.posted(snapshot.channel_id, link)))
    except Exception:
        logger.exception("Raid bot: post_raid failed for event %s", event_id)


async def _post_failed(
    client: DiscordRestClient,
    event_id: uuid.UUID,
    application_id: str,
    token: str,
    channel_id: str,
    discord_code: int | None,
) -> None:
    """Put the raid back into draft and show the preview again with the reason."""
    notice = raid_copy.post_refused(channel_id, discord_code)
    async with unit_of_work() as db:
        event = await wow_raid_event_repo.get_for_update(db, event_id)
        if event is None or event.status != "scheduled" or event.message_id is not None:
            return
        await raid_event_service.revert_to_draft(db, event)
        guild = await db.get(WowRaidGuild, event.guild_id)
        if guild is None:
            return
        preview = preview_data(event, guild, emojis=emojis.current(), notice=notice)
    await edit_original(client, application_id, token, preview)


# ---------------------------------------------------------------------------
# Keeping the public post in sync
# ---------------------------------------------------------------------------


async def refresh_public_message(event_id: uuid.UUID) -> None:
    """Re-render the public post after a change made outside it (picker, edit, cancel)."""
    try:
        async with unit_of_work() as db:
            snapshot = await _load(db, event_id)
        if snapshot is None or snapshot.message_id is None:
            # Not posted yet (or post in flight) — post_raid owns the first post.
            return
        async with rest.make_rest_client() as client:
            await _edit_or_repost(client, snapshot)
    except Exception:
        logger.exception("Raid bot: refresh_public_message failed for event %s", event_id)


async def _edit_or_repost(client: DiscordRestClient, snapshot: _Snapshot) -> None:
    assert snapshot.message_id is not None
    try:
        await rest.bounded(client.edit_message(snapshot.channel_id, snapshot.message_id, snapshot.message))
        return
    except DiscordApiError as exc:
        if exc.code != UNKNOWN_MESSAGE:
            return
    except (TimeoutError, httpx.HTTPError) as exc:
        logger.warning(
            "Raid bot: editing raid post %s got no answer from Discord (%s)", snapshot.event_id, type(exc).__name__
        )
        return

    # 10008 — someone deleted the public post.
    if snapshot.status != "scheduled":
        async with unit_of_work() as db:
            event = await wow_raid_event_repo.get_for_update(db, snapshot.event_id)
            if event is not None:
                event.message_id = None
                await db.flush()
        return
    logger.info("Raid bot: raid post for %s was deleted; reposting", snapshot.event_id)
    try:
        created = await rest.bounded(client.create_message(snapshot.channel_id, snapshot.message))
    except (DiscordApiError, TimeoutError, httpx.HTTPError) as exc:
        logger.warning("Raid bot: reposting raid %s failed (%s)", snapshot.event_id, type(exc).__name__)
        return
    async with unit_of_work() as db:
        event = await wow_raid_event_repo.get_for_update(db, snapshot.event_id)
        if event is not None:
            await wow_raid_event_repo.set_message_id(db, event, str(created.get("id", "")))


async def send_ephemeral_followup(application_id: str, token: str, content: str) -> None:
    """A private note after an UPDATE_MESSAGE response (e.g. 'you're #2 in the queue')."""
    try:
        async with rest.make_rest_client() as client:
            await rest.bounded(client.create_followup_message(application_id, token, ephemeral_data(content)))
    except (DiscordApiError, TimeoutError, httpx.HTTPError) as exc:
        logger.warning("Raid bot: follow-up message failed (%s)", type(exc).__name__)
    except Exception:
        logger.exception("Raid bot: follow-up message crashed")


# ---------------------------------------------------------------------------
# DMs: moved up from the queue, cancellation, test DM
# ---------------------------------------------------------------------------


async def notify_promoted(event_id: uuid.UUID, user_ids: list[str]) -> None:
    """DM players moved up from the queue (already filtered for DM opt-out)."""
    if not user_ids:
        return
    try:
        async with unit_of_work() as db:
            snapshot = await _load(db, event_id)
        if snapshot is None:
            return
        content = raid_copy.promoted_dm(snapshot.title, snapshot.starts_unix, _snapshot_link(snapshot))
        async with rest.make_rest_client() as client:
            for user_id in user_ids:
                await _send_dm(client, user_id, content)
    except Exception:
        logger.exception("Raid bot: notify_promoted failed for event %s", event_id)


async def announce_cancellation(event_id: uuid.UUID, dm_user_ids: list[str]) -> None:
    """Grey out the public post, tell the channel, DM the people who were coming."""
    try:
        async with unit_of_work() as db:
            snapshot = await _load(db, event_id)
        if snapshot is None:
            return
        async with rest.make_rest_client() as client:
            if snapshot.message_id is not None:
                await _edit_or_repost(client, snapshot)
            announcement = raid_copy.cancellation_announcement(snapshot.title, snapshot.day_label, snapshot.cancel_reason)
            try:
                await rest.bounded(
                    client.create_message(snapshot.channel_id, {"content": announcement, "allowed_mentions": NO_MENTIONS})
                )
            except (DiscordApiError, TimeoutError, httpx.HTTPError) as exc:
                logger.warning(
                    "Raid bot: cancellation announcement failed for event %s (%s)", event_id, type(exc).__name__
                )
            dm_text = raid_copy.cancellation_dm(snapshot.title, snapshot.starts_unix, snapshot.cancel_reason)
            for user_id in dm_user_ids:
                await _send_dm(client, user_id, dm_text)
    except Exception:
        logger.exception("Raid bot: announce_cancellation failed for event %s", event_id)


async def send_test_dm(user_id: str, application_id: str, token: str) -> None:
    """[Send me a test DM] — report the outcome in the deferred private reply."""
    try:
        async with rest.make_rest_client() as client:
            try:
                await rest.bounded(
                    client.send_dm(user_id, {"content": raid_copy.TEST_DM_BODY, "allowed_mentions": NO_MENTIONS})
                )
                result = raid_copy.TEST_DM_SENT
            except DiscordApiError as exc:
                result = raid_copy.TEST_DM_FAILED
                if exc.code == CANNOT_SEND_MESSAGES_TO_USER:
                    result = raid_copy.TEST_DM_BLOCKED
            except (TimeoutError, httpx.HTTPError) as exc:
                logger.warning("Raid bot: test DM got no answer from Discord (%s)", type(exc).__name__)
                result = raid_copy.TEST_DM_FAILED
            await edit_original(client, application_id, token, ephemeral_data(result))
    except Exception:
        logger.exception("Raid bot: send_test_dm failed")


# ---------------------------------------------------------------------------
# /raid-admin setup — verify the bot can post where it was told to
# ---------------------------------------------------------------------------


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


def event_link(guild_discord_id: str, event: WowRaidEvent) -> str | None:
    if event.message_id is None:
        return None
    return rest.message_link(guild_discord_id, event.channel_id, event.message_id)
