"""A raid's Discord event and thread — every Discord call for them.

Each runs inside a background task that's already open:

* :func:`sync` — after [Post raid] posts the raid, after every re-render of
  its post (``raid_publisher.refresh_public_message``: Raid: Edit, sign-ups,
  the sweeps, a repost), after a repeat posts its next raid, and from the
  Event & thread card.  It loads the raid, asks ``raid_extras_rules.plan``,
  then does the event's step and the thread's (``raid_extras_thread``).  A
  sign-up changes neither the event's payload nor the thread's name: one
  read, no call.
* :func:`remove_event` / :func:`archive_thread` — the card's toggles off.
* :func:`end` / :func:`end_for` — Delete raid and Cancel raid.

No DB lock is held across a Discord call.  An event create is claimed under
the row lock and committed before the POST, so two syncs make one event; one
that lands after the raid was cancelled or the toggle turned off is deleted
at once (the landing check), and a new thread is archived.  Discord's
refusals are stored (``*_error``) and logged with their code; nothing retries
them until the leader taps Try again or turns the extra on.  Silence, 429 and
5xx store nothing (an event create keeps its claim), so the next sync tries
again.  Nothing here raises: the raid never waits on its extras.

Never imports ``raid_publisher``, which imports this.
"""
from __future__ import annotations

import logging
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import replace
from datetime import datetime
from typing import Any, Final

from platform_shared.services.discord import DiscordRestClient

from app.core.config import settings
from app.db.session import unit_of_work
from app.repositories.wow import wow_raid_event_repo, wow_raid_guild_repo
from app.services.discord import raid_extras_thread, rest
from app.services.discord.raid_context import utcnow
from app.services.discord.raid_edit_views import leader_text
from app.services.discord.raid_extras_calls import Answer, Raid, ask, warn
from app.services.wow import raid_extras_rules
from app.services.wow.raid_extras_rules import Leftovers, Step, Synced

logger = logging.getLogger(__name__)

_NONE: Final = Step("none")


async def sync(client: DiscordRestClient, event_id: uuid.UUID, *, reopen_thread: bool = False) -> Synced:
    """Bring the raid's Discord event and thread in line with the raid; what happened to each.

    *reopen_thread* renames (so unarchives) the bot's thread even when its
    name is right: the leader turned it on again.
    """
    try:
        async with unit_of_work() as db:
            raid = await _load(db, event_id, utcnow(), reopen_thread)
        if raid is None:
            return Synced(_NONE, _NONE)
        return Synced(await _sync_event(client, raid), await raid_extras_thread.sync(client, raid))
    except Exception:
        logger.exception("Raid bot: syncing raid %s's Discord event and thread failed", event_id)
        return Synced(_NONE, _NONE)


async def _load(db: Any, event_id: uuid.UUID, now: datetime, reopen_thread: bool) -> Raid | None:
    """The raid as a sync needs it; None when it isn't posted or neither extra is on."""
    event = await wow_raid_event_repo.get(db, event_id)
    if event is None or event.message_id is None:
        return None
    if not (event.discord_event_enabled or event.thread_enabled):
        return None
    guild = await wow_raid_guild_repo.get(db, event.guild_id)
    if guild is None:
        return None
    link = rest.message_link(guild.discord_guild_id, event.channel_id, event.message_id)
    payload = raid_extras_rules.event_payload(event, leader=leader_text(event), post_link=link)
    name = raid_extras_rules.thread_name(event, guild.timezone)
    planned = raid_extras_rules.plan(event, payload=payload, thread_name=name, now=now, reopen_thread=reopen_thread)
    return Raid(
        event_id=event.id,
        guild_discord_id=guild.discord_guild_id,
        channel_id=event.channel_id,
        message_id=event.message_id,
        starts_at=event.starts_at,
        post_link=link,
        payload=payload,
        thread_name=name,
        discord_event_id=event.discord_event_id,
        thread_id=event.thread_id,
        plan=planned,
    )


