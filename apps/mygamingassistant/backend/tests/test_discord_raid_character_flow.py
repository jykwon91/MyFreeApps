"""Character names end to end: My sign-up's [Character name] form and ``/raid prefs character:``.

The raid post shows a member's character name in place of their Discord
name.  The form saves it on the sign-up and for the sign-up's class, so the
member's next sign-up as that class shows it too; ``/raid prefs
character:`` saves it for a class and leaves sign-ups already made alone.
Built on ``discord_raid_harness.py`` and ``discord_raid_manage_harness.py``.
"""
from __future__ import annotations

import json
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.repositories.wow import wow_raid_member_pref_repo
from app.services.discord import raid_copy, raid_member_copy

from discord_raid_harness import (
    ORGANISER,
    ORGANISER_PERMS,
    FakeDiscord,
    Post,
    assert_ephemeral,
    click,
    command,
    content,
    custom_id_for,
    future_when,
    modal_submit,
)
from discord_raid_manage_harness import posted_raid, review_card, signup_row, tap

pytestmark = pytest.mark.asyncio

_JAINA = "310000000000000001"  # Discord name Player001
_BOB = "310000000000000002"


def _card(event: WowRaidEvent, view: str) -> str:
    return f"raid:v1:card:{event.id}:{view}"


def _form_id(event: WowRaidEvent) -> str:
    return f"raid:v1:m:{event.id}:char"


async def _join(post: Post, event: WowRaidEvent, user_id: str, spec: str = "mage.frost") -> None:
    """Save *spec* with ``/raid prefs``, then tap its class on the post."""
    await post(command("raid", "prefs", user_id=user_id, permissions=0, spec=spec))
    await post(click(f"raid:v1:cls:{event.id}:{spec.split('.')[0]}", user_id=user_id))


async def _submit(post: Post, event: WowRaidEvent, typed: str, user_id: str = _JAINA) -> dict[str, Any]:
    return await post(modal_submit(_form_id(event), {"value": typed}, user_id=user_id, permissions=0))


def _prefill(form: dict[str, Any]) -> str | None:
    [field] = form["data"]["components"]
    return field["component"].get("value")


def _notice(response: dict[str, Any]) -> str:
    """The card's first line: what the form did."""
    return content(response).split("\n")[0]


async def _names(db: AsyncSession, event: WowRaidEvent, user_id: str = _JAINA) -> tuple[str | None, dict[str, object]]:
    """The name *user_id*'s sign-up shows, and the names saved for them."""
    row = await signup_row(db, event, user_id)
    assert row is not None
    pref = await wow_raid_member_pref_repo.get(db, guild_id=event.guild_id, discord_user_id=user_id)
    assert pref is not None
    await db.refresh(pref)
    return row.character_name, pref.character_names


async def _another_raid(post: Post, db: AsyncSession, first: WowRaidEvent) -> WowRaidEvent:
    preview = await post(command("raid-admin", "create", raid="onyxia", when=future_when(12), size=5))
    await post(click(custom_id_for(preview, "confirm"), user_id=ORGANISER, permissions=ORGANISER_PERMS))
    return (await db.execute(select(WowRaidEvent).where(WowRaidEvent.id != first.id))).scalars().one()


# ---------------------------------------------------------------------------
# The form
# ---------------------------------------------------------------------------


