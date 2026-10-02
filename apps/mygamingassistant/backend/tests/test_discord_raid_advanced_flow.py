"""End-to-end flows for Raid: Edit → Advanced and /raid-admin advanced.

The card from Raid: Edit and More options, its Minimum form, its who card's
role menus and buttons, its Ready check menu, the server's card — and Who can
sign up keeping members off the post's buttons — through POST
/discord/interactions with the harness in ``discord_raid_harness.py``.
Sign-ups and raids the tests start from are written straight to the
repositories.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from platform_shared.services.discord import MANAGE_EVENTS
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.models.wow.wow_raid_notification import WowRaidNotification
from app.repositories.wow import (
    wow_raid_advanced_repo,
    wow_raid_event_repo,
    wow_raid_guild_repo,
    wow_raid_signup_repo,
)
from app.services.discord import raid_advanced_copy, raid_copy
from app.services.wow import raid_event_service

from discord_raid_harness import (
    CHANNEL,
    GUILD,
    ORGANISER,
    ORGANISER_PERMS,
    FakeDiscord,
    Post,
    assert_ephemeral,
    click,
    command,
    content,
    create_and_post,
    future_when,
    modal_submit,
    pick_roles,
    setup_guild,
)

pytestmark = pytest.mark.asyncio

_ORGANISER = {"user_id": ORGANISER, "permissions": ORGANISER_PERMS}
_OPEN_TO_601 = f"This raid is open to <@&601> only. Ask <@{ORGANISER}> if you should be on it."
_BANNED = f"You can't sign up for this raid. Ask <@{ORGANISER}> if that's a mistake."


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _raid(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> WowRaidEvent:
    """A posted five-player raid — its post is m1 — with the Discord calls so far forgotten."""
    await setup_guild(post)
    event = await create_and_post(post, db)
    fake_discord.clear()
    return event


def _adv(event: WowRaidEvent, verb: str, arg: str = "-", **as_who: Any) -> dict[str, Any]:
    """A button on the Advanced cards — by the organiser unless *as_who* says otherwise."""
    return click(f"raid:v1:adv:{event.id}:{verb}:{arg}", **{**_ORGANISER, **as_who})


def _menu(event: WowRaidEvent, verb: str, value: str) -> dict[str, Any]:
    """A pick in one of the raid's Advanced menus (``pick``, ``ready``)."""
    return click(f"raid:v1:adv:{event.id}:{verb}:-", values=[value], **_ORGANISER)


def _server_menu(verb: str, value: str, **as_who: Any) -> dict[str, Any]:
    return click(f"raid:v1:sadv:{verb}:-", values=[value], **{**_ORGANISER, **as_who})


def _minimum(event: WowRaidEvent, value: str) -> dict[str, Any]:
    return modal_submit(f"raid:v1:m:{event.id}:advmin", {"value": value})


def _notice(response: dict[str, Any]) -> str:
    """The card's last line — what just changed — without its small-text mark."""
    line = content(response).split("\n")[-1]
    assert line.startswith("-# "), line
    return line.removeprefix("-# ")


def _with_roles(payload: dict[str, Any], *roles: str) -> dict[str, Any]:
    """*payload* from a member holding *roles* (the harness's members hold none)."""
    payload["member"]["roles"] = list(roles)
    return payload


def _labels(response: dict[str, Any]) -> list[str]:
    return [c["label"] for row in response["data"]["components"] for c in row["components"] if "label" in c]


def _post_description(fake_discord: FakeDiscord) -> str:
    """The raid post as the one re-render since the last clear left it."""
    (edit,) = fake_discord.public_edits()
    assert edit.body is not None
    return edit.body["embeds"][0]["description"]


async def _ready_rows(db: AsyncSession, event: WowRaidEvent) -> list[datetime]:
    rows = await db.execute(
        select(WowRaidNotification.due_at).where(
            WowRaidNotification.event_id == event.id,
            WowRaidNotification.kind == "ready_check",
            WowRaidNotification.sent_at.is_(None),
        )
    )
    return list(rows.scalars())


async def _other_rows(db: AsyncSession, event: WowRaidEvent) -> list[tuple[str, datetime]]:
    rows = await db.execute(
        select(WowRaidNotification.kind, WowRaidNotification.due_at)
        .where(WowRaidNotification.event_id == event.id, WowRaidNotification.kind != "ready_check")
        .order_by(WowRaidNotification.due_at, WowRaidNotification.kind)
    )
    return [(kind, due_at) for kind, due_at in rows.all()]


async def _guild(db: AsyncSession) -> WowRaidGuild:
    guild = await wow_raid_guild_repo.get_by_discord_id(db, GUILD)
    assert guild is not None
    await db.refresh(guild)
    return guild


