"""Manage sign-ups — a raid's leader adds, changes and removes players.

[Manage sign-ups] on Raid: Signed and [Sign-ups] on Raid: Edit open the hub
(``raid:v1:ml:<event>:open``).  Every tap after that is an ``ml`` custom_id
naming a verb, the player (a Discord id) and one argument (see
``raid_custom_id.MANAGE_VERBS``); the cards are
:mod:`app.services.discord.raid_manage_views`.

Each tap loads the raid and its rows again and answers in place (type 7),
so a card left open, or two leaders at once, can't act on what's no longer
true: an add for a player who got on the raid meanwhile says so, and so
does a remove for one who left.  Only the raid's leader or someone with
Manage Events gets past ``load_led_event``; a cancelled or finished raid
says why its sign-ups can't change.

Leaders aren't held to the raid's limits (the cards say when a pick goes
over one), and an add to a full raid joins the queue.  A DM goes out only
on a real change, only from a "tell them" button, never to the leader
themself and never past the player's DM opt-out.  The public post
re-renders in the background.

Members who left the server can't be picked in the member menu, so a seat
of theirs stays until they come back or the raid's size goes up.
"""
from __future__ import annotations

import logging
import uuid
from collections.abc import Awaitable, Callable, Sequence
from functools import partial
from typing import Any, Final

from fastapi import BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import unit_of_work
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.repositories.wow import wow_raid_signup_repo
from app.services.discord import emojis, raid_copy, raid_manage_copy, raid_publisher
from app.services.discord.interaction import (
    CDN_URL,
    UNKNOWN_PLAYER,
    Interaction,
    update_response,
    update_text_response,
)
from app.services.discord.raid_context import RaidContext, load_led_event
from app.services.discord.raid_manage_notify import ManageDm, fill_display_name, notify_added, notify_removed
from app.services.discord.raid_manage_views import (
    Reach,
    Target,
    hub_data,
    listed_signup,
    player_data,
    remove_data,
    review_data,
    signup_of,
    spec_data,
)
from app.services.wow import raid_event_service, raid_signup_service
from app.services.wow.raid_catalog import POST_COLUMNS, WowSpecInfo, column_specs, spec_info
from app.services.wow.raid_custom_id import RaidCustomId, is_member_id
from app.services.wow.raid_limits import LimitCheck, Limits
from app.services.wow.raid_roster import QUEUED_STATUS
from app.services.wow.raid_text import escape_name

logger = logging.getLogger(__name__)

# A card finds its raid in any of these; a cancelled or finished one says why nothing changes.
_SEEN: Final = ("scheduled", "cancelled", "completed")

Verb = Callable[[Interaction, uuid.UUID, str, str, BackgroundTasks], Awaitable[dict[str, Any]]]


