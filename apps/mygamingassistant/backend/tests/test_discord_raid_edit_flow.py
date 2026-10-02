"""End-to-end flows for Raid: Edit — the raid post's right-click edit card.

The menu command, the card's buttons, its Leader / Color menus, its forms'
submits, [Tell them in channel] and [Delete raid], through POST
/discord/interactions with the harness in ``discord_raid_harness.py``.
Sign-ups are written straight to the repository: the sign-up buttons have
their own flows.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

import pytest
from platform_shared.services.discord import MANAGE_EVENTS
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_notification import WowRaidNotification
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.repositories.wow import wow_raid_event_repo, wow_raid_signup_repo
from app.services.discord import raid_copy, raid_publisher
from app.services.discord.commands_spec import CLOSE_MENU, EDIT_MENU
from app.services.discord.raid_edit_views import when_prefill
from app.services.wow import raid_event_service
from app.services.wow.raid_embed import COLOR_CLOSED, COLOR_OPEN
from app.services.wow.raid_time_parser import UNREADABLE_MESSAGE

from discord_raid_harness import (
    CHANNEL,
    NY,
    ORGANISER,
    ORGANISER_PERMS,
    FakeDiscord,
    Post,
    assert_ephemeral,
    click,
    content,
    create_and_post,
    custom_ids,
    future_when,
    menu_command,
    modal_submit,
    pick_user,
    setup_guild,
)

pytestmark = pytest.mark.asyncio

_POST = f"/channels/{CHANNEL}/messages/m1"
_IMAGE = "https://i.imgur.com/raid.png"
_MEMBER = {"user_id": "401", "permissions": 0}


async def _raid(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> WowRaidEvent:
    """A posted raid — its post is m1 — with the Discord calls so far forgotten."""
    await setup_guild(post)
    event = await create_and_post(post, db)
    assert event.message_id == "m1"
    fake_discord.clear()
    return event


async def _sign_up(db: AsyncSession, event: WowRaidEvent, user_id: str, status: str = "confirmed") -> None:
    await wow_raid_signup_repo.upsert_signup(
        db,
        event_id=event.id,
        discord_user_id=user_id,
        display_name=f"Player{user_id}",
        status=status,
        wow_class="mage",
        role="dps",
        spec="frost",
    )


def _unix(when: datetime) -> int:
    return int(when.timestamp())


def _edit(event: WowRaidEvent, action: str, **as_who: Any) -> dict[str, Any]:
    """A click on one of the edit card's buttons — by the organiser unless *as_who* says otherwise."""
    as_who = {"user_id": ORGANISER, "permissions": ORGANISER_PERMS, **as_who}
    return click(f"raid:v1:ed:{event.id}:{action}", **as_who)


def _form(event: WowRaidEvent, name: str, value: str, **as_who: Any) -> dict[str, Any]:
    """A submit of one of the edit card's forms."""
    return modal_submit(f"raid:v1:m:{event.id}:{name}", {"value": value}, **as_who)


def _notify(event: WowRaidEvent) -> dict[str, Any]:
    """[Tell them in channel] on the card, clicked by the organiser (shown as Thrall)."""
    return click(
        f"raid:v1:lc:{event.id}:notify", user_id=ORGANISER, permissions=ORGANISER_PERMS, display="Thrall"
    )


def _pick_color(event: WowRaidEvent, key: str) -> dict[str, Any]:
    return click(f"raid:v1:pick:{event.id}:color", user_id=ORGANISER, permissions=ORGANISER_PERMS, values=[key])


def _pick_leader(event: WowRaidEvent, picked_id: str, name: str, **as_who: Any) -> dict[str, Any]:
    return pick_user(f"raid:v1:pick:{event.id}:leader", picked_id, picked_name=name, **as_who)


def _card_lines(response: dict[str, Any]) -> list[str]:
    [embed] = response["data"]["embeds"]
    assert embed["title"] == "Edit raid"
    return embed["description"].split("\n")


def _post_embed(fake_discord: FakeDiscord) -> dict[str, Any]:
    """The raid post as the one re-render since the last clear left it."""
    (edit,) = fake_discord.public_edits()
    assert edit.path == _POST and edit.body is not None
    return edit.body["embeds"][0]


