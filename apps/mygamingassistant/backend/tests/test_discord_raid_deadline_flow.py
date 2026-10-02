"""End-to-end flows for the sign-up deadline: Raid: Edit → [Deadline] and More options → [Deadline].

The form's submits and what they do to sign-ups and the post, the post's
buttons and Raid: Close / Raid: Open around a passed deadline, a move across
it, and [Post raid] once it has passed, through POST /discord/interactions
with ``discord_raid_harness.py``.  The worker's sweeps have their own tests
(``test_wow_raid_sweeps_db.py``).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.services.discord import raid_copy, raid_deadline_copy
from app.services.discord.commands_spec import CLOSE_MENU, OPEN_MENU
from app.services.discord.raid_draft_copy import NOTHING_CHANGED, preview_state
from app.services.wow.raid_embed import COLOR_CLOSED, COLOR_OPEN

from discord_raid_harness import (
    CHANNEL,
    NY,
    ORGANISER,
    ORGANISER_PERMS,
    ROLE,
    FakeDiscord,
    Post,
    click,
    command,
    content,
    create_and_post,
    future_when,
    menu_command,
    modal_submit,
    setup_guild,
)

pytestmark = pytest.mark.asyncio

_POST = f"/channels/{CHANNEL}/messages/m1"


async def _raid(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> WowRaidEvent:
    """A posted raid — its post is m1 — with the Discord calls so far forgotten."""
    await setup_guild(post)
    event = await create_and_post(post, db)
    fake_discord.clear()
    return event


def _edit(event: WowRaidEvent, action: str) -> dict[str, Any]:
    """A click on one of the card's buttons (Raid: Edit's or the draft's), by the organiser."""
    return click(f"raid:v1:ed:{event.id}:{action}", user_id=ORGANISER, permissions=ORGANISER_PERMS)


def _form(event: WowRaidEvent, name: str, value: str) -> dict[str, Any]:
    """A submit of one of the card's forms."""
    return modal_submit(f"raid:v1:m:{event.id}:{name}", {"value": value})


def _box(response: dict[str, Any]) -> dict[str, Any]:
    """The Deadline form's text box."""
    assert response["type"] == 9
    return response["data"]["components"][0]["component"]


def _unix(when: datetime) -> int:
    return int(when.timestamp())


def _closes(event: WowRaidEvent, minutes: int) -> int:
    return _unix(event.starts_at - timedelta(minutes=minutes))


def _post_embed(fake_discord: FakeDiscord) -> dict[str, Any]:
    """The raid post as the one re-render since the last clear left it."""
    (edit,) = fake_discord.public_edits()
    assert edit.path == _POST and edit.body is not None
    return edit.body["embeds"][0]


def _card_lines(response: dict[str, Any]) -> list[str]:
    [embed] = response["data"]["embeds"]
    return embed["description"].split("\n")


async def _starts_in(db: AsyncSession, event: WowRaidEvent, delta: timedelta) -> None:
    """Put the raid's start *delta* from now, straight into the row: the clock moving on, in effect."""
    event.starts_at = datetime.now(timezone.utc).replace(second=0, microsecond=0) + delta
    await db.flush()


def _raid_line(event: WowRaidEvent) -> str:
    return f"**Onyxia's Lair** · <t:{_unix(event.starts_at)}:F>"



# ---------------------------------------------------------------------------
# Raid: Edit → [Deadline]
# ---------------------------------------------------------------------------


async def test_the_deadline_form_sets_shows_and_clears_a_deadline(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)

    # --- the form opens empty: no deadline yet
    assert "value" not in _box(await post(_edit(event, "deadline")))

    # --- 2h: the card says when sign-ups close, and the post counts down to it
    response = await post(_form(event, "deadline", "2h"))
    assert response["type"] == 7
    closes = _closes(event, 120)
    assert content(response) == f"Sign-ups close 2 hours before the start (<t:{closes}:R>)."
    assert "**Deadline:** 2 hours before the start" in _card_lines(response)
    await db.refresh(event)
    assert event.signup_deadline_minutes == 120 and event.closed_at is None
    assert f"Sign-ups close <t:{closes}:R>" in _post_embed(fake_discord)["description"]

    # --- the form starts from it; the same deadline, or one that doesn't read, changes nothing
    assert _box(await post(_edit(event, "deadline")))["value"] == "2h"
    fake_discord.clear()
    for text, notice in (("2", NOTHING_CHANGED), ("soon", raid_deadline_copy.FORMAT), ("8d", raid_deadline_copy.TOO_LONG)):
        assert content(await post(_form(event, "deadline", text))) == notice
    assert fake_discord.calls == []
    await db.refresh(event)
    assert event.signup_deadline_minutes == 120

    # --- empty: no deadline, so sign-ups stay open until the start
    response = await post(_form(event, "deadline", ""))
    assert content(response) == raid_deadline_copy.CLEARED
    await db.refresh(event)
    assert event.signup_deadline_minutes is None
    assert "Sign-ups close" not in _post_embed(fake_discord)["description"]