async def handle_manage(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    assert parsed.event_id is not None
    verb, member, arg = parsed.args
    if verb == "done":
        return update_text_response(raid_manage_copy.DONE)
    return await _VERBS[verb](interaction, parsed.event_id, member, arg, background)


# ---------------------------------------------------------------------------
# Moving between cards
# ---------------------------------------------------------------------------


async def _open(
    interaction: Interaction, event_id: uuid.UUID, member: str, arg: str, background: BackgroundTasks
) -> dict[str, Any]:
    """The hub: the raid, its seats and the member menu."""
    async with unit_of_work() as db:
        found = await _load(db, interaction, event_id, lock=False)
        if isinstance(found, str):
            return update_text_response(found)
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        return update_response(hub_data(found.event, signups))


async def _who(
    interaction: Interaction, event_id: uuid.UUID, member: str, arg: str, background: BackgroundTasks
) -> dict[str, Any]:
    """A member picked on the hub: their card (a bot is turned away)."""
    picked = _one_value(interaction)
    if not is_member_id(picked):
        return update_text_response(raid_copy.GENERIC_ERROR)
    async with unit_of_work() as db:
        found = await _load(db, interaction, event_id, lock=False)
        if isinstance(found, str):
            return update_text_response(found)
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        if interaction.resolved_is_bot(picked):
            return update_response(hub_data(found.event, signups, notice=raid_copy.LEADER_BOT))
        name = _known(interaction.resolved_display_name(picked))
        target = Target(picked, name, interaction.resolved_avatar_url(picked))
        return update_response(player_data(found.event, target, signups, emojis=emojis.current()))


async def _card(
    interaction: Interaction, event_id: uuid.UUID, member: str, arg: str, background: BackgroundTasks
) -> dict[str, Any]:
    """[Back] / [Keep them] to the player's card."""
    async with unit_of_work() as db:
        found = await _load(db, interaction, event_id, lock=False)
        if isinstance(found, str):
            return update_text_response(found)
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        target = _target(interaction, member, signups)
        return update_response(player_data(found.event, target, signups, emojis=emojis.current()))


async def _class(
    interaction: Interaction, event_id: uuid.UUID, member: str, arg: str, background: BackgroundTasks
) -> dict[str, Any]:
    """A class (or Tank) picked on the player's card: that column's specs."""
    column = _one_value(interaction)
    if column not in POST_COLUMNS:
        return update_text_response(raid_copy.GENERIC_ERROR)
    async with unit_of_work() as db:
        found = await _load(db, interaction, event_id, lock=False)
        if isinstance(found, str):
            return update_text_response(found)
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        target = _target(interaction, member, signups)
        return update_response(spec_data(found.event, target, column, signups, emojis=emojis.current()))


async def _ask(
    interaction: Interaction, event_id: uuid.UUID, member: str, arg: str, background: BackgroundTasks
) -> dict[str, Any]:
    """[Remove] on the player's card: ask first."""
    async with unit_of_work() as db:
        found = await _load(db, interaction, event_id, lock=False)
        if isinstance(found, str):
            return update_text_response(found)
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        target = _target(interaction, member, signups)
        mine = listed_signup(signups, member)
        if mine is None:
            notice = raid_manage_copy.gone_from_raid(target.who)
            return update_response(player_data(found.event, target, signups, emojis=emojis.current(), notice=notice))
        reach = await _reach(db, found, interaction, member)
        return update_response(remove_data(found.event, target, mine, signups, reach=reach))


# ---------------------------------------------------------------------------
# Changes: a spec switch, an add, a removal
# ---------------------------------------------------------------------------


async def _spec(
    interaction: Interaction, event_id: uuid.UUID, member: str, column: str, background: BackgroundTasks
) -> dict[str, Any]:
    """A spec picked: switch a player on the raid to it, else review adding them as it."""
    spec = _picked_spec(interaction, column)
    if spec is None:
        return update_text_response(raid_copy.GENERIC_ERROR)
    async with unit_of_work() as db:
        found = await _load(db, interaction, event_id, lock=True)
        if isinstance(found, str):
            return update_text_response(found)
        event = found.event
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        target = _target(interaction, member, signups)
        mine = listed_signup(signups, member)
        if mine is None:
            reach = await _reach(db, found, interaction, member)
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
        notice = raid_manage_copy.unchanged(target.who, spec.full_label)
        if change.outcome == "changed":
            notice = raid_manage_copy.switched(target.who, spec.full_label)
            if hit is not None:
                notice = f"{notice}\n{raid_manage_copy.switched_over(hit)}"
            promoted = await raid_event_service.dm_recipients(db, guild=found.guild, user_ids=change.promoted)
            background.add_task(raid_publisher.refresh_public_message, event_id)
            background.add_task(raid_publisher.notify_promoted, event_id, promoted)
            _log("switched", interaction, event_id, member, spec.full_label)
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        return update_response(player_data(event, target, signups, emojis=emojis.current(), notice=notice))


async def _add(
    interaction: Interaction,
    event_id: uuid.UUID,
    member: str,
    choice: str,
    background: BackgroundTasks,
    *,
    tell: bool,
) -> dict[str, Any]:
    """[Add and tell them] / [Add quietly] / [Add]: a seat, or the queue when the raid is full."""
    class_key, _, spec_key = choice.partition(".")
    spec = spec_info(class_key, spec_key)
    if spec is None:
        return update_text_response(raid_copy.GENERIC_ERROR)
    async with unit_of_work() as db:
        found = await _load(db, interaction, event_id, lock=True)
        if isinstance(found, str):
            return update_text_response(found)
        event = found.event
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        target = _target(interaction, member, signups)
        if listed_signup(signups, member) is not None:
            notice = raid_manage_copy.already_on(target.who)
            return update_response(player_data(event, target, signups, emojis=emojis.current(), notice=notice))
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
        dm, dm_line = await _dm_for(db, found, interaction, target, tell=tell)
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
    _log("added", interaction, event_id, member, f"{spec.full_label}, {change.status}")
    return update_response(card)


async def _drop(
    interaction: Interaction,
    event_id: uuid.UUID,
    member: str,
    arg: str,
    background: BackgroundTasks,
    *,
    tell: bool,
) -> dict[str, Any]:
    """[Remove and tell them] / [Remove quietly] / [Remove]: off the raid; a seat goes to the queue."""
    async with unit_of_work() as db:
        found = await _load(db, interaction, event_id, lock=True)
        if isinstance(found, str):
            return update_text_response(found)
        event = found.event
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        target = _target(interaction, member, signups)
        mine = listed_signup(signups, member)
        if mine is None:
            return update_response(hub_data(event, signups, notice=raid_manage_copy.gone_from_raid(target.who)))
        was = mine.status
        promoted_ids = await raid_signup_service.remove_signup(db, event=event, signup=mine)
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        lines = [raid_manage_copy.removed(target.who, _names(signups, promoted_ids))]
        dm, dm_line = await _dm_for(db, found, interaction, target, tell=tell)
        if dm_line is not None:
            lines.append(dm_line)
        promoted = await raid_event_service.dm_recipients(db, guild=found.guild, user_ids=promoted_ids)
        card = hub_data(event, signups, notice="\n".join(lines))

    background.add_task(raid_publisher.refresh_public_message, event_id)
    background.add_task(raid_publisher.notify_promoted, event_id, promoted)
    if dm is not None:
        background.add_task(notify_removed, dm)
    _log("removed", interaction, event_id, member, was)
    return update_response(card)


_VERBS: Final[dict[str, Verb]] = {
    "open": _open,
    "who": _who,
    "card": _card,
    "class": _class,
    "spec": _spec,
    "ask": _ask,
    "addt": partial(_add, tell=True),
    "addq": partial(_add, tell=False),
    "dropt": partial(_drop, tell=True),
    "dropq": partial(_drop, tell=False),
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _load(db: AsyncSession, interaction: Interaction, event_id: uuid.UUID, *, lock: bool) -> RaidContext | str:
    """The raid while it's on and this member leads it; else why not."""
    found = await load_led_event(db, interaction, event_id, lock=lock, statuses=_SEEN)
    if isinstance(found, str):
        return found
    if found.event.status != "scheduled":
        return raid_manage_copy.GONE
    return found


def _target(interaction: Interaction, user_id: str, signups: Sequence[WowRaidSignup]) -> Target:
    """The player a card is about: the name and avatar on the card tapped, else their sign-up's name."""
    author = interaction.message_embed_author()
    name = author.get("name")
    if not isinstance(name, str) or not name.strip():
        name = None
        mine = signup_of(signups, user_id)
        if mine is not None:
            name = _known(mine.display_name)
    avatar = author.get("icon_url")
    if not isinstance(avatar, str) or not avatar.startswith(f"{CDN_URL}/"):
        avatar = None
    return Target(user_id, name, avatar)


def _known(name: str) -> str | None:
    """A real name; None for the placeholder a nameless payload gets."""
    if name == UNKNOWN_PLAYER:
        return None
    return name


async def _reach(db: AsyncSession, found: RaidContext, interaction: Interaction, user_id: str) -> Reach:
    if user_id == interaction.user_id:
        return "self"
    if await raid_event_service.dm_recipients(db, guild=found.guild, user_ids=[user_id]):
        return "yes"
    return "off"


async def _dm_for(
    db: AsyncSession, found: RaidContext, interaction: Interaction, target: Target, *, tell: bool
) -> tuple[ManageDm | None, str | None]:
    """The DM a "tell them" change sends and the line saying so; a player who turned DMs off since gets none."""
    if not tell:
        return None, None
    reach = await _reach(db, found, interaction, target.user_id)
    if reach == "off":
        return None, raid_manage_copy.dm_off_done(target.who)
    if reach == "self":
        return None, None
    dm = ManageDm(
        event_id=found.event.id,
        user_id=target.user_id,
        leader_id=interaction.user_id,
        who=target.who,
        application_id=interaction.application_id,
        token=interaction.token,
    )
    return dm, raid_manage_copy.DM_SENDING


def _names(signups: Sequence[WowRaidSignup], user_ids: Sequence[str]) -> list[str]:
    """'**Carol**' for each of *user_ids*, in that order."""
    names: list[str] = []
    for user_id in user_ids:
        signup = signup_of(signups, user_id)
        if signup is not None:
            names.append(f"**{escape_name(signup.display_name)}**")
    return names


def _one_value(interaction: Interaction) -> str:
    """A one-pick menu's value; empty for anything else."""
    if len(interaction.values) != 1:
        return ""
    return interaction.values[0]


def _picked_spec(interaction: Interaction, column: str) -> WowSpecInfo | None:
    """The spec picked in *column*'s menu; None for anything else."""
    class_key, _, spec_key = _one_value(interaction).partition(".")
    spec = spec_info(class_key, spec_key)
    if spec is None or spec not in column_specs(column):
        return None
    return spec


def _log(action: str, interaction: Interaction, event_id: uuid.UUID, user_id: str, detail: str) -> None:
    logger.info(
        "Raid bot: leader %s %s player %s on raid %s (%s)", interaction.user_id, action, user_id, event_id, detail
    )
