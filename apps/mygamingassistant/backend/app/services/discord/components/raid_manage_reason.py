"""Manage sign-ups — [Add and say why] / [Remove and say why] / [Move and say why].

Each opens a form (type 9) for the reason, and the form's custom_id is the
button's own.  Opening it is one read: a card gone stale (the player got on
the raid, left it, or is already where the move would put them) answers with
the player's card saying so instead.  The submit makes the change that
button's "tell them" twin makes, under the raid's row lock, with the reason
on its own line of the player's DM; one made stale while the form was open
says so like that button does, and the reason goes nowhere.  A box of only
spaces sends the plain DM; dismissing the form changes nothing.
"""
from __future__ import annotations

import uuid
from functools import partial
from typing import Any, Final

from fastapi import BackgroundTasks

from app.db.session import unit_of_work
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.repositories.wow import wow_raid_signup_repo
from app.services.discord import raid_copy, raid_manage_copy
from app.services.discord.components.raid_manage_changes import add_player, drop_player
from app.services.discord.components.raid_manage_common import Verb, card_for, load, target_of
from app.services.discord.components.raid_manage_status import move_player
from app.services.discord.interaction import (
    Interaction,
    ephemeral_response,
    update_response,
    update_text_response,
)
from app.services.discord.raid_edit_views import FIELD, reason_modal
from app.services.discord.raid_manage_views import Target, listed_signup
from app.services.wow.raid_custom_id import RaidCustomId
from app.services.wow.raid_details import clean_reason


async def ask_why(
    interaction: Interaction,
    event_id: uuid.UUID,
    member: str,
    arg: str,
    background: BackgroundTasks,
    *,
    verb: str,
) -> dict[str, Any]:
    """A "say why" button: the form, unless the change it offers is gone (then the player's card says why)."""
    async with unit_of_work() as db:
        found = await load(db, interaction, event_id, lock=False)
        if isinstance(found, str):
            return update_text_response(found)
        signups = await wow_raid_signup_repo.list_for_event(db, event_id)
        target = target_of(interaction, member, signups)
        notice = _stale(verb, target, listed_signup(signups, member), arg)
        if notice is not None:
            return update_response(await card_for(db, found, interaction, target, signups, notice=notice))
    return reason_modal(interaction.custom_id)


def _stale(verb: str, target: Target, mine: WowRaidSignup | None, arg: str) -> str | None:
    """Why the change a "say why" button offers can't be made now; None while it can."""
    if verb == "addr":
        if mine is not None:
            return raid_manage_copy.already_on(target.who)
        return None
    if mine is None:
        return raid_manage_copy.gone_from_raid(target.who)
    if verb == "markr" and mine.status == arg:
        return raid_manage_copy.status_unchanged(target.who, arg, None)
    return None


async def handle_submit(interaction: Interaction, parsed: RaidCustomId, background: BackgroundTasks) -> dict[str, Any]:
    """The form sent: the button's change, telling the player why."""
    assert parsed.event_id is not None
    verb, member, arg = parsed.args
    apply = _APPLY.get(verb)
    if apply is None:
        return ephemeral_response(raid_copy.GENERIC_ERROR)
    reason = clean_reason(interaction.fields.get(FIELD, ""))
    return await apply(interaction, parsed.event_id, member, arg, background, reason=reason)


VERBS: Final[dict[str, Verb]] = {
    "addr": partial(ask_why, verb="addr"),
    "dropr": partial(ask_why, verb="dropr"),
    "markr": partial(ask_why, verb="markr"),
}

# What each form's submit does: the "tell them" change, with the reason.
_APPLY: Final = {
    "addr": partial(add_player, tell=True),
    "dropr": partial(drop_player, tell=True),
    "markr": partial(move_player, ask=False, tell=True),
}
