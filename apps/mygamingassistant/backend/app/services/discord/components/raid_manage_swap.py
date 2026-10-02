"""Manage sign-ups — a seat on a full raid: who gives theirs up, and the swap.

On a full raid, [Seat] on a seatless player's card opens the menu of seat
holders (:mod:`app.services.discord.raid_manage_swap_views`).  Picking one
is the swap review, whose buttons make the swap: the holder to the bench,
the player into the seat at the holder's number, both notes cleared.  The
seats taken stay the same, so nobody moves up.  [Swap and tell them] sends
both the moved DM; [Swap and say why]'s reason goes to the holder only.

Every tap decides from the rows as they are now, the swap under the raid's
row lock.  A card gone stale answers with where things stand instead: the
player's card, or the menu again when the holder has no seat now.
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from functools import partial
from typing import Any, Final

from fastapi import BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import unit_of_work
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.repositories.wow import wow_raid_signup_repo
from app.services.discord import raid_copy, raid_manage_copy, raid_publisher
from app.services.discord.components.raid_manage_common import (
    Verb,
    card_for,
    dm_for,
    load,
    log,
    one_value,
    reach_of,
    target_of,
)
from app.services.discord.interaction import Interaction, update_response, update_text_response
from app.services.discord.raid_context import RaidContext
from app.services.discord.raid_edit_views import reason_modal
from app.services.discord.raid_manage_notify import notify_moved
from app.services.discord.raid_manage_swap_views import (
    back_to_holders,
    holder_target,
    holders_data,
    swap_limit,
    swap_review_data,
)
from app.services.discord.raid_manage_views import (
    Target,
    listed_signup,
    mark_review_data,
    needs_swap,
    signup_of,
    spec_label,
)
from app.services.wow import raid_signup_service
from app.services.wow.raid_custom_id import is_member_id
from app.services.wow.raid_roster import BENCH_STATUS, LINE_STATUSES, QUEUED_STATUS, SEAT_STATUSES, queue_position


@dataclass(frozen=True)
class _Player:
    """The player a tap is about, as their card still has them: on the raid, a class, no seat, the raid full."""

    signup: WowRaidSignup
    label: str


@dataclass(frozen=True)
class _Swap:
    """A swap that still stands: the player, and the seat holder picked to go to the bench."""

    player: _Player
    holder: WowRaidSignup


async def pick_holder(
    interaction: Interaction, event_id: uuid.UUID, member: str, arg: str, background: BackgroundTasks
) -> dict[str, Any]:
    """A seat holder picked in the menu: the swap review."""
    holder_id = one_value(interaction)
    if not is_member_id(holder_id) or holder_id == member:
        return update_text_response(raid_copy.GENERIC_ERROR)
    async with unit_of_work() as db:
        found = await load(db, interaction, event_id, lock=False)
        if isinstance(found, str):
            return update_text_response(found)
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        target = target_of(interaction, member, signups)
        swap = await _swappable(db, found, interaction, target, signups, holder_id)
        if isinstance(swap, dict):
            return swap
        reach = await reach_of(db, found, interaction, member)
        holder_reach = await reach_of(db, found, interaction, holder_id)
        player = swap.player
        review = swap_review_data(
            found.event,
            target,
            player.signup,
            player.label,
            swap.holder,
            signups,
            reach=reach,
            holder_reach=holder_reach,
        )
    return update_response(review)


async def holder_page(
    interaction: Interaction, event_id: uuid.UUID, member: str, arg: str, background: BackgroundTasks
) -> dict[str, Any]:
    """The menu's [Previous] / [Next]: the seat holders at page *arg*."""
    async with unit_of_work() as db:
        found = await load(db, interaction, event_id, lock=False)
        if isinstance(found, str):
            return update_text_response(found)
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        target = target_of(interaction, member, signups)
        player = await _seatless(db, found, interaction, target, signups)
        if isinstance(player, dict):
            return player
        menu = holders_data(found.event, target, player.signup, player.label, signups, page=int(arg))
    return update_response(menu)


async def queue_instead(
    interaction: Interaction, event_id: uuid.UUID, member: str, arg: str, background: BackgroundTasks
) -> dict[str, Any]:
    """The menu's [Queue them instead]: the review of a place in the queue, its [Back] to the menu."""
    async with unit_of_work() as db:
        found = await load(db, interaction, event_id, lock=False)
        if isinstance(found, str):
            return update_text_response(found)
        event = found.event
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        target = target_of(interaction, member, signups)
        player = await _seatless(db, found, interaction, target, signups, queue=True)
        if isinstance(player, dict):
            return player
        reach = await reach_of(db, found, interaction, member)
        back = back_to_holders(event, member)
        review = mark_review_data(
            event, target, player.signup, QUEUED_STATUS, player.label, signups, reach=reach, back=back
        )
    return update_response(review)