# ---------------------------------------------------------------------------
# Opening the card
# ---------------------------------------------------------------------------


async def test_advanced_opens_from_raid_edit_and_back_returns_there(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    title = f"**Advanced — {raid_advanced_copy.label(event, await _guild(db))}**"

    response = await post(_adv(event, "open"))
    assert response["type"] == 7
    assert content(response).split("\n")[:2] == [title, "Minimum sign-ups: none"]
    response = await post(click(f"raid:v1:ed:{event.id}:back", **_ORGANISER))
    assert response["type"] == 7 and response["data"]["embeds"][0]["title"] == "Edit raid"

    # Only its leader, or someone with Manage Events.
    response = await post(_adv(event, "open", user_id="401", permissions=0))
    assert (response["type"], content(response)) == (7, raid_copy.NOT_LEADER)
    response = await post(_adv(event, "open", user_id="402", permissions=MANAGE_EVENTS))
    assert content(response).startswith("**Advanced — ")
    assert fake_discord.calls == []


async def test_advanced_on_a_draft_comes_back_to_more_options_and_never_posts(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    await setup_guild(post)
    await post(command("raid-admin", "create", raid="onyxia", when=future_when(), size=5))
    event = (await db.execute(select(WowRaidEvent))).scalars().one()
    response = await post(click(f"raid:v1:ed:{event.id}:more", **_ORGANISER))
    assert _labels(response)[8:12] == ["Role limits", "Class limits", "Notes: off", "Advanced"]  # row 3
    fake_discord.clear()

    await post(_menu(event, "pick", "who"))
    response = await post(pick_roles(f"raid:v1:adv:{event.id}:allow:-", {"601": True}))
    assert _notice(response) == "Saved: only <@&601> can sign up for this raid."
    await db.refresh(event)
    assert (event.status, event.signup_role_ids) == ("draft", ["601"])

    # Back is More options, saying the raid's own setting.
    response = await post(click(f"raid:v1:ed:{event.id}:back", **_ORGANISER))
    assert response["type"] == 7 and _labels(response)[-3:] == ["Post raid", "Mentions", "Back"]
    assert "**Advanced:** open to 1 role" in content(response).split("\n")
    assert fake_discord.public_edits() == [] and fake_discord.channel_posts() == []


# ---------------------------------------------------------------------------
# Minimum sign-ups
# ---------------------------------------------------------------------------


async def test_the_minimum_form_saves_clears_and_says_why_not(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)

    response = await post(_menu(event, "pick", "min"))
    assert (response["type"], response["data"]["custom_id"]) == (9, f"raid:v1:m:{event.id}:advmin")

    response = await post(_minimum(event, "3"))
    assert response["type"] == 7
    assert _notice(response) == (
        "Saved. If fewer than 3 have a seat when sign-ups close, the raid is cancelled and everyone on it is told."
    )
    assert "Minimum sign-ups: **3** — below that when sign-ups close, the raid is cancelled" in content(response)
    await db.refresh(event)
    assert event.min_signups == 3

    unchanged = [
        (" 3 ", "That's already the minimum."),
        ("x", "Type a whole number, like 10."),
        ("0", "It has to be at least 1 — leave it empty for no minimum."),
        ("6", "The raid has 5 seats, so the minimum can be 5 at most."),
    ]
    for text, notice in unchanged:
        assert _notice(await post(_minimum(event, text))) == notice
        await db.refresh(event)
        assert event.min_signups == 3

    response = await post(_minimum(event, ""))
    assert _notice(response) == "No minimum."
    await db.refresh(event)
    assert event.min_signups is None

    # Set after sign-ups closed: saved, but nothing will check it.
    await raid_event_service.set_signups_closed(db, event, closed=True, now=datetime.now(timezone.utc))
    response = await post(_minimum(event, "2"))
    assert _notice(response) == "Saved. Sign-ups on this raid have closed, so it won't be checked."
    await db.refresh(event)
    assert event.min_signups == 2
    # The minimum isn't on the post.
    assert fake_discord.public_edits() == []


# ---------------------------------------------------------------------------
# Who can sign up
# ---------------------------------------------------------------------------


async def test_who_can_sign_up_stores_each_list_and_rerenders_the_post(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    response = await post(_menu(event, "pick", "who"))
    assert content(response).startswith("Who can sign up for **")
    allow, ban = f"raid:v1:adv:{event.id}:allow:-", f"raid:v1:adv:{event.id}:ban:-"

    async def step(payload: dict[str, Any], notice: str, rerendered: bool = True) -> None:
        fake_discord.clear()
        response = await post(payload)
        assert response["type"] == 7 and _notice(response) == notice
        assert len(fake_discord.public_edits()) == int(rerendered)
        await db.refresh(event)

    two = "Saved: only <@&601> and <@&602> can sign up for this raid."
    await step(pick_roles(allow, {"601": True, "602": False}), two)
    assert event.signup_role_ids == ["601", "602"]
    assert "Open to: <@&601> <@&602>" in _post_description(fake_discord).split("\n")

    await step(pick_roles(ban, {"603": True}), "Saved: <@&603> can't sign up for this raid.")
    assert event.banned_role_ids == ["603"]

    # Only @everyone: nothing saved, nothing re-rendered.
    await step(pick_roles(allow, {GUILD: False}), raid_advanced_copy.EVERYONE_PICKED, rerendered=False)
    assert event.signup_role_ids == ["601", "602"]
    await step(
        pick_roles(allow, {GUILD: False, "604": True}),
        f"Saved: only <@&604> can sign up for this raid. {raid_advanced_copy.EVERYONE_LEFT_OUT}",
    )
    assert event.signup_role_ids == ["604"]

    await step(_adv(event, "all"), raid_advanced_copy.EVERYONE_NOTICE)
    assert (event.signup_role_ids, event.banned_role_ids) == ([], ["603"])
    assert "Open to:" not in _post_description(fake_discord)

    await step(_adv(event, "inherit", "who"), raid_advanced_copy.INHERIT_NOTICE)
    assert (event.signup_role_ids, event.banned_role_ids) == (None, None)

    # An emptied menu is the raid's own "everyone".
    await step(pick_roles(allow, {}), "Saved: everyone can sign up for this raid.")
    assert event.signup_role_ids == []


# ---------------------------------------------------------------------------
# Ready check
# ---------------------------------------------------------------------------


async def test_the_ready_check_menu_moves_the_raids_pending_ready_check(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    assert await _ready_rows(db, event) == [event.starts_at - timedelta(hours=1)]
    others = await _other_rows(db, event)
    assert others  # the nudges and the consumables round

    response = await post(_menu(event, "pick", "ready"))
    assert content(response).startswith("Ready check for **")

    response = await post(_menu(event, "ready", "15"))
    assert response["type"] == 7 and content(response).startswith("**Advanced — ")
    assert _notice(response) == "Saved: the ready check goes out 15 minutes before the start."
    await db.refresh(event)
    assert event.ready_check_minutes == 15
    assert await _ready_rows(db, event) == [event.starts_at - timedelta(minutes=15)]

    response = await post(_menu(event, "ready", "0"))
    assert _notice(response) == "Saved: no ready check for this raid."
    assert await _ready_rows(db, event) == []

    response = await post(_menu(event, "ready", "inherit"))
    assert _notice(response) == "Saved: this raid follows the server default (1 hour before the start)."
    await db.refresh(event)
    assert event.ready_check_minutes is None
    assert await _ready_rows(db, event) == [event.starts_at - timedelta(hours=1)]

    # A value the menu doesn't offer (an old card) changes nothing.
    response = await post(_menu(event, "ready", "7"))
    assert (response["type"], content(response)) == (7, raid_copy.GENERIC_ERROR)
    # Only the ready check moved; the ready check isn't on the post.
    assert await _other_rows(db, event) == others
    assert fake_discord.public_edits() == []


# ---------------------------------------------------------------------------
# /raid-admin advanced
# ---------------------------------------------------------------------------


async def test_the_server_card_needs_manage_events_then_saves_the_defaults(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    response = await post(command("raid-admin", "advanced"))
    assert_ephemeral(response)
    assert content(response) == raid_copy.NOT_CONFIGURED

    event = await _raid(post, db, fake_discord)
    response = await post(command("raid-admin", "advanced", user_id="401", permissions=0))
    assert content(response) == raid_copy.NOT_PERMITTED_EVENTS
    response = await post(command("raid-admin", "advanced"))
    assert_ephemeral(response)
    assert content(response).split("\n")[0] == "**Server defaults**"
    response = await post(click("raid:v1:sadv:open:-", user_id="401", permissions=0))
    assert (response["type"], content(response)) == (7, raid_copy.NOT_PERMITTED_EVENTS)

    response = await post(_server_menu("pick", "ready"))
    assert content(response).split("\n")[0] == raid_advanced_copy.SERVER_READY_PROMPT
    response = await post(_server_menu("ready", "30"))
    assert _notice(response) == raid_advanced_copy.server_ready_notice(30)
    assert "Ready check: **30 minutes** before the start" in content(response).split("\n")
    assert (await _guild(db)).settings["ready_check_minutes"] == 30
    # A raid already posted keeps its ready check.
    assert await _ready_rows(db, event) == [event.starts_at - timedelta(hours=1)]

    response = await post(_server_menu("pick", "who"))
    assert content(response).split("\n")[0] == raid_advanced_copy.SERVER_WHO_PROMPT
    response = await post(pick_roles("raid:v1:sadv:ban:-", {"603": True}))
    assert _notice(response) == "Saved: <@&603> can't sign up, unless a raid sets its own."
    response = await post(pick_roles("raid:v1:sadv:allow:-", {"601": True}))
    assert _notice(response) == "Saved: only <@&601> can sign up, unless a raid sets its own."
    guild = await _guild(db)
    assert (guild.signup_role_ids, guild.banned_role_ids) == (["601"], ["603"])

    # An emptied menu clears the server's list.
    response = await post(pick_roles("raid:v1:sadv:allow:-", {}))
    assert _notice(response) == "Saved: everyone can sign up, unless a raid sets its own."
    assert (await _guild(db)).signup_role_ids is None


async def test_a_server_change_rerenders_only_the_open_raids_that_follow_it(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    following = await _raid(post, db, fake_discord)

    async def posted(message_id: str, days: int) -> WowRaidEvent:
        raid = await wow_raid_event_repo.create(
            db, guild_id=following.guild_id, raid_key="onyxia", starts_at=following.starts_at + timedelta(days=days),
            size_cap=5, channel_id=CHANNEL, created_by_user_id=ORGANISER, status="scheduled",
        )
        await wow_raid_event_repo.set_message_id(db, raid, message_id)
        return raid

    own = await posted("m8", 1)
    await wow_raid_advanced_repo.set_event_roles(db, own, which="signup", role_ids=["605"])
    started = await posted("m9", 2)
    await wow_raid_event_repo.set_start_applied(db, started, datetime.now(timezone.utc))

    await post(pick_roles("raid:v1:sadv:allow:-", {"601": True}))
    assert [edit.path for edit in fake_discord.public_edits()] == [f"/channels/{CHANNEL}/messages/m1"]
    assert "Open to: <@&601>" in _post_description(fake_discord).split("\n")

    # The banned roles aren't on any post.
    fake_discord.clear()
    await post(pick_roles("raid:v1:sadv:ban:-", {"603": True}))
    assert fake_discord.public_edits() == []


# ---------------------------------------------------------------------------
# Who can sign up, on the post's buttons
# ---------------------------------------------------------------------------


async def test_who_can_sign_up_keeps_members_off_the_post(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    await wow_raid_advanced_repo.set_event_roles(db, event, which="signup", role_ids=["601"])
    await wow_raid_advanced_repo.set_event_roles(db, event, which="banned", role_ids=["603"])
    mage, tentative = f"raid:v1:cls:{event.id}:mage", f"raid:v1:status:{event.id}:tentative"
    spec = f"raid:v1:spec:{event.id}:mage:confirmed"

    # Without an allowed role: the class button, a status button and the spec select all refuse.
    response = await post(_with_roles(click(mage, user_id="2001"), "699"))
    assert_ephemeral(response)
    assert content(response) == _OPEN_TO_601
    response = await post(_with_roles(click(tentative, user_id="2001"), "699"))
    assert_ephemeral(response)
    assert content(response) == _OPEN_TO_601
    response = await post(_with_roles(click(spec, user_id="2001", values=["mage.frost"]), "699"))
    assert (response["type"], content(response), response["data"]["components"]) == (7, _OPEN_TO_601, [])
    assert await wow_raid_signup_repo.get(db, event_id=event.id, discord_user_id="2001") is None

    # A banned role keeps a member out even with an allowed one.
    response = await post(_with_roles(click(mage, user_id="2002"), "601", "603"))
    assert content(response) == _BANNED

    # An allowed role lets them in.
    response = await post(_with_roles(click(mage, user_id="2003"), "601"))
    assert content(response) == raid_copy.spec_prompt("Mage")
    await post(_with_roles(click(spec, user_id="2003", values=["mage.frost"]), "601"))
    assert await wow_raid_signup_repo.get(db, event_id=event.id, discord_user_id="2003") is not None

    # Its leader, anyone with Manage Events, and anyone already on the raid always pass.
    assert content(await post(click(mage, user_id=ORGANISER))) == raid_copy.spec_prompt("Mage")
    assert content(await post(click(mage, user_id="2004", permissions=MANAGE_EVENTS))) == raid_copy.spec_prompt("Mage")
    await wow_raid_signup_repo.upsert_signup(
        db, event_id=event.id, discord_user_id="2005", display_name="Player2005", status="tentative",
        wow_class="mage", role="dps", spec="frost",
    )
    response = await post(_with_roles(click(spec, user_id="2005", values=["mage.frost"]), "603"))
    assert content(response) not in (_BANNED, _OPEN_TO_601)
    row = await wow_raid_signup_repo.get(db, event_id=event.id, discord_user_id="2005")
    assert row is not None
    await db.refresh(row)
    assert row.status == "confirmed"
