"""A raid's thread — the calls ``raid_extras.sync`` makes for it, and the archive.

The thread is public, on the raid's post (so its id is the post's), named
after the raid and renamed with it; a rename also unarchives it.  A thread
already on the post is adopted: the bot's is named as the raid, a member's
is left as it is (``thread_name`` NULL).  Someone deleting it turns the
toggle off; a refusal is stored (``thread_error``) and nothing retries it
until the leader taps Try again or turns the thread on.
"""
from __future__ import annotations

import uuid
from typing import Final

from platform_shared.services.discord import THREAD_ARCHIVED, THREAD_LOCKED, DiscordRestClient

from app.core.config import settings
from app.db.session import unit_of_work
from app.repositories.wow import wow_raid_event_repo
from app.services.discord.raid_extras_calls import Answer, Raid, ask, warn
from app.services.wow import raid_extras_rules
from app.services.wow.raid_extras_rules import Step

_NONE: Final = Step("none")
# An archive that went through or needn't: the thread is archived already, or a moderator locked it.
_ARCHIVE_DONE: Final = (THREAD_ARCHIVED, THREAD_LOCKED)


async def sync(client: DiscordRestClient, raid: Raid) -> Step:
    """The thread's part of a sync: start it, or rename it."""
    if raid.plan.thread == "create":
        return await _create(client, raid)
    if raid.plan.thread == "rename":
        assert raid.thread_id is not None
        return await _rename(client, raid, raid.thread_id)
    return _NONE


async def _create(client: DiscordRestClient, raid: Raid) -> Step:
    """Start the thread on the post; one there already (a member's, or a racing sync's) is adopted."""
    body = raid_extras_rules.thread_body(raid.thread_name)
    answer = await ask(client.start_thread_from_message(raid.channel_id, raid.message_id, body))
    if answer.ok:
        thread_id = str(answer.body.get("id") or raid.message_id)
        if await _keep(raid.event_id, thread_id, raid.thread_name):
            return Step("made")
        await archive(client, raid.event_id, thread_id)
        return _NONE
    warn(answer, "thread", "create", raid.event_id)
    if answer.kind == "exists":
        return await _adopt(client, raid)
    if answer.kind == "refused":
        await _refuse(raid.event_id, answer.error)
        return Step("refused", answer.error)
    return Step("failed", answer.code)  # no answer, or the post was deleted: a later sync tries again


async def _keep(event_id: uuid.UUID, thread_id: str, name: str) -> bool:
    """The landing check: store the new thread; False when it should be archived (cancelled, toggled off, deleted)."""
    async with unit_of_work() as db:
        event = await wow_raid_event_repo.get_for_update(db, event_id)
        if event is None:
            return False
        await wow_raid_event_repo.set_thread_state(db, event, thread_id=thread_id, name=name, error=None)
        return event.status == "scheduled" and event.thread_enabled


async def _adopt(client: DiscordRestClient, raid: Raid) -> Step:
    """The post has a thread (its id is the post's): the bot's is named as the raid; a member's is left alone."""
    thread_id = raid.message_id
    answer = await ask(client.get_channel(thread_id))
    if not answer.ok:
        warn(answer, "thread", "lookup", raid.event_id)
        return Step("failed", answer.code)
    if str(answer.body.get("owner_id")) != settings.discord_application_id:
        await _set(raid.event_id, thread_id, None)
        return Step("adopted")
    name = str(answer.body.get("name", ""))
    await _set(raid.event_id, thread_id, name)
    if name != raid.thread_name:
        return await _rename(client, raid, thread_id)
    return Step("made")


async def _rename(client: DiscordRestClient, raid: Raid, thread_id: str) -> Step:
    """Name the bot's thread after the raid and unarchive it; one someone deleted turns the toggle off."""
    answer = await ask(client.modify_thread(thread_id, {"name": raid.thread_name, "archived": False}))
    if answer.ok:
        await _set(raid.event_id, thread_id, raid.thread_name)
        return Step("updated")
    warn(answer, "thread", "rename", raid.event_id)
    if answer.kind == "gone":
        await _gone(raid.event_id)
        return Step("gone", answer.code)
    if answer.kind == "transient":
        return Step("failed", answer.code)
    await _refuse(raid.event_id, answer.error)
    return Step("refused", answer.error)


async def archive(client: DiscordRestClient, event_id: uuid.UUID, thread_id: str) -> Step:
    """Archive the bot's thread (its id is kept, so turning it on again reopens it)."""
    answer = await ask(client.modify_thread(thread_id, {"archived": True}))
    if archived(answer):
        return Step("archived")
    warn(answer, "thread", "archive", event_id)
    if answer.kind == "transient":
        return Step("failed", answer.code)
    return Step("refused", answer.error)


def archived(answer: Answer) -> bool:
    """The archive went through, or needn't: the thread is gone, archived already or locked."""
    return answer.ok or answer.kind == "gone" or answer.code in _ARCHIVE_DONE


async def _set(event_id: uuid.UUID, thread_id: str, name: str | None) -> None:
    async with unit_of_work() as db:
        event = await wow_raid_event_repo.get_for_update(db, event_id)
        if event is not None:
            await wow_raid_event_repo.set_thread_state(db, event, thread_id=thread_id, name=name, error=None)


async def _refuse(event_id: uuid.UUID, error: int | None) -> None:
    async with unit_of_work() as db:
        event = await wow_raid_event_repo.get_for_update(db, event_id)
        if event is not None:
            await wow_raid_event_repo.set_thread_state(
                db, event, thread_id=event.thread_id, name=event.thread_name, error=error
            )


async def _gone(event_id: uuid.UUID) -> None:
    """Someone deleted the thread in Discord: forget it and turn the toggle off."""
    async with unit_of_work() as db:
        event = await wow_raid_event_repo.get_for_update(db, event_id)
        if event is None:
            return
        await wow_raid_event_repo.set_thread_state(db, event, thread_id=None, name=None, error=None)
        await wow_raid_event_repo.set_extras_options(
            db, event, discord_event=event.discord_event_enabled, thread=False, length_minutes=event.length_minutes
        )