async def ask_swap_why(
    interaction: Interaction, event_id: uuid.UUID, member: str, arg: str, background: BackgroundTasks
) -> dict[str, Any]:
    """[Swap and say why]: the form, unless the swap is gone (then the answer says why, as the swap's would)."""
    async with unit_of_work() as db:
        found = await load(db, interaction, event_id, lock=False)
        if isinstance(found, str):
            return update_text_response(found)
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        target = target_of(interaction, member, signups)
        swap = await _swappable(db, found, interaction, target, signups, arg)
        if isinstance(swap, dict):
            return swap
    return reason_modal(interaction.custom_id, hint=raid_manage_copy.SWAP_REASON_HINT)


async def swap_players(
    interaction: Interaction,
    event_id: uuid.UUID,
    member: str,
    arg: str,
    background: BackgroundTasks,
    *,
    tell: bool,
    reason: str | None = None,
) -> dict[str, Any]:
    """The swap, under the raid's row lock: the seat holder *arg* to the bench, the player into their seat.

    *tell* sends both the moved DM; *reason* (the form's) goes to the holder only.
    """
    async with unit_of_work() as db:
        found = await load(db, interaction, event_id, lock=True)
        if isinstance(found, str):
            return update_text_response(found)
        event = found.event
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        target = target_of(interaction, member, signups)
        swap = await _swappable(db, found, interaction, target, signups, arg)
        if isinstance(swap, dict):
            return swap
        player = swap.player
        holder = holder_target(swap.holder)
        holder_label = spec_label(swap.holder)
        hit = swap_limit(event, player.signup, swap.holder, signups)
        await raid_signup_service.swap_seat(db, player=player.signup, holder=swap.holder)
        lines = [raid_manage_copy.swapped(target.who, holder.who)]
        if hit is not None:
            lines.append(raid_manage_copy.moved_over(hit))
        dm, dm_line = await dm_for(db, found, interaction, target, tell=tell)
        holder_dm, holder_line = await dm_for(db, found, interaction, holder, tell=tell, reason=reason)
        if dm is not None or holder_dm is not None:
            lines.append(raid_manage_copy.DM_SENDING)
        for line in (dm_line, holder_line):
            if line is not None and line != raid_manage_copy.DM_SENDING:
                lines.append(line)
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        card = await card_for(db, found, interaction, target, signups, notice="\n".join(lines))

    background.add_task(raid_publisher.refresh_public_message, event_id)
    if dm is not None:
        background.add_task(notify_moved, dm, "confirmed", player.label, None)
    if holder_dm is not None:
        background.add_task(notify_moved, holder_dm, BENCH_STATUS, holder_label or "", None)
    log("swapped", interaction, event_id, member, f"seat from {arg}")
    return update_response(card)


async def _seatless(
    db: AsyncSession,
    found: RaidContext,
    interaction: Interaction,
    target: Target,
    signups: Sequence[WowRaidSignup],
    *,
    queue: bool = False,
) -> _Player | dict[str, Any]:
    """The player while their card still stands, else the answer saying why not.

    They're on the raid with a class (else the id is one no card makes),
    without a seat (for *queue*, out of line altogether), and it's full.
    """
    mine = listed_signup(signups, target.user_id)
    if mine is None:
        notice = raid_manage_copy.gone_from_raid(target.who)
        return update_response(await card_for(db, found, interaction, target, signups, notice=notice))
    label = spec_label(mine)
    if label is None:
        return update_text_response(raid_copy.GENERIC_ERROR)
    placed: tuple[str, ...] = SEAT_STATUSES
    if queue:
        placed = LINE_STATUSES
    if mine.status in placed:
        place = queue_position(signups, target.user_id)
        notice = raid_manage_copy.status_unchanged(target.who, mine.status, place)
        return update_response(await card_for(db, found, interaction, target, signups, notice=notice))
    if not needs_swap(found.event, mine, signups):
        notice = raid_manage_copy.SEAT_OPENED
        return update_response(await card_for(db, found, interaction, target, signups, notice=notice))
    return _Player(mine, label)


async def _swappable(
    db: AsyncSession,
    found: RaidContext,
    interaction: Interaction,
    target: Target,
    signups: Sequence[WowRaidSignup],
    holder_id: str,
) -> _Swap | dict[str, Any]:
    """The swap while the card still stands: the player as :func:`_seatless` has them, and *holder_id* seated.

    A holder with no seat now (they left, moved or were removed) gets the menu again, saying so.
    """
    player = await _seatless(db, found, interaction, target, signups)
    if isinstance(player, dict):
        return player
    holder = signup_of(signups, holder_id)
    if holder is None or holder.status not in SEAT_STATUSES:
        who = Target(holder_id).who
        if holder is not None:
            who = holder_target(holder).who
        notice = raid_manage_copy.holder_lost_seat(who)
        return update_response(holders_data(found.event, target, player.signup, player.label, signups, notice=notice))
    return _Swap(player, holder)


VERBS: Final[dict[str, Verb]] = {
    "swap": pick_holder,
    "hold": holder_page,
    "queue": queue_instead,
    "swapr": ask_swap_why,
    "swapt": partial(swap_players, tell=True),
    "swapq": partial(swap_players, tell=False),
}
