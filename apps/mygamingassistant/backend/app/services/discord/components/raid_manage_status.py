"""Manage sign-ups — the status row: [Seat] [Late] [Tentative] [Bench] on a player's card.

A move that gives up or takes a seat or a place in the queue asks first:
[Move and tell them] / [Move quietly] / [Move and say why], or just
[Move].  One that doesn't (a seat marked late or not, tentative to the
bench and back) happens at once and tells nobody.  Every tap decides from
the player's row as it is now, under the raid's row lock, so a card left
open acts on the real move.

A seat asked for on a full raid is a swap: the menu of seat holders
(:mod:`app.services.discord.components.raid_manage_swap`), whose [Queue
them instead] is the review of a place in the queue (``queued``).  A seat
given up goes to the next player in the queue (the same role first), who
gets the usual moved-up DM.  Leaders aren't held to the raid's limits: the
review and the notice say when a move goes over one.
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
    reach_of,
    target_of,
)
from app.services.discord.interaction import Interaction, update_response, update_text_response
from app.services.discord.raid_manage_notify import notify_moved
from app.services.discord.raid_manage_swap_views import holders_data
from app.services.discord.raid_manage_views import listed_signup, mark_review_data, needs_swap, over_limit, spec_label
from app.services.wow import raid_event_service, raid_signup_service
from app.services.wow.raid_roster import LINE_STATUSES, QUEUED_STATUS, SEAT_STATUSES, queue_position


def needs_review(previous: str, requested: str) -> bool:
    """Whether a move gives up or takes a seat or a place in the queue.

    Seat ↔ Late keeps the seat and Tentative ↔ Bench holds none: those
    happen at once.  Every other move changes who's on the line.
    """
    return (previous in LINE_STATUSES) != (requested in SEAT_STATUSES)


def in_place(status: str, requested: str) -> bool:
    """Whether a player at *status* is already where a move to *requested* puts them.

    ``queued`` (the queue review's) asks for a place in line: a seat or the queue.
    """
    if requested == QUEUED_STATUS:
        return status in LINE_STATUSES
    return status == requested


async def move_player(
    interaction: Interaction,
    event_id: uuid.UUID,
    member: str,
    status: str,
    background: BackgroundTasks,
    *,
    ask: bool,
    tell: bool,
    reason: str | None = None,
) -> dict[str, Any]:
    """Move the player to *status*: from the status row (*ask*) a move that needs a review gets one first."""
    async with unit_of_work() as db:
        found = await load(db, interaction, event_id, lock=True)
        if isinstance(found, str):
            return update_text_response(found)
        event = found.event
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        target = target_of(interaction, member, signups)
        mine = listed_signup(signups, member)
        if mine is None:
            notice = raid_manage_copy.gone_from_raid(target.who)
            return update_response(await card_for(db, found, interaction, target, signups, notice=notice))
        label = spec_label(mine)
        if label is None:
            # The row is only on the card of a player with a class.
            return update_text_response(raid_copy.GENERIC_ERROR)
        if in_place(mine.status, status):
            notice = raid_manage_copy.status_unchanged(target.who, mine.status, queue_position(signups, member))
            return update_response(await card_for(db, found, interaction, target, signups, notice=notice))
        if status in SEAT_STATUSES and needs_swap(event, mine, signups):
            # Someone gives up their seat for it.  A review drawn before the raid filled moves nobody.
            notice = raid_manage_copy.NOBODY_MOVED
            if ask:
                notice = None
            return update_response(holders_data(event, target, mine, label, signups, notice=notice))
        # The queue review asks for a seat: the queue while the raid is full, else a seat (the queue's next).
        requested = status
        if status == QUEUED_STATUS:
            requested = "confirmed"
        reviewed = needs_review(mine.status, requested)
        if ask and reviewed:
            reach = await reach_of(db, found, interaction, member)
            return update_response(mark_review_data(event, target, mine, status, label, signups, reach=reach))
        hit = over_limit(event, mine, requested, signups)
        change = await raid_signup_service.change_status(
            db,
            event=event,
            discord_user_id=member,
            display_name=target.name or mine.display_name,
            requested_status=requested,
            wow_class=mine.wow_class,
            role=mine.role,
            spec=mine.spec,
        )
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        changed = change.outcome == "changed"
        lines = [raid_manage_copy.status_unchanged(target.who, change.status, change.queue_position)]
        dm = None
        if changed:
            lines = [raid_manage_copy.moved(target.who, change.status, change.queue_position)]
            if change.promoted:
                lines[0] += f" {raid_manage_copy.moved_up(names_of(signups, change.promoted))}"
            if hit is not None:
                lines.append(raid_manage_copy.moved_over(hit))
            # A review made stale by another change may now be a move that moves nobody: that one's quiet.
            dm, dm_line = await dm_for(db, found, interaction, target, tell=tell and reviewed, reason=reason)
            if dm_line is not None:
                lines.append(dm_line)
        promoted = await raid_event_service.dm_recipients(db, guild=found.guild, user_ids=change.promoted)
        card = await card_for(db, found, interaction, target, signups, notice="\n".join(lines))

    if changed:
        background.add_task(raid_publisher.refresh_public_message, event_id)
        background.add_task(raid_publisher.notify_promoted, event_id, promoted)
        if dm is not None:
            background.add_task(notify_moved, dm, change.status, label, change.queue_position)
        log("moved", interaction, event_id, member, f"{change.previous} to {change.status}")
    return update_response(card)


VERBS: Final[dict[str, Verb]] = {
    "mark": partial(move_player, ask=True, tell=False),
    "markt": partial(move_player, ask=False, tell=True),
    "markq": partial(move_player, ask=False, tell=False),
}
