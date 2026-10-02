"""Manage sign-ups — the taps that change a sign-up: a spec switch, an add, a removal.

Each loads the raid under its row lock, works from the rows as they are
now, and answers in place (type 7).  The public post, the DMs to anyone
moved up from the queue and the player's own DM go out in the
background afterwards.
"""
from __future__ import annotations

import uuid
from functools import partial
from typing import Any, Final

from fastapi import BackgroundTasks

from app.db.session import unit_of_work
from app.repositories.wow import wow_raid_signup_repo
from app.services.discord import raid_copy, raid_manage_copy, raid_publisher
from app.services.discord.components.raid_manage_common import (
    Verb,
    card_for,
    dm_for,
    load,
    log,
    names_of,
    picked_spec,
    reach_of,
    target_of,
)
from app.services.discord.interaction import UNKNOWN_PLAYER, Interaction, update_response, update_text_response
from app.services.discord.raid_manage_notify import fill_display_name, notify_added, notify_removed
from app.services.discord.raid_manage_views import hub_data, listed_signup, review_data
from app.services.wow import raid_event_service, raid_signup_service
from app.services.wow.raid_catalog import spec_info
from app.services.wow.raid_limits import LimitCheck, Limits
from app.services.wow.raid_roster import QUEUED_STATUS


async def switch_spec(
    interaction: Interaction, event_id: uuid.UUID, member: str, column: str, background: BackgroundTasks
) -> dict[str, Any]:
    """A spec picked: switch a player on the raid to it, else review adding them as it."""
    spec = picked_spec(interaction, column)
    if spec is None:
        return update_text_response(raid_copy.GENERIC_ERROR)
    async with unit_of_work() as db:
        found = await load(db, interaction, event_id, lock=True)
        if isinstance(found, str):
            return update_text_response(found)
        event = found.event
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        target = target_of(interaction, member, signups)
        mine = listed_signup(signups, member)
        if mine is None:
            reach = await reach_of(db, found, interaction, member)
            return update_response(review_data(event, target, spec, signups, reach=reach))
        hit = LimitCheck(Limits.of(event), signups, member, mine.status).hit(spec)
        requested = mine.status
        if requested == QUEUED_STATUS:
            requested = "confirmed"  # asking for a seat keeps a queued player's place
        change = await raid_signup_service.change_status(
            db,
            event=event,
            discord_user_id=member,
            display_name=target.name or mine.display_name,
            requested_status=requested,
            wow_class=spec.class_key,
            role=spec.raid_role,
            spec=spec.key,
        )
        changed = change.outcome == "changed"
        notice = raid_manage_copy.unchanged(target.who, spec.full_label)
        if changed:
            notice = raid_manage_copy.switched(target.who, spec.full_label)
            if hit is not None:
                notice = f"{notice}\n{raid_manage_copy.switched_over(hit)}"
        promoted = await raid_event_service.dm_recipients(db, guild=found.guild, user_ids=change.promoted)
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        card = await card_for(db, found, interaction, target, signups, notice=notice)

    if changed:
        background.add_task(raid_publisher.refresh_public_message, event_id)
        background.add_task(raid_publisher.notify_promoted, event_id, promoted)
        log("switched", interaction, event_id, member, spec.full_label)
    return update_response(card)


async def add_player(
    interaction: Interaction,
    event_id: uuid.UUID,
    member: str,
    choice: str,
    background: BackgroundTasks,
    *,
    tell: bool,
    reason: str | None = None,
) -> dict[str, Any]:
    """[Add and tell them] / [Add quietly] / [Add]: a seat, or the queue when the raid is full."""
    class_key, _, spec_key = choice.partition(".")
    spec = spec_info(class_key, spec_key)
    if spec is None:
        return update_text_response(raid_copy.GENERIC_ERROR)
    async with unit_of_work() as db:
        found = await load(db, interaction, event_id, lock=True)
        if isinstance(found, str):
            return update_text_response(found)
        event = found.event
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        target = target_of(interaction, member, signups)
        if listed_signup(signups, member) is not None:
            notice = raid_manage_copy.already_on(target.who)
            return update_response(await card_for(db, found, interaction, target, signups, notice=notice))
        hit = LimitCheck(Limits.of(event), signups, member, "confirmed").hit(spec)
        change = await raid_signup_service.change_status(
            db,
            event=event,
            discord_user_id=member,
            display_name=target.name or UNKNOWN_PLAYER,
            requested_status="confirmed",
            wow_class=spec.class_key,
            role=spec.raid_role,
            spec=spec.key,
        )
        lines = [raid_manage_copy.added(target.who, spec.full_label)]
        if change.queued:
            lines = [raid_manage_copy.added_queued(target.who, change.queue_position)]
        if hit is not None:
            lines.append(raid_manage_copy.added_over(hit))
        dm, dm_line = await dm_for(db, found, interaction, target, tell=tell, reason=reason)
        if dm_line is not None:
            lines.append(dm_line)
        promoted = await raid_event_service.dm_recipients(db, guild=found.guild, user_ids=change.promoted)
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        card = hub_data(event, signups, notice="\n".join(lines))
        guild_discord_id = found.guild.discord_guild_id

    if target.name is None:
        # Named before the post re-renders (the tasks run in order).
        background.add_task(fill_display_name, event_id, guild_discord_id, member)
    background.add_task(raid_publisher.refresh_public_message, event_id)
    background.add_task(raid_publisher.notify_promoted, event_id, promoted)
    if dm is not None:
        background.add_task(notify_added, dm, spec.full_label, change.queue_position)
    log("added", interaction, event_id, member, f"{spec.full_label}, {change.status}")
    return update_response(card)


async def drop_player(
    interaction: Interaction,
    event_id: uuid.UUID,
    member: str,
    arg: str,
    background: BackgroundTasks,
    *,
    tell: bool,
    reason: str | None = None,
) -> dict[str, Any]:
    """[Remove and tell them] / [Remove quietly] / [Remove]: off the raid; a seat goes to the queue."""
    async with unit_of_work() as db:
        found = await load(db, interaction, event_id, lock=True)
        if isinstance(found, str):
            return update_text_response(found)
        event = found.event
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        target = target_of(interaction, member, signups)
        mine = listed_signup(signups, member)
        if mine is None:
            return update_response(hub_data(event, signups, notice=raid_manage_copy.gone_from_raid(target.who)))
        was = mine.status
        promoted_ids = await raid_signup_service.remove_signup(db, event=event, signup=mine)
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        lines = [raid_manage_copy.removed(target.who, names_of(signups, promoted_ids))]
        dm, dm_line = await dm_for(db, found, interaction, target, tell=tell, reason=reason)
        if dm_line is not None:
            lines.append(dm_line)
        promoted = await raid_event_service.dm_recipients(db, guild=found.guild, user_ids=promoted_ids)
        card = hub_data(event, signups, notice="\n".join(lines))

    background.add_task(raid_publisher.refresh_public_message, event_id)
    background.add_task(raid_publisher.notify_promoted, event_id, promoted)
    if dm is not None:
        background.add_task(notify_removed, dm)
    log("removed", interaction, event_id, member, was)
    return update_response(card)


VERBS: Final[dict[str, Verb]] = {
    "spec": switch_spec,
    "addt": partial(add_player, tell=True),
    "addq": partial(add_player, tell=False),
    "dropt": partial(drop_player, tell=True),
    "dropq": partial(drop_player, tell=False),
}
