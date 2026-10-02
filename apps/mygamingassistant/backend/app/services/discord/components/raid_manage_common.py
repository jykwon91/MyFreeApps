"""Manage sign-ups — what every verb shares.

Loading the raid for its leader, reading the player back off the card a
tap came from, whether a DM can reach them, the player's card, and the
menu values a tap carries.  None of these opens a transaction: each works
in the verb's.
"""
from __future__ import annotations

import logging
import uuid
from collections.abc import Awaitable, Callable, Sequence
from typing import Any, Final

from fastapi import BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.discord import emojis, raid_manage_copy
from app.services.discord.interaction import CDN_URL, UNKNOWN_PLAYER, Interaction
from app.services.discord.raid_context import RaidContext, load_led_event
from app.services.discord.raid_manage_notify import ManageDm
from app.services.discord.raid_manage_views import Offer, Reach, Target, player_data, signup_of
from app.services.wow import raid_event_service, raid_member_prefs_service
from app.services.wow.raid_catalog import WowSpecInfo, column_specs, spec_info
from app.services.wow.raid_roster import LISTED_STATUSES
from app.services.wow.raid_text import escape_name

logger = logging.getLogger(__name__)

# A card finds its raid in any of these; a cancelled or finished one says why nothing changes.
SEEN: Final = ("scheduled", "cancelled", "completed")

Verb = Callable[[Interaction, uuid.UUID, str, str, BackgroundTasks], Awaitable[dict[str, Any]]]


async def load(db: AsyncSession, interaction: Interaction, event_id: uuid.UUID, *, lock: bool) -> RaidContext | str:
    """The raid while it's on and this member leads it; else why not."""
    found = await load_led_event(db, interaction, event_id, lock=lock, statuses=SEEN)
    if isinstance(found, str):
        return found
    if found.event.status != "scheduled":
        return raid_manage_copy.GONE
    return found


def target_of(interaction: Interaction, user_id: str, signups: Sequence[WowRaidSignup]) -> Target:
    """The player a card is about: the name and avatar on the card tapped, else their sign-up's name."""
    author = interaction.message_embed_author()
    name = author.get("name")
    if not isinstance(name, str) or not name.strip():
        name = None
        mine = signup_of(signups, user_id)
        if mine is not None:
            name = known(mine.display_name)
    avatar = author.get("icon_url")
    if not isinstance(avatar, str) or not avatar.startswith(f"{CDN_URL}/"):
        avatar = None
    return Target(user_id, name, avatar)


def known(name: str) -> str | None:
    """A real name; None for the placeholder a nameless payload gets."""
    if name == UNKNOWN_PLAYER:
        return None
    return name


async def reach_of(db: AsyncSession, found: RaidContext, interaction: Interaction, user_id: str) -> Reach:
    if user_id == interaction.user_id:
        return "self"
    if await raid_event_service.dm_recipients(db, guild=found.guild, user_ids=[user_id]):
        return "yes"
    return "off"


async def dm_for(
    db: AsyncSession, found: RaidContext, interaction: Interaction, target: Target, *, tell: bool
) -> tuple[ManageDm | None, str | None]:
    """The DM a "tell them" change sends and the line saying so; a player who turned DMs off since gets none."""
    if not tell:
        return None, None
    reach = await reach_of(db, found, interaction, target.user_id)
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


async def card_for(
    db: AsyncSession,
    found: RaidContext,
    interaction: Interaction,
    target: Target,
    signups: Sequence[WowRaidSignup],
    *,
    notice: str | None = None,
) -> dict[str, Any]:
    """The player's card.  Off the raid it offers the spec on file, as the post's buttons would sign them up.

    That's the spec they marked absence as, else their saved one; the
    member's preferences are only read here, never saved.
    """
    offer = None
    mine = signup_of(signups, target.user_id)
    if mine is None or mine.status not in LISTED_STATUSES:
        pref = await raid_member_prefs_service.get(db, guild=found.guild, discord_user_id=target.user_id)
        spec = raid_member_prefs_service.resolve_player(mine, pref).known_spec
        if spec is not None:
            offer = Offer(spec, await reach_of(db, found, interaction, target.user_id))
    return player_data(found.event, target, signups, emojis=emojis.current(), notice=notice, offer=offer)


def names_of(signups: Sequence[WowRaidSignup], user_ids: Sequence[str]) -> list[str]:
    """'**Carol**' for each of *user_ids*, in that order."""
    names: list[str] = []
    for user_id in user_ids:
        signup = signup_of(signups, user_id)
        if signup is not None:
            names.append(f"**{escape_name(signup.display_name)}**")
    return names


def one_value(interaction: Interaction) -> str:
    """A one-pick menu's value; empty for anything else."""
    if len(interaction.values) != 1:
        return ""
    return interaction.values[0]


def picked_spec(interaction: Interaction, column: str) -> WowSpecInfo | None:
    """The spec picked in *column*'s menu; None for anything else."""
    class_key, _, spec_key = one_value(interaction).partition(".")
    spec = spec_info(class_key, spec_key)
    if spec is None or spec not in column_specs(column):
        return None
    return spec


def log(action: str, interaction: Interaction, event_id: uuid.UUID, user_id: str, detail: str) -> None:
    logger.info(
        "Raid bot: leader %s %s player %s on raid %s (%s)", interaction.user_id, action, user_id, event_id, detail
    )
