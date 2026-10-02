"""Background work for the raid bot — every outbound Discord REST call.

Interaction handlers must answer Discord within 3 seconds, so they only do
local DB work and return the interaction response.  Anything that talks to
Discord's REST API (posting the raid, editing the public post after a
private flow, DMs — and the leader's ping, in ``raid_ping``, and the setup
permission check, in ``raid_setup_check``) is scheduled via FastAPI ``BackgroundTasks``, which
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
scheduled raid not yet started, else clearing ``message_id``; a raid
deleted from Raid: Edit has its post removed here too (``delete_post``).
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Any

import httpx
from platform_shared.services.discord import (
    CANNOT_SEND_MESSAGES_TO_USER,
    UNKNOWN_MESSAGE,
    DiscordApiError,
    DiscordRestClient,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import unit_of_work
from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.repositories.wow import wow_raid_event_repo, wow_raid_signup_repo
from app.services.discord import emojis, raid_copy, rest
from app.services.discord.interaction import NO_MENTIONS, ephemeral_data
from app.services.discord.raid_context import signup_refusal, utcnow
from app.services.discord.raid_draft_views import preview_data
from app.services.discord.raid_repeat_views import posted_data
from app.services.discord.raid_views import unix
from app.services.wow import raid_event_service
from app.services.wow.raid_details import leader_id
from app.services.wow.raid_embed import build_initial_post, build_signup_message
from app.services.wow.raid_text import local_day_label, title_text

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class _Snapshot:
    """Everything a task needs after its transaction closes (plain values).

    *ask_leader* is the raid's leader once members can't change their own
    sign-up (closed, or started): DMs send a player who can't come to them.
    """

    event_id: uuid.UUID
    status: str
    channel_id: str
    message_id: str | None
    guild_discord_id: str
    title: str
    day_label: str
    starts_unix: int
    cancel_reason: str | None
    ask_leader: str | None
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
    ask_leader = None
    if signup_refusal(event, utcnow()) is not None:
        ask_leader = leader_id(event)
    return _Snapshot(
        event_id=event.id,
        status=event.status,
        channel_id=event.channel_id,
        message_id=event.message_id,
        guild_discord_id=guild.discord_guild_id,
        title=title_text(event),
        day_label=local_day_label(event.starts_at, guild.timezone),
        starts_unix=unix(event.starts_at),
        cancel_reason=event.cancel_reason,
        ask_leader=ask_leader,
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


async def send_dm(client: DiscordRestClient, user_id: str, content: str) -> bool:
    """DM a player; False when it didn't go out (DMs closed, or Discord never answered)."""
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


async def create_post(client: DiscordRestClient, channel_id: str, message: dict[str, Any]) -> str:
    """Post a raid's message in *channel_id* and return its id; Discord's refusal or silence is raised.

    Every raid post goes out here: [Post raid], a repost after the post was deleted, and the
    raids a repeat posts.
    """
    created = await rest.bounded(client.create_message(channel_id, message))
    return str(created.get("id", ""))


