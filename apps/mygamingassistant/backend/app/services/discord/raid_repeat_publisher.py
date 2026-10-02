"""A repeat's next raid — the notification worker's post (step 5 of ``raid_sweeps``).

:func:`post_next` takes the repeat due soonest (SKIP LOCKED) and, in the
caller's transaction, copies the latest raid in it to the next slot, posts
it, then keeps the post's message and moves the repeat on.  The insert,
the message id and the move commit together, so each raid posts once:

* Discord silent, slow or busy (a timeout, 429, 5xx) → :class:`RepeatDeferred`:
  the caller rolls back, and the next tick tries the same raid.
* Discord refuses the post (no permission, channel gone, body rejected),
  or anything else breaks → :class:`RepeatFailed`: the caller rolls back
  and :func:`stop_after_failure` stops the repeat and DMs its creator why,
  so one broken repeat never holds up the others.

Missed slots (downtime) are skipped, never posted into the past, and a
repeat whose raids were all deleted ends without a post.  Every raid post
goes out through ``raid_publisher.create_post``.

A timeout where Discord did create the message leaves that post orphaned
(its buttons name a raid that was never saved) and the next tick posts
again: the same gap as ``raid_publisher.post_raid``'s, and as rare.
"""
from __future__ import annotations

import logging
import uuid
from collections.abc import Callable, Collection
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import httpx
from platform_shared.services.discord import DiscordApiError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_series import WowRaidSeries
from app.repositories.wow import wow_raid_guild_repo, wow_raid_series_repo
from app.services.discord import emojis, raid_publisher, raid_repeat_copy, rest
from app.services.wow import raid_event_service, raid_series_service
from app.services.wow.raid_embed import build_initial_post
from app.services.wow.raid_text import title_text

logger = logging.getLogger(__name__)

SessionScope = Callable[[], AbstractAsyncContextManager[AsyncSession]]


@dataclass(frozen=True)
class Turn:
    """A repeat's turn: ``posted`` its next raid (*event_id*), ``skipped`` missed raids (the next isn't due yet),
    or ``ended`` (no raid left to copy)."""

    series_id: uuid.UUID
    kind: str
    event_id: uuid.UUID | None = None


class RepeatDeferred(Exception):
    """Discord didn't answer, or asked to wait: nothing changed, and the next tick tries again."""


class RepeatFailed(Exception):
    """A repeat's post was refused (Discord's *status* and *code*) or broke (*status* None)."""

    def __init__(self, series_id: uuid.UUID, channel_id: str | None, status: int | None, code: int | None) -> None:
        super().__init__(f"repeat {series_id}: status={status} code={code}")
        self.series_id = series_id
        self.channel_id = channel_id
        self.status = status
        self.code = code


async def post_next(db: AsyncSession, now: datetime, *, skip: Collection[uuid.UUID] = ()) -> Turn | None:
    """Take the repeat due soonest (leaving out *skip*) and post its next raid; None when none is due."""
    series = await wow_raid_series_repo.lock_due(db, now, skip=skip)
    if series is None:
        return None
    series_id = series.id
    try:
        return await _take_turn(db, series, now)
    except (RepeatDeferred, RepeatFailed):
        raise
    except Exception as exc:
        logger.exception("raid_notifications: repeat %s broke posting its next raid", series_id)
        raise RepeatFailed(series_id, None, None, None) from exc


async def _take_turn(db: AsyncSession, series: WowRaidSeries, now: datetime) -> Turn:
    series_id = series.id
    template = await raid_series_service.template(db, series)
    if template is None:
        await raid_series_service.end(db, series)
        return Turn(series_id, "ended")
    if not await raid_series_service.catch_up(db, series, now):
        return Turn(series_id, "skipped")
    guild = await wow_raid_guild_repo.get(db, series.guild_id)
    assert guild is not None, "a repeat is deleted with its server (CASCADE)"
    channel_id = raid_series_service.channel_for(guild, template)
    event = await raid_series_service.create_next(db, series, template, channel_id)
    message = build_initial_post(event, [], guild, ping_role=True, emojis=emojis.current())
    message_id = await _post(series_id, channel_id, message)
    await raid_series_service.finish_posted(db, series, event, guild, message_id, now)
    return Turn(series_id, "posted", event.id)


async def _post(series_id: uuid.UUID, channel_id: str, message: dict[str, Any]) -> str:
    """Post the raid; Discord's refusal is :class:`RepeatFailed`, its silence or a 429/5xx :class:`RepeatDeferred`."""
    try:
        async with rest.make_rest_client() as client:
            return await raid_publisher.create_post(client, channel_id, message)
    except DiscordApiError as exc:
        if exc.status == 429 or exc.status >= 500:
            raise RepeatDeferred(f"status={exc.status} code={exc.code}") from exc
        logger.warning(
            "raid_notifications: Discord refused repeat %s's post in channel %s: status=%s code=%s message=%s",
            series_id,
            channel_id,
            exc.status,
            exc.code,
            exc.message,
        )
        raise RepeatFailed(series_id, channel_id, exc.status, exc.code) from exc
    except (TimeoutError, httpx.HTTPError) as exc:
        raise RepeatDeferred(type(exc).__name__) from exc


async def stop_after_failure(scope: SessionScope, failed: RepeatFailed) -> bool:
    """Stop the repeat whose post failed, then DM its creator why; False when it's gone or another worker has it."""
    async with scope() as db:
        series = await wow_raid_series_repo.lock_for_change(db, failed.series_id)
        if series is None:
            return False
        dm = await _stopped_dm(db, series, failed)
        await raid_series_service.end(db, series)
    if dm is not None:
        async with rest.make_rest_client() as client:
            await raid_publisher.send_dm(client, *dm)
    return True


async def _stopped_dm(db: AsyncSession, series: WowRaidSeries, failed: RepeatFailed) -> tuple[str, str] | None:
    """(the repeat's creator, why it stopped); None when they've opted out of DMs or no raid is left."""
    template = await raid_series_service.template(db, series)
    guild = await wow_raid_guild_repo.get(db, series.guild_id)
    if template is None or guild is None:
        return None
    recipients = await raid_event_service.dm_recipients(db, guild=guild, user_ids=[series.created_by_user_id])
    if not recipients:
        return None
    reason = raid_repeat_copy.stop_reason(failed.channel_id, failed.status, failed.code)
    link = raid_publisher.event_link(guild.discord_guild_id, template)
    return recipients[0], raid_repeat_copy.stopped_dm(title_text(template), reason, link)
