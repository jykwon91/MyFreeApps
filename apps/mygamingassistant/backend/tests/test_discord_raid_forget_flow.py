"""Forget my specs end to end: My sign-up's [Forget my specs], the card asking first, and after.

Forgetting clears the remembered class and the saved specs, so the next
class tap asks for a spec again.  Sign-ups, character names and the DM
setting stay, and the raid post isn't redrawn.  Built on
``discord_raid_harness.py`` and ``discord_raid_manage_harness.py``.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.repositories.wow import wow_raid_member_pref_repo
from app.services.discord import raid_copy, raid_member_copy

from discord_raid_harness import FakeDiscord, Post, click, command, content, custom_id_for, custom_ids
from discord_raid_manage_harness import posted_raid, signup_row

pytestmark = pytest.mark.asyncio

_JAINA = "320000000000000001"
_BOB = "320000000000000002"


def _card(event: WowRaidEvent, view: str) -> str:
    return f"raid:v1:card:{event.id}:{view}"


async def _prefs(post: Post, user_id: str, **options: Any) -> None:
    await post(command("raid", "prefs", user_id=user_id, permissions=0, **options))


def _notice(response: dict[str, Any]) -> str:
    """The card's first line: what the last tap did."""
    return content(response).split("\n")[0]


async def test_forgetting_saved_specs(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    event = await posted_raid(post, db, fake_discord)
    await _prefs(post, _JAINA, spec="priest.holy", character="aleksa", dm_reminders=False)
    await _prefs(post, _JAINA, spec="mage.frost")
    await post(click(f"raid:v1:cls:{event.id}:mage", user_id=_JAINA))
    fake_discord.clear()

    # --- My sign-up offers it beside [Full roster]
    card = await post(click(f"raid:v1:mine:{event.id}", user_id=_JAINA))
    assert custom_ids(card)[-2:] == [_card(event, "roster"), _card(event, "forget")]

    # --- it asks first, listing what's saved; [Keep them] goes back to the card
    asked = await post(click(_card(event, "forget"), user_id=_JAINA))
    assert asked["type"] == 7
    assert content(asked).split("\n") == [
        raid_member_copy.FORGET_PROMPT,
        "Saved: Frost Mage, Holy Priest",
        raid_member_copy.FORGET_AFTER,
    ]
    assert custom_ids(asked) == [_card(event, "forgetyes"), _card(event, "back")]
    assert _card(event, "forget") in custom_ids(await post(click(_card(event, "back"), user_id=_JAINA)))

    # --- [Yes, forget them]: the card comes back saying so, without the button
    done = await post(click(_card(event, "forgetyes"), user_id=_JAINA))
    assert (done["type"], _notice(done)) == (7, raid_member_copy.FORGET_DONE)
    assert _card(event, "forget") not in custom_ids(done)
    pref = await wow_raid_member_pref_repo.get(db, guild_id=event.guild_id, discord_user_id=_JAINA)
    assert pref is not None
    await db.refresh(pref)
    assert (pref.default_wow_class, pref.saved_specs) == (None, {})
    assert (pref.character_names, pref.dm_opt_out) == ({"priest": "Aleksa"}, True)
    # The sign-up stays as it was, so the raid post isn't redrawn.
    row = await signup_row(db, event, _JAINA)
    assert row is not None
    assert (row.status, row.wow_class, row.spec) == ("confirmed", "mage", "frost")
    assert fake_discord.public_edits() == []

    # --- [Yes] again, or [Forget my specs] on a card opened before: nothing left
    for view in ("forgetyes", "forget"):
        assert _notice(await post(click(_card(event, view), user_id=_JAINA))) == raid_member_copy.FORGET_NOTHING

    # --- the next class tap asks for the spec again
    response = await post(click(f"raid:v1:cls:{event.id}:priest", user_id=_JAINA))
    assert custom_id_for(response, "spec").startswith(f"raid:v1:spec:{event.id}:priest:")


async def test_forget_my_specs_shows_only_on_a_sign_up_with_something_saved(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)

    # --- specs saved, but not signed up
    await _prefs(post, _JAINA, spec="mage.frost")
    card = await post(click(f"raid:v1:mine:{event.id}", user_id=_JAINA))
    assert custom_ids(card) == [_card(event, "roster")]

    # --- signed up (absent), with only a DM setting saved
    await _prefs(post, _BOB, dm_reminders=False)
    await post(click(f"raid:v1:status:{event.id}:absence", user_id=_BOB))
    card = await post(click(f"raid:v1:mine:{event.id}", user_id=_BOB))
    assert custom_ids(card) == [_card(event, "roster")]


async def test_forgetting_works_once_the_raid_starts_but_not_once_it_is_cancelled(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    await _prefs(post, _JAINA, spec="mage.frost")
    await post(click(f"raid:v1:cls:{event.id}:mage", user_id=_JAINA))
    event.starts_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    await db.flush()

    assert _notice(await post(click(_card(event, "forget"), user_id=_JAINA))) == raid_member_copy.FORGET_PROMPT
    assert _notice(await post(click(_card(event, "forgetyes"), user_id=_JAINA))) == raid_member_copy.FORGET_DONE

    event.status = "cancelled"
    await db.flush()
    for view in ("forget", "forgetyes"):
        response = await post(click(_card(event, view), user_id=_JAINA))
        assert (response["type"], content(response)) == (7, raid_copy.NOT_FOUND)