# ---------------------------------------------------------------------------
# The event
# ---------------------------------------------------------------------------


async def _sync_event(client: DiscordRestClient, raid: Raid) -> Step:
    step = raid.plan.event
    if step in ("create", "adopt_or_create"):
        return await _create(client, raid, adopt=step == "adopt_or_create")
    if step == "patch":
        return await _patch(client, raid)
    if step == "replace":
        return await _replace(client, raid)
    return Step(step)  # none, started or busy


async def _create(client: DiscordRestClient, raid: Raid, *, adopt: bool) -> Step:
    """Claim the create, then adopt the event an earlier create made (*adopt*: it may have timed out) or POST one."""
    if not await _claim(raid.event_id):
        return Step("busy")
    if adopt:
        listed = await ask(client.list_guild_scheduled_events(raid.guild_discord_id))
        if not listed.ok:
            return await _create_failed(raid, listed, "lookup")
        mine = _made_by_bot(listed.body, raid.post_link)
        if mine is not None:
            return await _adopt(client, raid, mine)
    body = raid_extras_rules.create_body(raid.payload)
    answer = await ask(client.create_guild_scheduled_event(raid.guild_discord_id, body))
    if not answer.ok:
        return await _create_failed(raid, answer, "create")
    made = str(answer.body.get("id", ""))
    if await _keep_landed(raid, made, digest=raid_extras_rules.payload_digest(raid.payload), starts_at=raid.starts_at):
        return Step("made")
    await _delete_late(client, raid, made)
    return _NONE


async def _claim(event_id: uuid.UUID) -> bool:
    """Mark a create in flight, committed before the POST; False when one is (or an event has appeared)."""
    now = utcnow()
    async with unit_of_work() as db:
        event = await wow_raid_event_repo.get_for_update(db, event_id)
        if event is None or event.discord_event_id is not None or raid_extras_rules.claim_fresh(event, now):
            return False
        await wow_raid_event_repo.claim_discord_event(db, event, now)
        return True


async def _create_failed(raid: Raid, answer: Answer, step: str) -> Step:
    warn(answer, "event", step, raid.event_id)
    if answer.kind == "transient":
        return Step("failed", answer.code)  # the claim stays: the next sync looks before it makes another
    await _refuse_event(raid.event_id, None, answer.error)
    return Step("refused", answer.error)


def _made_by_bot(events: list[dict[str, Any]], post_link: str) -> str | None:
    """The id of the server's event whose location is this raid's post and which the bot made."""
    for listed in events:
        location = (listed.get("entity_metadata") or {}).get("location")
        if location == post_link and str(listed.get("creator_id")) == settings.discord_application_id:
            return str(listed["id"])
    return None


async def _adopt(client: DiscordRestClient, raid: Raid, discord_event_id: str) -> Step:
    """Take on the event an earlier create made, then PATCH it to the raid as it is now."""
    if not await _keep_landed(raid, discord_event_id, digest=None, starts_at=None):
        await _delete_late(client, raid, discord_event_id)
        return _NONE
    patched = await _patch(client, replace(raid, discord_event_id=discord_event_id))
    if patched.verdict == "updated":
        return Step("adopted")
    return patched


async def _keep_landed(raid: Raid, discord_event_id: str, *, digest: str | None, starts_at: datetime | None) -> bool:
    """The landing check: store the new event, or say no when the raid was deleted, cancelled or toggled off."""
    async with unit_of_work() as db:
        event = await wow_raid_event_repo.get_for_update(db, raid.event_id)
        if event is None:
            return False
        if event.status != "scheduled" or not event.discord_event_enabled:
            await wow_raid_event_repo.set_discord_event_state(
                db, event, event_id=None, digest=None, starts_at=None, error=event.discord_event_error
            )
            return False
        await wow_raid_event_repo.set_discord_event_state(
            db, event, event_id=discord_event_id, digest=digest, starts_at=starts_at, error=None
        )
        return True


