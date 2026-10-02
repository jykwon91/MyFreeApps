"""Sign-up notes end to end: the notes switch, My sign-up's note form, [Add reason] and what the leader reads.

A raid takes notes once its leader turns them on (Raid: Edit, or More
options on a draft).  A member writes theirs from My sign-up, or from
[Add reason] under the reply to a tap that made them late, tentative or
absent; a status change clears it.  The leader reads notes on Raid: Signed
and on a player's card in Manage sign-ups; turning notes off hides them.
Built on ``discord_raid_harness.py`` and ``discord_raid_manage_harness.py``.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.services.discord import raid_copy, raid_member_copy
from app.services.discord.commands_spec import EDIT_MENU, SIGNED_MENU
from app.services.discord.raid_member_views import reason_text
from app.services.wow.raid_text import escape_note

from discord_raid_harness import (
    APP_ID,
    ORGANISER,
    ORGANISER_PERMS,
    TOKEN,
    FakeDiscord,
    Post,
    click,
    command,
    content,
    custom_id_for,
    custom_ids,
    future_when,
    menu_command,
    modal_submit,
    setup_guild,
)
from discord_raid_manage_harness import card_description, fill_seats, pick, posted_raid, signup_row, tap

pytestmark = pytest.mark.asyncio

_JAINA = "320000000000000001"  # Discord name Player001
_BOB = "320000000000000002"
_SEAT = "300000000000000100"  # the first of ``fill_seats``
_MEMBER = {"user_id": "401", "permissions": 0}


def _ed(event: WowRaidEvent, action: str, **as_who: Any) -> dict[str, Any]:
    """A click on the edit (or draft) card — by the organiser unless *as_who* says otherwise."""
    as_who = {"user_id": ORGANISER, "permissions": ORGANISER_PERMS, **as_who}
    return click(f"raid:v1:ed:{event.id}:{action}", **as_who)


def _card(event: WowRaidEvent, view: str) -> str:
    return f"raid:v1:card:{event.id}:{view}"


def _status(event: WowRaidEvent, status: str, user_id: str = _JAINA) -> dict[str, Any]:
    return click(f"raid:v1:status:{event.id}:{status}", user_id=user_id)


async def _join(post: Post, event: WowRaidEvent, user_id: str = _JAINA) -> None:
    """Save Frost Mage with ``/raid prefs``, then tap Mage on the post."""
    await post(command("raid", "prefs", user_id=user_id, permissions=0, spec="mage.frost"))
    await post(click(f"raid:v1:cls:{event.id}:mage", user_id=user_id))


async def _write(
    post: Post, event: WowRaidEvent, typed: str, *, form: str = "note", user_id: str = _JAINA
) -> dict[str, Any]:
    return await post(modal_submit(f"raid:v1:m:{event.id}:{form}", {"value": typed}, user_id=user_id, permissions=0))


async def _note_of(db: AsyncSession, event: WowRaidEvent, user_id: str = _JAINA) -> str | None:
    row = await signup_row(db, event, user_id)
    assert row is not None
    return row.note


async def _notes_enabled(db: AsyncSession, event: WowRaidEvent) -> bool:
    await db.refresh(event)
    return event.signup_notes_enabled


def _first_line(response: dict[str, Any]) -> str:
    return content(response).split("\n")[0]


def _labels(response: dict[str, Any]) -> list[str]:
    return [c["label"] for row in response["data"]["components"] for c in row["components"]]


def _prefill(form: dict[str, Any]) -> str | None:
    [field] = form["data"]["components"]
    return field["component"].get("value")


def _followups(fake_discord: FakeDiscord) -> list[dict[str, Any]]:
    """The private follow-ups sent after taps, oldest first."""
    return [call.body for call in fake_discord.find("POST", f"/webhooks/{APP_ID}/{TOKEN}")]


def _asks_why(body: dict[str, Any], event: WowRaidEvent, text: str | None, status: str) -> None:
    """*body* (a reply or follow-up) says *text*, then asks why, with [Add reason]."""
    ids = [c["custom_id"] for row in body["components"] for c in row["components"]]
    assert (body["content"], ids) == (reason_text(text, status), [_card(event, "reason")])


async def _notes_on_raid(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> WowRaidEvent:
    """A posted five-player raid taking notes, with the Discord calls so far forgotten."""
    event = await posted_raid(post, db, fake_discord)
    await post(_ed(event, "notes_on"))
    fake_discord.clear()
    return event


# ---------------------------------------------------------------------------
# The switch
# ---------------------------------------------------------------------------


async def test_the_leader_turns_notes_on_and_off_on_raid_edit(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    assert f"raid:v1:ed:{event.id}:notes_on" in custom_ids(await post(menu_command(EDIT_MENU, "m1")))

    for action, said, now_on, switch in (
        ("notes_on", raid_member_copy.NOTES_ON, True, "notes_off"),
        ("notes_on", raid_member_copy.NOTES_ALREADY_ON, True, "notes_off"),  # a stale card
        ("notes_off", raid_member_copy.NOTES_OFF, False, "notes_on"),
        ("notes_off", raid_member_copy.NOTES_ALREADY_OFF, False, "notes_on"),
    ):
        response = await post(_ed(event, action))
        assert (response["type"], content(response)) == (7, said)
        assert f"raid:v1:ed:{event.id}:{switch}" in custom_ids(response)
        assert await _notes_enabled(db, event) is now_on
    assert fake_discord.public_edits() == []  # the post never shows notes

    response = await post(_ed(event, "notes_on", **_MEMBER))
    assert (content(response), await _notes_enabled(db, event)) == (raid_copy.NOT_LEADER, False)

    event.status = "cancelled"
    await db.flush()
    response = await post(_ed(event, "notes_on"))
    assert (content(response), await _notes_enabled(db, event)) == (raid_copy.EDIT_GONE_PROMPT, False)


async def test_a_draft_takes_notes_from_more_options(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    await setup_guild(post)
    await post(command("raid-admin", "create", raid="onyxia", when=future_when(), size=5))
    event = (await db.execute(select(WowRaidEvent))).scalars().one()
    assert f"raid:v1:ed:{event.id}:notes_on" in custom_ids(await post(_ed(event, "more")))

    response = await post(_ed(event, "notes_on"))
    assert (response["type"], _first_line(response)) == (7, raid_member_copy.NOTES_ON)
    assert f"raid:v1:ed:{event.id}:notes_off" in custom_ids(response)
    response = await post(_ed(event, "notes_on"))
    assert _first_line(response) == raid_member_copy.NOTES_ALREADY_ON

    await post(click(f"raid:v1:confirm:{event.id}", user_id=ORGANISER, permissions=ORGANISER_PERMS))
    assert (await _notes_enabled(db, event), event.status) == (True, "scheduled")


# ---------------------------------------------------------------------------
# My sign-up's note
# ---------------------------------------------------------------------------


async def test_a_member_adds_edits_and_removes_their_note(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _notes_on_raid(post, db, fake_discord)
    await _join(post, event)
    fake_discord.clear()

    card = await post(click(_card(event, "back"), user_id=_JAINA))
    assert raid_member_copy.NOTE_NOT_SET in content(card).split("\n")
    assert raid_member_copy.NOTE_ADD in _labels(card)
    form = await post(click(_card(event, "note"), user_id=_JAINA))
    assert (form["type"], form["data"]["custom_id"], _prefill(form)) == (9, f"raid:v1:m:{event.id}:note", None)

    response = await _write(post, event, "  Can only stay\n2 hours ")
    assert (response["type"], _first_line(response)) == (7, raid_member_copy.NOTE_OK)
    assert raid_member_copy.note_line("Can only stay 2 hours") in content(response).split("\n")
    assert raid_member_copy.NOTE_EDIT in _labels(response)
    assert await _note_of(db, event) == "Can only stay 2 hours"
    assert _prefill(await post(click(_card(event, "note"), user_id=_JAINA))) == "Can only stay 2 hours"

    for typed, said, kept in (
        ("Can only stay 2 hours", raid_member_copy.NOTE_SAME, "Can only stay 2 hours"),
        ("Need to leave at 11", raid_member_copy.NOTE_OK, "Need to leave at 11"),
        ("   ", raid_member_copy.NOTE_CLEARED, None),
        ("", raid_member_copy.NOTE_NONE, None),
    ):
        assert _first_line(await _write(post, event, typed)) == said
        assert await _note_of(db, event) == kept
    assert fake_discord.public_edits() == []  # the post never shows notes


async def test_a_note_waits_for_notes_on_and_stops_when_the_raid_starts(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    await _join(post, event)
    assert content(await post(click(_card(event, "note"), user_id=_JAINA))) == raid_member_copy.NOTES_OFF_NOW
    assert content(await _write(post, event, "Hello")) == raid_member_copy.NOTE_NOT_SAVED
    assert await _note_of(db, event) is None

    await post(_ed(event, "notes_on"))
    assert content(await post(click(_card(event, "note"), user_id=_BOB))) == raid_copy.NOT_SIGNED_UP
    assert content(await _write(post, event, "Hello", user_id=_BOB)) == raid_copy.NOT_SIGNED_UP

    # --- closed sign-ups still take a note; a started raid doesn't
    event.closed_at = datetime.now(timezone.utc)
    await db.flush()
    assert _first_line(await _write(post, event, "Bringing flasks")) == raid_member_copy.NOTE_OK
    event.starts_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    await db.flush()
    assert content(await post(click(_card(event, "note"), user_id=_JAINA))) == raid_copy.RAID_STARTED
    assert content(await _write(post, event, "Later")) == raid_copy.RAID_STARTED
    assert await _note_of(db, event) == "Bringing flasks"


async def test_a_status_change_clears_the_note_a_spec_change_or_a_move_up_keeps_it(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _notes_on_raid(post, db, fake_discord)
    await _join(post, event)
    await _write(post, event, "Bringing flasks")

    response = await post(click(f"raid:v1:change:{event.id}", user_id=_JAINA))
    await post(click(custom_id_for(response, "spec"), user_id=_JAINA, values=["mage.fire"]))
    assert await _note_of(db, event) == "Bringing flasks"
    await post(_status(event, "late"))
    assert await _note_of(db, event) is None

    # --- Bob waits in the queue with a note, and keeps it when a seat frees up
    await fill_seats(db, event, 4)
    await _join(post, event, _BOB)
    await _write(post, event, "Happy to sit out", user_id=_BOB)
    response = await post(_status(event, "absence", user_id=_SEAT))
    await post(click(custom_id_for(response, "release"), user_id=_SEAT))
    row = await signup_row(db, event, _BOB)
    assert row is not None
    assert (row.status, row.note) == ("confirmed", "Happy to sit out")


# ---------------------------------------------------------------------------
# Asking why
# ---------------------------------------------------------------------------


async def test_a_tap_to_late_asks_why_and_add_reason_answers_in_words(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _notes_on_raid(post, db, fake_discord)
    await _join(post, event)
    fake_discord.clear()

    response = await post(_status(event, "late"))
    assert response["type"] == 7  # the post
    [followup] = _followups(fake_discord)
    _asks_why(followup, event, None, "late")

    form = await post(click(_card(event, "reason"), user_id=_JAINA))
    assert (form["type"], form["data"]["custom_id"]) == (9, f"raid:v1:m:{event.id}:reason")
    assert form["data"]["components"][0]["component"]["placeholder"] == raid_member_copy.note_placeholder("late")
    response = await _write(post, event, "Train delayed", form="reason")
    data = response["data"]
    assert (response["type"], data["content"]) == (7, raid_member_copy.NOTE_OK)
    assert (data["components"], data["embeds"]) == ([], [])
    assert await _note_of(db, event) == "Train delayed"

    # --- the same tap again changes nothing and asks nothing
    fake_discord.clear()
    assert (await post(_status(event, "late")))["type"] == 4
    assert _followups(fake_discord) == []


async def test_a_first_sign_up_as_late_asks_why_on_its_last_step(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _notes_on_raid(post, db, fake_discord)
    response = await post(_status(event, "late", user_id=_BOB))
    response = await post(click(custom_id_for(response, "class"), user_id=_BOB, values=["mage"]))
    response = await post(click(custom_id_for(response, "spec"), user_id=_BOB, values=["mage.frost"]))
    assert response["type"] == 7
    picked = f"{raid_copy.marked_as('late', 'Frost Mage')} {raid_copy.NEXT_TIME_ONE_TAP}"
    _asks_why(response["data"], event, picked, "late")


async def test_leaving_the_queue_or_freeing_a_seat_asks_why_too(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _notes_on_raid(post, db, fake_discord)
    await fill_seats(db, event, 5)
    await _join(post, event)
    [queued] = _followups(fake_discord)
    assert queued["components"] == []  # a full raid isn't the member's call

    fake_discord.clear()
    await post(_status(event, "tentative"))
    [followup] = _followups(fake_discord)
    _asks_why(followup, event, raid_copy.LEFT_QUEUE, "tentative")

    await _join(post, event, _BOB)
    response = await post(_status(event, "absence", user_id=_SEAT))
    response = await post(click(custom_id_for(response, "release"), user_id=_SEAT))
    assert response["type"] == 7
    _asks_why(response["data"], event, raid_copy.seat_released("absence", handed_on=True), "absence")


async def test_no_asking_why_while_notes_are_off(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    event = await posted_raid(post, db, fake_discord)
    await _join(post, event)
    fake_discord.clear()
    await post(_status(event, "late"))
    assert _followups(fake_discord) == []
    assert _card(event, "note") not in custom_ids(await post(click(_card(event, "back"), user_id=_JAINA)))


# ---------------------------------------------------------------------------
# What the leader reads
# ---------------------------------------------------------------------------


async def test_the_leader_reads_notes_until_they_are_turned_off(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _notes_on_raid(post, db, fake_discord)
    await _join(post, event)
    typed = "@everyone <@123> **now** https://x.y"
    await _write(post, event, typed)
    shown = escape_note(typed)

    async def where_seen() -> list[bool]:
        card = await post(click(_card(event, "back"), user_id=_JAINA))
        signed = card_description(await post(menu_command(SIGNED_MENU, "m1")))
        player = card_description(await post(pick(event, _JAINA, "Jaina")))
        return [shown in content(card), f'Player001 - "{shown}"' in signed, shown in player]

    assert await where_seen() == [True, True, True]
    assert "@everyone" not in card_description(await post(menu_command(SIGNED_MENU, "m1")))
    await post(_ed(event, "notes_off"))
    assert await where_seen() == [False, False, False]
    assert await _note_of(db, event) == typed  # hidden, not deleted
    await post(_ed(event, "notes_on"))
    assert await where_seen() == [True, True, True]

    # --- an absent member's reason shows on the card that offers to add them back
    await post(_status(event, "absence"))
    await _write(post, event, "Out of town", form="reason")
    assert 'Note: "Out of town"' in card_description(await post(pick(event, _JAINA, "Jaina")))


async def test_only_the_leader_reads_the_notes(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    event = await _notes_on_raid(post, db, fake_discord)
    await _join(post, event)
    await _write(post, event, "Can tank if needed")
    for request in (
        menu_command(SIGNED_MENU, "m1", **_MEMBER),
        tap(event, "open", **_MEMBER),
        pick(event, _JAINA, "Jaina", **_MEMBER),
    ):
        response = await post(request)
        assert content(response) == raid_copy.NOT_LEADER
        assert "Can tank" not in str(response)