def _card_ids(event: WowRaidEvent) -> list[str]:
    actions = ("title", "leader", "when", "deadline", "desc", "image", "color", "role_limits", "class_limits")
    ids = [f"raid:v1:ed:{event.id}:{action}" for action in (*actions, "cancel", "delete", "done")]
    at = len(actions)
    ids[at:at] = [f"raid:v1:ml:{event.id}:open:-:-", f"raid:v1:ed:{event.id}:notes_on", f"raid:v1:cp:{event.id}"]
    ids.insert(4, f"raid:v1:rp:{event.id}:open")
    return ids  # [Repeat] ends the first row; [Sign-ups] [Notes: off], then [Copy raid] starts the last row


# ---------------------------------------------------------------------------
# The menu command
# ---------------------------------------------------------------------------


async def test_raid_edit_opens_the_card_for_its_leader_only(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)

    response = await post(menu_command(EDIT_MENU, "m1"))
    assert_ephemeral(response)
    assert content(response) == raid_copy.EDIT_PROMPT
    assert _card_lines(response)[0] == "**Title:** Onyxia's Lair"
    assert custom_ids(response) == _card_ids(event)

    # --- someone else: turned away, everywhere the card leads
    response = await post(menu_command(EDIT_MENU, "m1", **_MEMBER))
    assert_ephemeral(response)
    assert content(response) == raid_copy.NOT_LEADER
    for action in ("title", "leader", "when", "deadline", "desc", "image", "color", "cancel", "delete", "back", "keep"):
        response = await post(_edit(event, action, **_MEMBER))
        assert response["type"] == 7
        assert content(response) == raid_copy.NOT_LEADER
        assert custom_ids(response) == []
    for name in ("title", "when", "deadline", "desc", "image", "cancel"):
        response = await post(_form(event, name, "x", **_MEMBER))
        assert content(response) == raid_copy.NOT_LEADER
    for request in (
        click(f"raid:v1:pick:{event.id}:color", values=["red"], **_MEMBER),
        _pick_leader(event, "401", "Sneaky", **_MEMBER),
        click(f"raid:v1:del:{event.id}", **_MEMBER),
        click(f"raid:v1:lc:{event.id}:notify", **_MEMBER),
    ):
        response = await post(request)
        assert content(response) == raid_copy.NOT_LEADER
    await db.refresh(event)
    assert (event.title, event.color, event.leader_user_id, event.cancel_reason) == (None, None, None, None)
    assert fake_discord.calls == []

    # --- Manage Events is enough without having created it
    response = await post(menu_command(EDIT_MENU, "m1", user_id="402", permissions=MANAGE_EVENTS))
    assert content(response) == raid_copy.EDIT_PROMPT

    # --- not a raid post
    response = await post(menu_command(EDIT_MENU, "m999"))
    assert content(response) == raid_copy.NOT_A_RAID