async def _delete_late(client: DiscordRestClient, raid: Raid, discord_event_id: str) -> None:
    """Take down an event that landed after the raid moved on (as a late repost is taken down)."""
    answer = await ask(client.delete_guild_scheduled_event(raid.guild_discord_id, discord_event_id))
    if answer.kind not in ("ok", "gone"):
        warn(answer, "event", "late delete", raid.event_id)


async def _patch(client: DiscordRestClient, raid: Raid) -> Step:
    """Send the raid's payload; an event that has ended is replaced, one someone deleted turns the toggle off."""
    assert raid.discord_event_id is not None
    answer = await ask(
        client.modify_guild_scheduled_event(raid.guild_discord_id, raid.discord_event_id, raid.payload)
    )
    if answer.ok:
        digest = raid_extras_rules.payload_digest(raid.payload)
        await _set_event(raid.event_id, raid.discord_event_id, raid.discord_event_id, digest, raid.starts_at)
        return Step("updated")
    warn(answer, "event", "update", raid.event_id)
    if answer.kind == "finished":
        return await _replace(client, raid)
    if answer.kind == "gone":
        await _event_gone(raid.event_id, raid.discord_event_id)
        return Step("gone", answer.code)
    if answer.kind == "transient":
        return Step("failed", answer.code)
    await _refuse_event(raid.event_id, raid.discord_event_id, answer.error)
    return Step("refused", answer.error)


async def _replace(client: DiscordRestClient, raid: Raid) -> Step:
    """Discord has started (or ended) the event, but the raid is ahead: delete it, then make a new one."""
    assert raid.discord_event_id is not None
    answer = await ask(client.delete_guild_scheduled_event(raid.guild_discord_id, raid.discord_event_id))
    if answer.kind not in ("ok", "gone"):
        warn(answer, "event", "replace", raid.event_id)
        if answer.kind == "transient":
            return Step("failed", answer.code)
        await _refuse_event(raid.event_id, raid.discord_event_id, answer.error)
        return Step("refused", answer.error)
    if not await _set_event(raid.event_id, raid.discord_event_id, None, None, None):
        return _NONE
    return await _create(client, replace(raid, discord_event_id=None), adopt=False)


async def _set_event(
    event_id: uuid.UUID,
    expected: str | None,
    discord_event_id: str | None,
    digest: str | None,
    starts_at: datetime | None,
) -> bool:
    """Store the event Discord took, if the raid still has *expected*; False when it doesn't."""
    async with unit_of_work() as db:
        event = await wow_raid_event_repo.get_for_update(db, event_id)
        if event is None or event.discord_event_id != expected:
            return False
        await wow_raid_event_repo.set_discord_event_state(
            db, event, event_id=discord_event_id, digest=digest, starts_at=starts_at, error=None
        )
        return True


async def _refuse_event(event_id: uuid.UUID, expected: str | None, error: int | None) -> None:
    """Store Discord's refusal (nothing retries it) and drop the claim, keeping the rest."""
    async with unit_of_work() as db:
        event = await wow_raid_event_repo.get_for_update(db, event_id)
        if event is None or event.discord_event_id != expected:
            return
        await wow_raid_event_repo.set_discord_event_state(
            db,
            event,
            event_id=event.discord_event_id,
            digest=event.discord_event_digest,
            starts_at=event.discord_event_starts_at,
            error=error,
        )


async def _event_gone(event_id: uuid.UUID, expected: str) -> None:
    """Someone deleted the event in Discord: forget it and turn the toggle off."""
    async with unit_of_work() as db:
        event = await wow_raid_event_repo.get_for_update(db, event_id)
        if event is None or event.discord_event_id != expected:
            return
        await wow_raid_event_repo.set_discord_event_state(
            db, event, event_id=None, digest=None, starts_at=None, error=None
        )
        await wow_raid_event_repo.set_extras_options(
            db, event, discord_event=False, thread=event.thread_enabled, length_minutes=event.length_minutes
        )


