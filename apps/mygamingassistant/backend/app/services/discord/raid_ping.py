"""Raid: Signed → [Ping signed members] — posting the leader's ping.

``raid_leader.handle_ping_submit`` (and Raid: Edit's [Tell them in channel])
claims the raid's ping slot, answers "Pinging N people…" and schedules
:func:`send_ping`, which runs after the response like the rest of the bot's
background work (``raid_publisher``): its own transactions, every REST call
bounded, never raises.

The messages go out in order — the first as a reply to the raid post — and
stop at the first one Discord doesn't take.  The leader's card then says:

* every message went out → how many people were pinged;
* Discord refused the first → nobody was pinged, so the slot is handed back
  and the leader can try again at once;
* Discord refused a later one → how many were reached;
* Discord never answered (timeout, connection error, 5xx) or the task
  crashed → that message may have gone out, so the slot stays claimed (a
  retry can't double-ping) and the card says to check the channel.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import httpx
from platform_shared.services.discord import CANNOT_REPLY_WITHOUT_READ_HISTORY, DiscordApiError, DiscordRestClient

from app.db.session import unit_of_work
from app.repositories.wow import wow_raid_event_repo
from app.services.discord import raid_copy, rest
from app.services.discord.interaction import ephemeral_data
from app.services.discord.raid_publisher import edit_original
from app.services.wow import raid_event_service

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PingJob:
    """A ping the leader sent, captured inside the request's transaction."""

    event_id: uuid.UUID
    channel_id: str
    post_id: str | None  # the raid post the first message replies to
    messages: list[dict[str, Any]]  # ``raid_notifications.build_ping``
    application_id: str
    token: str  # the modal submit's: its card shows the outcome
    claimed_at: datetime  # ``raid_event_service.claim_ping``'s slot


@dataclass(frozen=True)
class _Stop:
    """Where the messages stopped short, and why."""

    sent: int  # messages that went out before it
    code: int | None  # Discord's error code, when it refused
    unanswered: bool  # no answer: that message may have gone out anyway


async def send_ping(job: PingJob) -> None:
    """Post the ping, then swap the leader's "Pinging…" card for the outcome."""
    try:
        async with rest.make_rest_client() as client:
            stop = await _post_ping(client, job)
            if stop is not None and stop.sent == 0 and not stop.unanswered:
                await _release_slot(job)
            await edit_original(client, job.application_id, job.token, ephemeral_data(_outcome(job, stop)))
    except Exception:
        logger.exception("Raid bot: send_ping failed for event %s", job.event_id)
        await _report_unconfirmed(job)


def _outcome(job: PingJob, stop: _Stop | None) -> str:
    total = _mentioned(job.messages)
    if stop is None:
        return raid_copy.ping_sent(total)
    if stop.unanswered:
        return raid_copy.ping_unconfirmed(job.channel_id)
    if stop.sent == 0:
        return raid_copy.ping_refused(job.channel_id, stop.code)
    return raid_copy.ping_partly_sent(_mentioned(job.messages[: stop.sent]), total)


async def _post_ping(client: DiscordRestClient, job: PingJob) -> _Stop | None:
    """Send the messages in order; None once all went out."""
    for index, message in enumerate(job.messages):
        reply_to = job.post_id if index == 0 else None
        try:
            await _create_ping_message(client, job.channel_id, message, reply_to)
        except DiscordApiError as exc:
            logger.warning(
                "Raid bot: Discord refused the ping for raid %s (status %s, code %s)", job.event_id, exc.status, exc.code
            )
            return _Stop(sent=index, code=exc.code, unanswered=exc.status >= 500)
        except (TimeoutError, httpx.HTTPError) as exc:
            logger.warning("Raid bot: ping for raid %s got no answer from Discord (%s)", job.event_id, type(exc).__name__)
            return _Stop(sent=index, code=None, unanswered=True)
    return None


async def _create_ping_message(
    client: DiscordRestClient, channel_id: str, message: dict[str, Any], reply_to: str | None
) -> None:
    """Send one ping message, as a reply when *reply_to* is set.

    A reply needs Read Message History (160002 without it), so then it goes
    out as a plain message.  ``fail_if_not_exists: False`` sends it plain
    when the raid post is gone.
    """
    body = {**message, "allowed_mentions": {**message["allowed_mentions"], "replied_user": False}}
    if reply_to is not None:
        reply = {**body, "message_reference": {"message_id": reply_to, "fail_if_not_exists": False}}
        try:
            await rest.bounded(client.create_message(channel_id, reply))
            return
        except DiscordApiError as exc:
            if exc.code != CANNOT_REPLY_WITHOUT_READ_HISTORY:
                raise
    await rest.bounded(client.create_message(channel_id, body))


def _mentioned(messages: list[dict[str, Any]]) -> int:
    """How many people *messages* ping."""
    return sum(len(message["allowed_mentions"]["users"]) for message in messages)


async def _release_slot(job: PingJob) -> None:
    """Nobody was pinged: hand the slot back so the leader can try again at once."""
    async with unit_of_work() as db:
        event = await wow_raid_event_repo.get_for_update(db, job.event_id)
        if event is not None:
            await raid_event_service.release_ping(db, event, claimed_at=job.claimed_at)


async def _report_unconfirmed(job: PingJob) -> None:
    """After a crash, best effort: don't leave the leader's card on "Pinging…"."""
    try:
        async with rest.make_rest_client() as client:
            data = ephemeral_data(raid_copy.ping_unconfirmed(job.channel_id))
            await edit_original(client, job.application_id, job.token, data)
    except Exception:
        logger.exception("Raid bot: could not report the ping's outcome for event %s", job.event_id)