async def post_raid(event_id: uuid.UUID, application_id: str, token: str) -> None:
    """Post the public signup message, then update the organiser's preview."""
    try:
        async with unit_of_work() as db:
            snapshot = await _load(db, event_id, initial_post=True)
        if snapshot is None or snapshot.status != "scheduled" or snapshot.message_id is not None:
            return
        async with rest.make_rest_client() as client:
            try:
                message_id = await create_post(client, snapshot.channel_id, snapshot.message)
            except DiscordApiError as exc:
                await _post_failed(client, event_id, application_id, token, snapshot.channel_id, exc.code)
                return
            except (TimeoutError, httpx.HTTPError) as exc:
                logger.warning("Raid bot: posting raid %s got no answer from Discord (%s)", event_id, type(exc).__name__)
                await _post_failed(client, event_id, application_id, token, snapshot.channel_id, None)
                return

            async with unit_of_work() as db:
                event = await wow_raid_event_repo.get_for_update(db, event_id)
                if event is not None:
                    await wow_raid_event_repo.set_message_id(db, event, message_id)
            link = rest.message_link(snapshot.guild_discord_id, snapshot.channel_id, message_id)
            await edit_original(client, application_id, token, posted_data(snapshot.channel_id, link, event_id))
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
            # The post keeps what it showed before; say which raid it is.
            logger.warning(
                "Raid bot: Discord refused the edit of raid %s's post (status %s, code %s)",
                snapshot.event_id,
                exc.status,
                exc.code,
            )
            return
    except (TimeoutError, httpx.HTTPError) as exc:
        logger.warning(
            "Raid bot: editing raid post %s got no answer from Discord (%s)", snapshot.event_id, type(exc).__name__
        )
        return

    # 10008 — someone deleted the public post.  Decide on the raid as it is
    # now: deleted meanwhile (Raid: Edit → Delete raid takes its post with it)
    # or no longer scheduled (or started: its post is final), it isn't posted again.
    async with unit_of_work() as db:
        event = await wow_raid_event_repo.get_for_update(db, snapshot.event_id)
        if event is None:
            return
        if event.status != "scheduled" or event.start_applied_at is not None:
            await wow_raid_event_repo.clear_message_id(db, event)
            return
    logger.info("Raid bot: raid post for %s was deleted; reposting", snapshot.event_id)
    try:
        message_id = await create_post(client, snapshot.channel_id, snapshot.message)
    except (DiscordApiError, TimeoutError, httpx.HTTPError) as exc:
        logger.warning("Raid bot: reposting raid %s failed (%s)", snapshot.event_id, type(exc).__name__)
        return
    async with unit_of_work() as db:
        event = await wow_raid_event_repo.get_for_update(db, snapshot.event_id)
        if event is not None:
            await wow_raid_event_repo.set_message_id(db, event, message_id)
            return
    # Deleted while the repost was on its way: take the new post down too.
    await _delete_message(client, snapshot.channel_id, message_id)


async def delete_post(channel_id: str, message_id: str | None, application_id: str, token: str) -> None:
    """Raid: Edit → Delete raid: remove the post, then tell the leader whether it went."""
    try:
        async with rest.make_rest_client() as client:
            outcome = raid_copy.DELETED
            if message_id is not None and not await _delete_message(client, channel_id, message_id):
                outcome = raid_copy.DELETE_POST_LEFT
            await edit_original(client, application_id, token, ephemeral_data(outcome))
    except Exception:
        logger.exception("Raid bot: delete_post failed for message %s", message_id)


async def _delete_message(client: DiscordRestClient, channel_id: str, message_id: str) -> bool:
    """Delete a raid post; False when it may still be there.  Already gone (10008) counts as done."""
    try:
        await rest.bounded(client.delete_message(channel_id, message_id))
    except DiscordApiError as exc:
        if exc.code == UNKNOWN_MESSAGE:
            return True
        logger.warning("Raid bot: could not delete raid post %s (status %s, code %s)", message_id, exc.status, exc.code)
        return False
    except (TimeoutError, httpx.HTTPError) as exc:
        logger.warning("Raid bot: deleting raid post %s got no answer from Discord (%s)", message_id, type(exc).__name__)
        return False
    return True


async def send_ephemeral_followup(
    application_id: str, token: str, content: str, components: list[dict[str, Any]] | None = None
) -> None:
    """A private note after an UPDATE_MESSAGE response (e.g. 'you're #2 in the queue'), with *components* if any."""
    data = ephemeral_data(content)
    if components is not None:
        data = ephemeral_data(content, components=components)
    try:
        async with rest.make_rest_client() as client:
            await rest.bounded(client.create_followup_message(application_id, token, data))
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
        content = raid_copy.promoted_dm(
            snapshot.title, snapshot.starts_unix, _snapshot_link(snapshot), ask_leader=snapshot.ask_leader
        )
        async with rest.make_rest_client() as client:
            for user_id in user_ids:
                await send_dm(client, user_id, content)
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
                await send_dm(client, user_id, dm_text)
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


def event_link(guild_discord_id: str, event: WowRaidEvent) -> str | None:
    if event.message_id is None:
        return None
    return rest.message_link(guild_discord_id, event.channel_id, event.message_id)