async def test_a_member_names_their_character_for_the_raid_post(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    await _join(post, event, _JAINA)
    fake_discord.clear()

    # --- [Character name] opens an empty form
    form = await post(click(_card(event, "char"), user_id=_JAINA))
    assert (form["type"], form["data"]["custom_id"], _prefill(form)) == (9, _form_id(event), None)

    # --- a good name comes back on the card, saved on the sign-up and for the class
    response = await _submit(post, event, "thrallbot")
    assert response["type"] == 7
    assert _notice(response) == "Saved. I'll show **Thrallbot** on your sign-ups."
    assert raid_member_copy.character_line("Thrallbot") in content(response).split("\n")
    assert await _names(db, event) == ("Thrallbot", {"mage": "Thrallbot"})

    # --- the raid post is redrawn once, with the name in place of the Discord name
    (edit,) = fake_discord.public_edits()
    shown = json.dumps(edit.body)
    assert "Thrallbot" in shown
    assert "Player001" not in shown

    # --- the form opens on the name shown now
    form = await post(click(_card(event, "char"), user_id=_JAINA))
    assert _prefill(form) == "Thrallbot"


@pytest.mark.parametrize(
    ("typed", "refusal"),
    [
        ("Thrall 2", raid_member_copy.CHAR_LETTERS),
        ("T", "Character names are 2-12 letters, and that one has 1. Try again."),
    ],
)
async def test_a_name_the_game_would_refuse_is_not_saved(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord, typed: str, refusal: str
) -> None:
    event = await posted_raid(post, db, fake_discord)
    await _join(post, event, _JAINA)
    fake_discord.clear()

    response = await _submit(post, event, typed)

    assert_ephemeral(response)
    assert content(response) == refusal
    assert await _names(db, event) == (None, {})
    assert fake_discord.public_edits() == []


async def test_repeating_or_clearing_the_name(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    event = await posted_raid(post, db, fake_discord)
    await _join(post, event, _JAINA)

    # --- an empty box with no name yet: nothing to clear, the post isn't redrawn
    fake_discord.clear()
    assert _notice(await _submit(post, event, "")) == raid_member_copy.CHAR_NONE
    assert fake_discord.public_edits() == []

    # --- the same name again, in any capitals: nothing changes
    await _submit(post, event, "jaina")
    fake_discord.clear()
    assert _notice(await _submit(post, event, "JAINA")) == raid_member_copy.CHAR_SAME
    assert fake_discord.public_edits() == []

    # --- an empty box goes back to the Discord name
    response = await _submit(post, event, " ")
    assert _notice(response) == raid_member_copy.CHAR_CLEARED
    assert raid_member_copy.CHARACTER_NOT_SET in content(response).split("\n")
    assert await _names(db, event) == (None, {})
    (edit,) = fake_discord.public_edits()
    assert "Player001" in json.dumps(edit.body)


async def test_the_name_follows_the_class(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    event = await posted_raid(post, db, fake_discord)
    await _join(post, event, _JAINA)
    await _submit(post, event, "jaina")

    # --- another class shows that class's name (none yet); back as a mage, Jaina again
    await _join(post, event, _JAINA, "warrior.fury")
    assert await _names(db, event) == (None, {"mage": "Jaina"})
    await post(click(f"raid:v1:cls:{event.id}:mage", user_id=_JAINA))
    assert (await _names(db, event))[0] == "Jaina"

    # --- a status change keeps it
    await post(click(f"raid:v1:status:{event.id}:tentative", user_id=_JAINA))
    row = await signup_row(db, event, _JAINA)
    assert row is not None
    assert (row.status, row.character_name) == ("tentative", "Jaina")

    # --- the next raid shows it from the first tap
    second = await _another_raid(post, db, event)
    await post(click(f"raid:v1:cls:{second.id}:mage", user_id=_JAINA))
    assert (await _names(db, second))[0] == "Jaina"


async def test_a_member_a_leader_adds_shows_their_saved_name(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    await post(command("raid", "prefs", user_id=_BOB, permissions=0, spec="priest.holy", character="aleksa"))

    review = await review_card(post, event, _BOB, "Bob", "priest.holy")
    await post(tap(event, "addq", _BOB, "priest.holy", on=review))

    assert (await _names(db, event, _BOB))[0] == "Aleksa"


# ---------------------------------------------------------------------------
# When the form refuses
# ---------------------------------------------------------------------------


async def test_closed_sign_ups_still_take_a_name(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    event = await posted_raid(post, db, fake_discord)
    await _join(post, event, _JAINA)
    event.closed_at = datetime.now(timezone.utc)
    await db.flush()

    assert (await post(click(_card(event, "char"), user_id=_JAINA)))["type"] == 9
    assert _notice(await _submit(post, event, "jaina")) == "Saved. I'll show **Jaina** on your sign-ups."


def _start(event: WowRaidEvent) -> None:
    event.starts_at = datetime.now(timezone.utc) - timedelta(minutes=1)


def _cancel(event: WowRaidEvent) -> None:
    event.status = "cancelled"


@pytest.mark.parametrize(("change", "refusal"), [(_start, raid_copy.RAID_STARTED), (_cancel, raid_copy.NOT_FOUND)])
async def test_a_started_or_cancelled_raid_takes_no_name(
    post: Post,
    db: AsyncSession,
    fake_discord: FakeDiscord,
    change: Callable[[WowRaidEvent], None],
    refusal: str,
) -> None:
    event = await posted_raid(post, db, fake_discord)
    await _join(post, event, _JAINA)
    change(event)
    await db.flush()

    opened = await post(click(_card(event, "char"), user_id=_JAINA))
    submitted = await _submit(post, event, "jaina")

    for response in (opened, submitted):
        assert (response["type"], content(response)) == (7, refusal)
    assert (await _names(db, event))[0] is None


async def test_only_a_member_signed_up_with_a_class_names_a_character(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    response = await post(click(_card(event, "char"), user_id=_BOB))
    assert (response["type"], content(response)) == (7, raid_copy.NOT_SIGNED_UP)

    # --- absent without a class, or absent with one
    await post(click(f"raid:v1:status:{event.id}:absence", user_id=_BOB))
    await _join(post, event, _JAINA)
    await post(click(f"raid:v1:status:{event.id}:absence", user_id=_JAINA))
    for user_id in (_BOB, _JAINA):
        opened = await post(click(_card(event, "char"), user_id=user_id))
        submitted = await _submit(post, event, "jaina", user_id)
        for response in (opened, submitted):
            assert (response["type"], content(response)) == (7, raid_member_copy.CHAR_NO_CLASS)


# ---------------------------------------------------------------------------
# /raid prefs character:
# ---------------------------------------------------------------------------


async def test_raid_prefs_names_a_character_and_leaves_sign_ups_alone(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    await _join(post, event, _JAINA)
    fake_discord.clear()

    response = await post(command("raid", "prefs", user_id=_JAINA, permissions=0, character="jaina"))

    assert_ephemeral(response)
    lines = content(response).split("\n")
    assert lines[0] == raid_member_copy.prefs_named("Jaina", "Mage")
    assert "Characters: **Jaina** (Mage)" in lines
    assert await _names(db, event) == (None, {"mage": "Jaina"})
    assert fake_discord.public_edits() == []

    # --- with no class saved, it asks for one and saves nothing
    response = await post(command("raid", "prefs", user_id=_BOB, permissions=0, character="aleksa"))
    assert_ephemeral(response)
    assert content(response) == raid_member_copy.CHAR_PREFS_NEEDS_CLASS
    assert await wow_raid_member_pref_repo.get(db, guild_id=event.guild_id, discord_user_id=_BOB) is None
