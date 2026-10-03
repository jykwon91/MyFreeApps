"""A raid post's pin — pinned while the raid is still to start, the bot's own pin undone after.

:func:`sync` brings the pin in line with the raid as it is now
(``raid_advanced.pin_step``): it pins the post and stamps
``pinned_message_id``, or unpins the post the bot pinned and clears it.
Called after [Post raid] (``raid_publisher.post_raid``), after every
refresh of the post (``refresh_public_message``: a sign-up, an edit, the
start), after a cancel (``announce_cancellation``), after a repeat's post
(``raid_sweeps``) and from the Pin the post card
(``components.raid_post_options``).

* Only a pin the bot made is undone: a member's pin isn't stamped, so it
  stays.
* A stamp naming a post that's gone (deleted, reposted) is forgotten —
  Discord took that pin with it — and the new post is pinned.
* A refusal — no **Pin Messages** (50013), a full pin list (30003) — or
  silence is logged once at WARNING and comes back as a ``PinResult`` for
  the caller to show; nothing is stamped, so the next sync tries again.
  An unpin of a post that's gone (10008) counts as done.

Each call's stamp is written under the raid's row lock and only when the
post is still the one the call was for.  A second round catches a change
made while the first call was out (a cancel while the pin was on its way).
Never raises.
"""
from __future__ import annotations

import logging
import uuid
from collections.abc import Awaitable
from dataclasses import dataclass
from typing import Final, Literal

from platform_shared.services.discord import MAX_PINS, MISSING_PERMISSIONS, DiscordRestClient

from app.db.session import unit_of_work
from app.repositories.wow import wow_raid_advanced_repo, wow_raid_event_repo, wow_raid_guild_repo
from app.services.discord.raid_extras_calls import Answer, ask, warn
from app.services.wow.raid_advanced import PinResult, pin_step

logger = logging.getLogger(__name__)

# The most calls one sync makes: the call the raid needs, then one for a change made meanwhile.
_ROUNDS: Final = 2


@dataclass(frozen=True)
class _Pin:
    """One call: pin or unpin *message_id* in *channel_id*."""

    step: Literal["pin", "unpin"]
    channel_id: str
    message_id: str


async def sync(client: DiscordRestClient, event_id: uuid.UUID) -> PinResult | None:
    """Pin or unpin the raid's post as the raid now needs: how the last call went; None when none was needed."""
    try:
        result: PinResult | None = None
        for _ in range(_ROUNDS):
            pin = await _plan(event_id)
            if pin is None:
                return result
            answer = await ask(_call(client, pin))
            await _record(event_id, pin, answer)
            result = _result(event_id, pin, answer)
            if result.kind != "done":
                return result
        return result
    except Exception:
        logger.exception("Raid bot: syncing raid %s's pin failed", event_id)
        return None


async def _plan(event_id: uuid.UUID) -> _Pin | None:
    """The call the post's pin needs now — a gone post's stamp forgotten first; None when it needs none."""
    async with unit_of_work() as db:
        event = await wow_raid_event_repo.get(db, event_id)
        if event is None:
            return None
        guild = await wow_raid_guild_repo.get(db, event.guild_id)
        if guild is None:
            return None
        step = pin_step(event, guild)
        if step == "forget":
            event = await wow_raid_event_repo.get_for_update(db, event_id)
            if event is None:
                return None
            if pin_step(event, guild) == "forget":
                await wow_raid_advanced_repo.set_pinned_message(db, event, None)
            step = pin_step(event, guild)
        if step == "pin" and event.message_id is not None:
            return _Pin("pin", event.channel_id, event.message_id)
        if step == "unpin" and event.pinned_message_id is not None:
            return _Pin("unpin", event.channel_id, event.pinned_message_id)
        return None


def _call(client: DiscordRestClient, pin: _Pin) -> Awaitable[None]:
    if pin.step == "pin":
        return client.pin_message(pin.channel_id, pin.message_id)
    return client.unpin_message(pin.channel_id, pin.message_id)


def _went_through(pin: _Pin, answer: Answer) -> bool:
    """The call did what it was for: an unpin of a post that's gone counts."""
    return answer.ok or (pin.step == "unpin" and answer.kind == "gone")


async def _record(event_id: uuid.UUID, pin: _Pin, answer: Answer) -> None:
    """A pin that went through is stamped, an unpin's stamp cleared — while the post is still that one."""
    if not _went_through(pin, answer):
        return
    async with unit_of_work() as db:
        event = await wow_raid_event_repo.get_for_update(db, event_id)
        if event is None:
            return
        if pin.step == "pin" and event.message_id == pin.message_id:
            await wow_raid_advanced_repo.set_pinned_message(db, event, pin.message_id)
        if pin.step == "unpin" and event.pinned_message_id == pin.message_id:
            await wow_raid_advanced_repo.set_pinned_message(db, event, None)


def _result(event_id: uuid.UUID, pin: _Pin, answer: Answer) -> PinResult:
    if _went_through(pin, answer):
        return PinResult(pin.step, "done", pin.channel_id)
    warn(answer, "post", pin.step, event_id)
    return PinResult(pin.step, _refusal(answer.code), pin.channel_id)


def _refusal(code: int | None) -> Literal["permission", "full", "failed"]:
    """Why Discord didn't take the call: no Pin Messages, a full pin list, or anything else (silence too)."""
    if code == MISSING_PERMISSIONS:
        return "permission"
    if code == MAX_PINS:
        return "full"
    return "failed"