async def test_done_closes_the_card(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    event = await _raid(post, db, fake_discord)
    response = await post(_edit(event, "done"))
    assert response["type"] == 7
    assert content(response) == raid_copy.EDIT_SAVED
    assert response["data"]["components"] == [] and response["data"]["embeds"] == []


# ---------------------------------------------------------------------------
# Title, Description, Image
# ---------------------------------------------------------------------------


async def test_the_title_form_renames_the_raid(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    event = await _raid(post, db, fake_discord)

    response = await post(_edit(event, "title"))
    assert response["type"] == 9
    assert response["data"]["custom_id"] == f"raid:v1:m:{event.id}:title"

    # --- saved: the card again saying so, and the post re-rendered
    response = await post(_form(event, "title", "  Ony   *speedrun*  "))
    assert response["type"] == 7
    assert content(response) == raid_copy.TITLE_OK
    assert _card_lines(response)[0] == r"**Title:** Ony \*speedrun\*"
    assert custom_ids(response) == _card_ids(event)
    await db.refresh(event)
    assert event.title == "Ony *speedrun*"
    assert _post_embed(fake_discord)["author"]["name"] == "Ony *speedrun* · Leader: Thrall"

    # --- blank: nothing changes
    fake_discord.clear()
    response = await post(_form(event, "title", "   "))
    assert content(response) == raid_copy.TITLE_EMPTY
    await db.refresh(event)
    assert event.title == "Ony *speedrun*"
    assert fake_discord.calls == []

    # --- the raid's own name: back to no title
    response = await post(_form(event, "title", "Onyxia's Lair"))
    assert content(response) == raid_copy.TITLE_OK
    await db.refresh(event)
    assert event.title is None


async def test_the_description_and_banner_forms(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    event = await _raid(post, db, fake_discord)

    response = await post(_edit(event, "desc"))
    assert response["type"] == 9
    assert response["data"]["components"][0]["component"]["value"] == "Bring FR"  # what's there now

    response = await post(_form(event, "desc", "Bring FR\nFlasks on pull\n"))
    assert content(response) == raid_copy.DESC_OK
    assert _card_lines(response)[-2:] == ["> Bring FR", "> Flasks on pull"]
    await db.refresh(event)
    assert event.notes == "Bring FR\nFlasks on pull"
    assert "Bring FR\nFlasks on pull" in _post_embed(fake_discord)["description"]

    response = await post(_form(event, "desc", "  "))
    assert content(response) == raid_copy.DESC_CLEARED
    await db.refresh(event)
    assert event.notes is None

    # --- a link Discord might refuse: turned away, nothing re-rendered
    fake_discord.clear()
    response = await post(_form(event, "image", "http://i.imgur.com/raid.png"))
    assert content(response) == raid_copy.BANNER_BAD
    assert fake_discord.calls == []

    response = await post(_form(event, "image", f" {_IMAGE} "))
    assert content(response) == raid_copy.BANNER_OK
    assert _card_lines(response)[3] == f"**Image:** [Your image]({_IMAGE})"
    await db.refresh(event)
    assert event.image_url == _IMAGE
    assert _post_embed(fake_discord)["image"] == {"url": _IMAGE}

    response = await post(_form(event, "image", ""))
    assert content(response) == raid_copy.BANNER_RESET
    await db.refresh(event)
    assert event.image_url is None


# ---------------------------------------------------------------------------
# Date & Time → [Tell them in channel]
# ---------------------------------------------------------------------------


async def test_moving_the_raid_reschedules_it_and_offers_to_tell_everyone(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    await _sign_up(db, event, "501")
    await _sign_up(db, event, "502", "tentative")
    await _sign_up(db, event, "503", "absence")
    original_due = sorted(
        n.due_at
        for n in (
            await db.execute(select(WowRaidNotification).where(WowRaidNotification.event_id == event.id))
        ).scalars()
    )

    # --- the form starts from the raid's time, in the server's timezone
    response = await post(_edit(event, "when"))
    assert response["type"] == 9
    prefill = response["data"]["components"][0]["component"]["value"]
    assert prefill == when_prefill(event.starts_at, "America/New_York")

    # --- unreadable, or the same time: the card says so and nothing moves
    response = await post(_form(event, "when", "whenever"))
    assert content(response) == UNREADABLE_MESSAGE
    response = await post(_form(event, "when", prefill))
    assert content(response) == raid_copy.WHEN_SAME
    assert fake_discord.calls == []

    # --- moved: rescheduled, re-rendered, and an offer to tell the two on it (not the absence)
    new_when = future_when(days=12)
    new_start = datetime.strptime(new_when, "%Y-%m-%d %H:%M").replace(tzinfo=NY)
    response = await post(_form(event, "when", new_when))
    assert response["type"] == 7
    stamp = _unix(new_start)
    assert content(response) == f"{raid_copy.moved(stamp)}\n{raid_copy.notify_offer(2)}"
    assert custom_ids(response) == [f"raid:v1:lc:{event.id}:notify", *_card_ids(event)]
    await db.refresh(event)
    assert event.starts_at == new_start
    rescheduled = (
        await db.execute(select(WowRaidNotification).where(WowRaidNotification.event_id == event.id))
    ).scalars().all()
    assert rescheduled
    assert sorted(n.due_at for n in rescheduled) != original_due
    assert all(n.due_at <= event.starts_at for n in rescheduled)
    assert f"<t:{stamp}:D>" in _post_embed(fake_discord)["description"]

    # --- [Tell them in channel]: a reply to the post pinging them, with the new time
    fake_discord.clear()
    response = await post(_notify(event))
    assert response["type"] == 7
    assert content(response) == raid_copy.pinging(2)
    (ping,) = fake_discord.channel_posts()
    words = raid_copy.notify_post("Onyxia's Lair", stamp)
    signature = f"-# Onyxia's Lair · <t:{stamp}:F> · sent by Thrall"
    assert ping.body == {
        "content": f"{words}\n<@501> <@502>\n{signature}",
        "allowed_mentions": {"parse": [], "users": ["501", "502"], "replied_user": False},
        "message_reference": {"message_id": "m1", "fail_if_not_exists": False},
    }
    (outcome,) = fake_discord.original_edits()
    assert outcome.body is not None
    assert outcome.body["content"] == raid_copy.ping_sent(2)
    await db.refresh(event)
    assert event.last_pinged_at is not None

    # --- it shares the ping's slot: straight away again, the card says to wait and keeps the offer
    fake_discord.clear()
    response = await post(_notify(event))
    assert content(response) == f"{raid_copy.PING_WAIT}\n{raid_copy.notify_offer(2)}"
    assert custom_ids(response) == [f"raid:v1:lc:{event.id}:notify", *_card_ids(event)]
    assert _card_lines(response)[0] == "**Title:** Onyxia's Lair"
    assert fake_discord.channel_posts() == []


async def test_a_raid_moved_with_nobody_on_it_offers_nothing(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    await _sign_up(db, event, "511", "absence")
    response = await post(_form(event, "when", future_when(days=11)))
    assert custom_ids(response) == _card_ids(event)
    assert "\n" not in content(response)


# ---------------------------------------------------------------------------
# Leader and Color menus
# ---------------------------------------------------------------------------


async def test_handing_the_raid_to_another_leader(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    event = await _raid(post, db, fake_discord)

    response = await post(_edit(event, "leader"))
    assert response["type"] == 7
    [menu] = response["data"]["components"][0]["components"]
    assert (menu["type"], menu["custom_id"]) == (5, f"raid:v1:pick:{event.id}:leader")
    assert response["data"]["embeds"] == []

    # --- a bot: the menu again, saying why
    response = await post(_pick_leader(event, "999", "Robo", bot=True))
    assert content(response).split("\n")[-1] == raid_copy.LEADER_BOT
    await db.refresh(event)
    assert event.leader_user_id is None
    assert fake_discord.calls == []

    # --- a member: they lead now, and the post names them
    response = await post(_pick_leader(event, "777", "Jaina"))
    assert content(response) == raid_copy.leader_ok("Jaina")
    assert _card_lines(response)[1] == "**Leader:** Jaina"
    await db.refresh(event)
    assert (event.leader_user_id, event.leader_display_name) == ("777", "Jaina")
    assert _post_embed(fake_discord)["author"]["name"] == "Onyxia's Lair · Leader: Jaina"

    # --- the new leader gets the raid's tools without Manage Events; its creator no longer does
    jaina = {"user_id": "777", "permissions": 0}
    response = await post(menu_command(EDIT_MENU, "m1", **jaina))
    assert content(response) == raid_copy.EDIT_PROMPT
    response = await post(menu_command(EDIT_MENU, "m1", user_id=ORGANISER, permissions=0))
    assert content(response) == raid_copy.NOT_LEADER

    # --- handing it on again: a closing note, since the card is no longer theirs to use
    fake_discord.clear()
    response = await post(_pick_leader(event, "778", "Sylvanas", **jaina))
    assert response["type"] == 7
    assert content(response) == raid_copy.handed_over("Sylvanas")
    assert response["data"]["components"] == [] and response["data"]["embeds"] == []
    await db.refresh(event)
    assert event.leader_user_id == "778"
    assert len(fake_discord.public_edits()) == 1
    response = await post(menu_command(CLOSE_MENU, "m1", user_id="778", permissions=0))
    assert content(response).endswith(raid_copy.CLOSED_OK)
    response = await post(menu_command(EDIT_MENU, "m1", **jaina))
    assert content(response) == raid_copy.NOT_LEADER


async def test_a_handed_over_leader_without_manage_events_can_do_it_all(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    event_id = event.id
    await post(_pick_leader(event, "777", "Jaina"))
    jaina = {"user_id": "777", "permissions": 0}

    response = await post(_form(event, "title", "Jaina's Ony", **jaina))
    assert content(response) == raid_copy.TITLE_OK
    await db.refresh(event)
    assert event.title == "Jaina's Ony"

    # --- the cancel check's buttons answer to her too
    response = await post(_form(event, "cancel", "Wipe night", **jaina))
    assert custom_ids(response) == [f"raid:v1:cancel:{event_id}", f"raid:v1:ed:{event_id}:keep"]
    response = await post(_edit(event, "keep", **jaina))
    assert content(response) == raid_copy.CANCEL_KEPT
    await post(_form(event, "cancel", "Wipe night", **jaina))
    response = await post(click(f"raid:v1:cancel:{event_id}", **jaina))
    assert content(response) == raid_copy.cancelled_done(CHANNEL)
    await db.refresh(event)
    assert (event.status, event.cancel_reason) == ("cancelled", "Wipe night")

    response = await post(_edit(event, "delete", **jaina))
    assert content(response) == raid_copy.delete_prompt("Jaina's Ony", 0, can_cancel=False)
    response = await post(click(f"raid:v1:del:{event_id}", **jaina))
    assert content(response) == raid_copy.DELETING
    assert (await db.execute(select(WowRaidEvent).where(WowRaidEvent.id == event_id))).scalars().all() == []


async def test_the_color_menu_recolors_the_post(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    event = await _raid(post, db, fake_discord)

    response = await post(_edit(event, "color"))
    assert response["type"] == 7
    [menu] = response["data"]["components"][0]["components"]
    assert (menu["type"], menu["custom_id"]) == (3, f"raid:v1:pick:{event.id}:color")

    response = await post(_pick_color(event, "blue"))
    assert content(response) == raid_copy.COLOR_OK
    await db.refresh(event)
    assert event.color == 0x3498DB
    assert _post_embed(fake_discord)["color"] == 0x3498DB

    # --- back to purple, stored as the default
    fake_discord.clear()
    await post(_pick_color(event, "purple"))
    await db.refresh(event)
    assert event.color is None
    assert _post_embed(fake_discord)["color"] == COLOR_OPEN

    # --- an option that isn't on the list: the menu again
    fake_discord.clear()
    response = await post(_pick_color(event, "teal"))
    assert response["data"]["components"][0]["components"][0]["custom_id"] == f"raid:v1:pick:{event.id}:color"
    assert fake_discord.calls == []

    # --- sign-ups closed: saved, but the post stays grey until they reopen
    await post(menu_command(CLOSE_MENU, "m1"))
    fake_discord.clear()
    response = await post(_pick_color(event, "red"))
    assert content(response) == raid_copy.COLOR_OK_CLOSED
    await db.refresh(event)
    assert event.color == 0xE74C3C
    assert _post_embed(fake_discord)["color"] == COLOR_CLOSED


async def test_an_empty_menu_pick_changes_nothing(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    event = await _raid(post, db, fake_discord)
    empty = click(f"raid:v1:pick:{event.id}:color", user_id=ORGANISER, permissions=ORGANISER_PERMS, values=[])
    response = await post(empty)
    assert content(response) == raid_copy.GENERIC_ERROR
    assert fake_discord.calls == []


# ---------------------------------------------------------------------------
# Cancel raid
# ---------------------------------------------------------------------------


async def test_cancelling_from_the_card_asks_first_and_keep_comes_back(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    starts = _unix(event.starts_at)

    response = await post(_edit(event, "cancel"))
    assert response["type"] == 9
    assert response["data"]["custom_id"] == f"raid:v1:m:{event.id}:cancel"

    # --- the reason is staged and the usual check shown, in place of the card
    response = await post(_form(event, "cancel", "  Not enough\nhealers "))
    assert response["type"] == 7
    prompt = raid_copy.cancel_prompt("Onyxia's Lair", starts)
    assert content(response) == f"{prompt}\nReason: Not enough healers"
    assert custom_ids(response) == [f"raid:v1:cancel:{event.id}", f"raid:v1:ed:{event.id}:keep"]
    assert response["data"]["embeds"] == []
    await db.refresh(event)
    assert event.cancel_reason == "Not enough healers"

    # --- [Keep raid]: back to the card, the reason dropped
    response = await post(_edit(event, "keep"))
    assert content(response) == raid_copy.CANCEL_KEPT
    assert custom_ids(response) == _card_ids(event)
    await db.refresh(event)
    assert (event.status, event.cancel_reason) == ("scheduled", None)
    assert fake_discord.calls == []

    # --- [Cancel raid]: cancelled as from /raid-admin cancel, the reason on the post
    await post(_form(event, "cancel", "Server down"))
    response = await post(click(f"raid:v1:cancel:{event.id}", user_id=ORGANISER, permissions=ORGANISER_PERMS))
    assert content(response) == raid_copy.cancelled_done(CHANNEL)
    await db.refresh(event)
    assert (event.status, event.cancel_reason) == ("cancelled", "Server down")
    (announcement,) = fake_discord.channel_posts()
    assert announcement.body is not None and "Server down" in announcement.body["content"]

    # --- a cancelled raid can only be repeated, copied or deleted; an old card or form left open changes nothing
    response = await post(menu_command(EDIT_MENU, "m1"))
    assert content(response) == raid_copy.EDIT_GONE_PROMPT
    over = (f"rp:{event.id}:open", f"cp:{event.id}", f"ed:{event.id}:delete", f"ed:{event.id}:done")
    assert custom_ids(response) == [f"raid:v1:{action}" for action in over]
    response = await post(_edit(event, "title"))
    assert response["type"] == 7
    assert content(response) == raid_copy.EDIT_GONE_PROMPT
    response = await post(_form(event, "title", "Back on"))
    assert content(response) == raid_copy.NOT_FOUND
    await db.refresh(event)
    assert event.title is None


# ---------------------------------------------------------------------------
# Delete raid
# ---------------------------------------------------------------------------


async def test_deleting_removes_the_raid_its_sign_ups_and_its_post(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    event_id = event.id
    await _sign_up(db, event, "601")
    await _sign_up(db, event, "602", "tentative")

    response = await post(_edit(event, "delete"))
    assert response["type"] == 7
    assert content(response) == raid_copy.delete_prompt("Onyxia's Lair", 2, can_cancel=True)
    assert custom_ids(response) == [f"raid:v1:del:{event_id}", f"raid:v1:ed:{event_id}:back"]

    # --- [Keep it]: back to the card, nothing gone
    response = await post(_edit(event, "back"))
    assert content(response) == raid_copy.EDIT_PROMPT
    assert custom_ids(response) == _card_ids(event)

    response = await post(click(f"raid:v1:del:{event_id}", user_id=ORGANISER, permissions=ORGANISER_PERMS))
    assert response["type"] == 7
    assert content(response) == raid_copy.DELETING
    assert response["data"]["components"] == [] and response["data"]["embeds"] == []
    assert (await db.execute(select(WowRaidEvent).where(WowRaidEvent.id == event_id))).scalars().all() == []
    assert (await db.execute(select(WowRaidSignup).where(WowRaidSignup.event_id == event_id))).scalars().all() == []
    pending = select(WowRaidNotification).where(WowRaidNotification.event_id == event_id)
    assert (await db.execute(pending)).scalars().all() == []
    assert len(fake_discord.find("DELETE", _POST)) == 1
    (outcome,) = fake_discord.original_edits()
    assert outcome.body is not None and outcome.body["content"] == raid_copy.DELETED
    assert fake_discord.channel_posts() == [] and fake_discord.dms_to("601") == []  # nobody is told

    # --- gone: an old card, and the post's menu, say so
    response = await post(click(f"raid:v1:del:{event_id}", user_id=ORGANISER, permissions=ORGANISER_PERMS))
    assert content(response) == raid_copy.NOT_FOUND
    response = await post(menu_command(EDIT_MENU, "m1"))
    assert content(response) == raid_copy.NOT_A_RAID


@pytest.mark.parametrize(
    ("answer", "outcome"),
    [
        ((403, 50013), raid_copy.DELETE_POST_LEFT),  # Discord refused
        ((404, 10008), raid_copy.DELETED),  # someone already deleted the post
        (None, raid_copy.DELETE_POST_LEFT),  # Discord never answered
    ],
)
async def test_the_card_says_whether_the_post_went(
    answer: tuple[int, int] | None, outcome: str, post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    event_id = event.id
    if answer is None:
        fake_discord.time_out("DELETE", _POST)
    else:
        fake_discord.fail("DELETE", _POST, *answer)

    response = await post(click(f"raid:v1:del:{event_id}", user_id=ORGANISER, permissions=ORGANISER_PERMS))
    assert content(response) == raid_copy.DELETING
    (edit,) = fake_discord.original_edits()
    assert edit.body is not None and edit.body["content"] == outcome
    assert (await db.execute(select(WowRaidEvent).where(WowRaidEvent.id == event_id))).scalars().all() == []


async def test_a_finished_raid_can_still_be_deleted(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    event = await _raid(post, db, fake_discord)
    event.status = "completed"
    await db.flush()

    response = await post(menu_command(EDIT_MENU, "m1"))
    assert content(response) == raid_copy.EDIT_GONE_PROMPT
    response = await post(_edit(event, "delete"))
    assert content(response) == raid_copy.delete_prompt("Onyxia's Lair", 0, can_cancel=False)
    response = await post(click(f"raid:v1:del:{event.id}", user_id=ORGANISER, permissions=ORGANISER_PERMS))
    assert content(response) == raid_copy.DELETING
    assert len(fake_discord.find("DELETE", _POST)) == 1


async def test_a_refresh_that_finds_the_raid_deleted_never_posts_it_again(
    post: Post,
    db: AsyncSession,
    fake_discord: FakeDiscord,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    event = await _raid(post, db, fake_discord)
    # A re-render read the raid just before it was deleted; its post is gone by the edit.
    snapshot = await raid_publisher._load(db, event.id)
    await raid_event_service.delete_event(db, event)

    async def stale_load(*_: Any, **__: Any) -> Any:
        return snapshot

    monkeypatch.setattr(raid_publisher, "_load", stale_load)
    fake_discord.fail("PATCH", _POST, 404, 10008)

    with caplog.at_level(logging.INFO, logger=raid_publisher.__name__):
        await raid_publisher.refresh_public_message(event.id)

    assert len(fake_discord.public_edits()) == 1
    assert fake_discord.channel_posts() == []
    assert "refresh_public_message failed" not in caplog.text
    assert "reposting" not in caplog.text


async def test_a_refused_edit_names_the_raid_and_leaves_the_post(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord, caplog: pytest.LogCaptureFixture
) -> None:
    event = await _raid(post, db, fake_discord)
    fake_discord.fail("PATCH", _POST, 400, 50035)  # e.g. an embed field Discord won't take

    with caplog.at_level(logging.WARNING, logger=raid_publisher.__name__):
        await raid_publisher.refresh_public_message(event.id)

    assert f"refused the edit of raid {event.id}'s post (status 400, code 50035)" in caplog.text
    assert fake_discord.channel_posts() == []  # not reposted
    await db.refresh(event)
    assert event.message_id == "m1"


async def test_a_repost_that_lands_after_the_raid_was_deleted_is_taken_down(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord, monkeypatch: pytest.MonkeyPatch
) -> None:
    event = await _raid(post, db, fake_discord)
    event_id = event.id
    fake_discord.fail("PATCH", _POST, 404, 10008)  # someone deleted the post by hand
    real_get_for_update = wow_raid_event_repo.get_for_update

    async def deleted_once_reposted(session: AsyncSession, wanted: Any) -> WowRaidEvent | None:
        # The leader's [Delete raid] lands while the repost is on its way.
        found = await real_get_for_update(session, wanted)
        if found is not None and fake_discord.channel_posts():
            await raid_event_service.delete_event(session, found)
            return None
        return found

    monkeypatch.setattr(wow_raid_event_repo, "get_for_update", deleted_once_reposted)

    await raid_publisher.refresh_public_message(event_id)

    assert len(fake_discord.channel_posts()) == 1  # the repost, m2
    assert len(fake_discord.find("DELETE", f"/channels/{CHANNEL}/messages/m2")) == 1
    assert (await db.execute(select(WowRaidEvent).where(WowRaidEvent.id == event_id))).scalars().all() == []