# ---------------------------------------------------------------------------
# Toggles off, cancel and delete
# ---------------------------------------------------------------------------


async def remove_event(client: DiscordRestClient, event_id: uuid.UUID) -> Step:
    """[Discord event: on] → off: delete the raid's event (``removed``; ``none`` when there was none)."""
    try:
        found = await _leftovers_of(event_id)
        if found is None or found.event_id is None:
            return _NONE
        answer = await ask(client.delete_guild_scheduled_event(found.guild_discord_id, found.event_id))
        if _deleted(answer):
            await _set_event(event_id, found.event_id, None, None, None)
            return Step("removed")
        warn(answer, "event", "delete", event_id)
        if answer.kind == "transient":
            return Step("failed", answer.code)
        return Step("refused", answer.error)
    except Exception:
        logger.exception("Raid bot: removing raid %s's Discord event failed", event_id)
        return Step("failed")


async def archive_thread(client: DiscordRestClient, event_id: uuid.UUID) -> Step:
    """[Thread: on] → off: archive the bot's thread (``archived``; ``none`` when there's none of the bot's)."""
    try:
        found = await _leftovers_of(event_id)
        if found is None or found.thread_id is None:
            return _NONE
        return await raid_extras_thread.archive(client, event_id, found.thread_id)
    except Exception:
        logger.exception("Raid bot: archiving raid %s's thread failed", event_id)
        return Step("failed")


async def end(client: DiscordRestClient, leftovers: Leftovers) -> bool:
    """Cancel raid / Delete raid: delete the event and archive the thread, once more if Discord was silent or busy.

    False when the event may still be there (Delete raid tells the leader);
    a thread left open is only logged.  Never raises.
    """
    try:
        event_done = True
        if leftovers.event_id is not None:
            event_id = leftovers.event_id

            def delete() -> Awaitable[None]:
                return client.delete_guild_scheduled_event(leftovers.guild_discord_id, event_id)

            event_done = await _twice(delete, _deleted, "event", leftovers.raid_id)
        if leftovers.thread_id is not None:
            thread_id = leftovers.thread_id

            def archive() -> Awaitable[Any]:
                return client.modify_thread(thread_id, {"archived": True})

            await _twice(archive, raid_extras_thread.archived, "thread", leftovers.raid_id)
        return event_done
    except Exception:
        logger.exception("Raid bot: ending raid %s's Discord event and thread failed", leftovers.raid_id)
        return False


async def end_for(client: DiscordRestClient, event_id: uuid.UUID) -> bool:
    """Cancel raid: :func:`end` for the raid as it's stored now."""
    try:
        found = await _leftovers_of(event_id)
    except Exception:
        logger.exception("Raid bot: loading raid %s's Discord event and thread failed", event_id)
        return False
    if found is None:
        return True
    return await end(client, found)


async def _leftovers_of(event_id: uuid.UUID) -> Leftovers | None:
    async with unit_of_work() as db:
        event = await wow_raid_event_repo.get(db, event_id)
        if event is None:
            return None
        guild = await wow_raid_guild_repo.get(db, event.guild_id)
        if guild is None:
            return None
        return raid_extras_rules.leftovers(guild, event)


async def _twice(
    call: Callable[[], Awaitable[Any]], done: Callable[[Answer], bool], part: str, raid_id: uuid.UUID
) -> bool:
    """Make *call*, and once more straight away when Discord didn't answer or was busy; whether it's *done*."""
    for _attempt in range(2):
        answer = await ask(call())
        if done(answer):
            return True
        warn(answer, part, "removal", raid_id)
        if answer.kind != "transient":
            return False
    return False


def _deleted(answer: Answer) -> bool:
    return answer.ok or answer.kind == "gone"