async def test_a_deadline_already_passed_closes_sign_ups_and_a_later_one_reopens_them(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    await _starts_in(db, event, timedelta(hours=1))

    response = await post(_form(event, "deadline", "2h"))
    assert content(response) == raid_deadline_copy.CLOSED_NOW
    await db.refresh(event)
    assert event.close_reason == "deadline"
    assert event.closed_at is not None and event.closed_at == event.deadline_applied_at
    assert _post_embed(fake_discord)["color"] == COLOR_CLOSED
    assert fake_discord.dms_to(ORGANISER) == []  # the leader did this: no DM

    fake_discord.clear()
    response = await post(_form(event, "deadline", "30m"))
    assert content(response) == (
        "Sign-ups are **open** again until the deadline, "
        f"30 minutes before the start (<t:{_closes(event, 30)}:R>)."
    )
    await db.refresh(event)
    assert (event.closed_at, event.close_reason, event.deadline_applied_at) == (None, None, None)
    assert _post_embed(fake_discord)["color"] == COLOR_OPEN


async def test_sign_ups_close_at_the_deadline_before_any_sweep_and_raid_open_holds_after_it(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    await post(_form(event, "deadline", "2h"))
    await _starts_in(db, event, timedelta(hours=1))  # the deadline passed an hour ago; no sweep has run
    mage = click(f"raid:v1:cls:{event.id}:mage", user_id="302")

    # --- the post's buttons refuse by the clock
    assert content(await post(mage)) == raid_copy.CLOSED

    # --- Raid: Open lets people in until the start: the passed deadline won't close them again
    response = await post(menu_command(OPEN_MENU, "m1"))
    assert content(response) == f"{_raid_line(event)}\n{raid_deadline_copy.OPENED_PAST}"
    await db.refresh(event)
    assert event.closed_at is None and event.deadline_applied_at is not None
    assert content(await post(mage)) == raid_copy.spec_prompt("Mage")

    # --- Raid: Close is the leader's close; Raid: Open again says the same
    assert content(await post(menu_command(CLOSE_MENU, "m1"))).endswith(raid_copy.CLOSED_OK)
    await db.refresh(event)
    assert event.close_reason == "leader"
    assert content(await post(menu_command(OPEN_MENU, "m1"))).endswith(raid_deadline_copy.OPENED_PAST)


async def test_a_move_across_the_deadline_closes_or_reopens_sign_ups(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    await post(_form(event, "deadline", "2h"))

    # --- 90 minutes from now: the deadline has passed at the new time
    soon = (datetime.now(timezone.utc) + timedelta(minutes=90)).astimezone(NY).replace(second=0, microsecond=0)
    fake_discord.clear()
    response = await post(_form(event, "when", soon.strftime("%m/%d/%Y %I:%M%p").lower()))
    assert content(response) == f"{raid_copy.moved(_unix(soon))} {raid_deadline_copy.MOVED_CLOSED}"
    await db.refresh(event)
    assert event.close_reason == "deadline"
    assert _post_embed(fake_discord)["color"] == COLOR_CLOSED

    # --- an evening twelve days out: the deadline is ahead again
    later = future_when(days=12)
    fake_discord.clear()
    response = await post(_form(event, "when", later))
    stamp = _unix(datetime.strptime(later, "%Y-%m-%d %H:%M").replace(tzinfo=NY))
    assert content(response) == f"{raid_copy.moved(stamp)} {raid_deadline_copy.MOVED_REOPENED}"
    await db.refresh(event)
    assert event.closed_at is None
    assert _post_embed(fake_discord)["color"] == COLOR_OPEN


async def test_a_started_raids_deadline_cant_change(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    event = await _raid(post, db, fake_discord)
    await _starts_in(db, event, timedelta(minutes=-1))

    response = await post(_form(event, "deadline", "2h"))
    assert content(response) == raid_copy.RAID_STARTED
    await db.refresh(event)
    assert event.signup_deadline_minutes is None
    assert fake_discord.calls == []


# ---------------------------------------------------------------------------
# More options → [Deadline], and [Post raid]
# ---------------------------------------------------------------------------


async def test_more_options_sets_a_drafts_deadline_and_post_raid_refuses_once_it_has_passed(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    await setup_guild(post)
    await post(command("raid-admin", "create", raid="onyxia", when=future_when(), size=5))
    event = (await db.execute(select(WowRaidEvent))).scalars().one()
    fake_discord.clear()
    where = preview_state(CHANNEL, [ROLE])

    await post(_edit(event, "more"))
    assert "value" not in _box(await post(_edit(event, "deadline")))
    response = await post(_form(event, "deadline", "1d 6h"))
    closes = _closes(event, 1800)
    assert content(response) == f"Sign-ups close 1 day 6 hours before the start (<t:{closes}:R>).\n{where}"
    assert f"Sign-ups close <t:{closes}:R>" in response["data"]["embeds"][0]["description"]
    assert fake_discord.calls == []  # a draft has no post to re-render

    # --- passed at the draft's time: the card says so, and [Post raid] refuses
    await _starts_in(db, event, timedelta(hours=1))
    response = await post(_form(event, "deadline", "2h"))
    assert content(response) == (
        "Sign-ups close 2 hours before the start, which has already passed. "
        f"Change the Date & Time or the deadline before you post.\n{where}"
    )
    response = await post(click(f"raid:v1:confirm:{event.id}", user_id=ORGANISER, permissions=ORGANISER_PERMS))
    assert content(response) == f"{raid_deadline_copy.POST_PASSED}\n{where}"
    await db.refresh(event)
    assert event.status == "draft"
    assert fake_discord.channel_posts() == []
