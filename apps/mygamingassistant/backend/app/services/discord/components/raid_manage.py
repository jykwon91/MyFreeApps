"""Manage sign-ups — a raid's leader adds, changes and removes players.

[Manage sign-ups] on Raid: Signed and [Sign-ups] on Raid: Edit open the hub
(``raid:v1:ml:<event>:open``).  Every tap after that is an ``ml`` custom_id
naming a verb, the player (a Discord id) and one argument (see
``raid_custom_id.MANAGE_VERBS``); the cards are
:mod:`app.services.discord.raid_manage_views`.  This module moves between
the cards; the taps that change a sign-up are in
:mod:`app.services.discord.components.raid_manage_changes`.

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

The member menu lists only people still in the server, so the hub also
lists the raid's own sign-ups (numbered as on the post, a page of 25 at a
time): a seat held by someone who left can still be changed or freed.
"""
from __future__ import annotations

import uuid
from typing import Any, Final

from fastapi import BackgroundTasks

from app.db.session import unit_of_work
from app.repositories.wow import wow_raid_signup_repo
from app.services.discord import emojis, raid_copy, raid_manage_copy
from app.services.discord.components import raid_manage_changes
from app.services.discord.components.raid_manage_common import Verb, known, load, one_value, reach_of, target_of
from app.services.discord.interaction import Interaction, update_response, update_text_response
from app.services.discord.raid_manage_views import (
    Target,
    hub_data,
    listed_signup,
    player_data,
    remove_data,
    signup_of,
    spec_data,
)
from app.services.wow.raid_catalog import POST_COLUMNS
from app.services.wow.raid_custom_id import RaidCustomId, is_member_id


async def handle_manage(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    assert parsed.event_id is not None
    verb, member, arg = parsed.args
    if verb == "done":
        return update_text_response(raid_manage_copy.DONE)
    return await _VERBS[verb](interaction, parsed.event_id, member, arg, background)


async def _open(
    interaction: Interaction, event_id: uuid.UUID, member: str, arg: str, background: BackgroundTasks
) -> dict[str, Any]:
    """The hub: the raid, its seats and the member menu."""
    async with unit_of_work() as db:
        found = await load(db, interaction, event_id, lock=False)
        if isinstance(found, str):
            return update_text_response(found)
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        return update_response(hub_data(found.event, signups))


async def _who(
    interaction: Interaction, event_id: uuid.UUID, member: str, arg: str, background: BackgroundTasks
) -> dict[str, Any]:
    """A member picked on the hub: their card (a bot is turned away)."""
    picked = one_value(interaction)
    if not is_member_id(picked):
        return update_text_response(raid_copy.GENERIC_ERROR)
    async with unit_of_work() as db:
        found = await load(db, interaction, event_id, lock=False)
        if isinstance(found, str):
            return update_text_response(found)
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        if interaction.resolved_is_bot(picked):
            return update_response(hub_data(found.event, signups, notice=raid_copy.LEADER_BOT))
        name = known(interaction.resolved_display_name(picked))
        target = Target(picked, name, interaction.resolved_avatar_url(picked))
        return update_response(player_data(found.event, target, signups, emojis=emojis.current()))


async def _row(
    interaction: Interaction, event_id: uuid.UUID, member: str, arg: str, background: BackgroundTasks
) -> dict[str, Any]:
    """Someone picked in the hub's sign-up menu: their card, named from their sign-up (the menu has no avatar)."""
    picked = one_value(interaction)
    if not is_member_id(picked):
        return update_text_response(raid_copy.GENERIC_ERROR)
    async with unit_of_work() as db:
        found = await load(db, interaction, event_id, lock=False)
        if isinstance(found, str):
            return update_text_response(found)
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        mine = signup_of(signups, picked)
        if mine is None:
            # Removed since the menu was drawn.
            notice = raid_manage_copy.gone_from_raid(Target(picked).who)
            return update_response(hub_data(found.event, signups, notice=notice))
        target = Target(picked, known(mine.display_name))
        return update_response(player_data(found.event, target, signups, emojis=emojis.current()))


async def _list(
    interaction: Interaction, event_id: uuid.UUID, member: str, page: str, background: BackgroundTasks
) -> dict[str, Any]:
    """[Previous] / [Next]: that page of the sign-up menu (the last one, should the list have shrunk)."""
    async with unit_of_work() as db:
        found = await load(db, interaction, event_id, lock=False)
        if isinstance(found, str):
            return update_text_response(found)
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        return update_response(hub_data(found.event, signups, page=int(page)))


async def _card(
    interaction: Interaction, event_id: uuid.UUID, member: str, arg: str, background: BackgroundTasks
) -> dict[str, Any]:
    """[Back] / [Keep them] to the player's card."""
    async with unit_of_work() as db:
        found = await load(db, interaction, event_id, lock=False)
        if isinstance(found, str):
            return update_text_response(found)
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        target = target_of(interaction, member, signups)
        return update_response(player_data(found.event, target, signups, emojis=emojis.current()))


async def _class(
    interaction: Interaction, event_id: uuid.UUID, member: str, arg: str, background: BackgroundTasks
) -> dict[str, Any]:
    """A class (or Tank) picked on the player's card: that column's specs."""
    column = one_value(interaction)
    if column not in POST_COLUMNS:
        return update_text_response(raid_copy.GENERIC_ERROR)
    async with unit_of_work() as db:
        found = await load(db, interaction, event_id, lock=False)
        if isinstance(found, str):
            return update_text_response(found)
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        target = target_of(interaction, member, signups)
        return update_response(spec_data(found.event, target, column, signups, emojis=emojis.current()))


async def _ask(
    interaction: Interaction, event_id: uuid.UUID, member: str, arg: str, background: BackgroundTasks
) -> dict[str, Any]:
    """[Remove] on the player's card: ask first."""
    async with unit_of_work() as db:
        found = await load(db, interaction, event_id, lock=False)
        if isinstance(found, str):
            return update_text_response(found)
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        target = target_of(interaction, member, signups)
        mine = listed_signup(signups, member)
        if mine is None:
            notice = raid_manage_copy.gone_from_raid(target.who)
            return update_response(player_data(found.event, target, signups, emojis=emojis.current(), notice=notice))
        reach = await reach_of(db, found, interaction, member)
        return update_response(remove_data(found.event, target, mine, signups, reach=reach))


_VERBS: Final[dict[str, Verb]] = {
    "open": _open,
    "who": _who,
    "row": _row,
    "list": _list,
    "card": _card,
    "class": _class,
    "ask": _ask,
    **raid_manage_changes.VERBS,
}
