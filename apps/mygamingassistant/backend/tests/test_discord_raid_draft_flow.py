"""End-to-end flows for the create preview's More options — the draft's card.

``/raid-admin create`` → [More options] → the forms and menus Raid: Edit
uses, each answered with the draft's card; [Mentions] picks who the raid
pings (or [No ping]); [Back] returns to the preview; [Post raid] posts
with that ping.  Through POST /discord/interactions with
``discord_raid_harness.py``.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from platform_shared.services.discord import MENTION_EVERYONE
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_notification import WowRaidNotification
from app.services.discord import raid_copy, raid_draft_copy, raid_publisher
from app.services.discord.raid_draft_copy import (
    EVERYONE_LEFT_OUT,
    MENTIONS_NONE,
    MENTIONS_OK,
    NOTHING_CHANGED,
    mentions_heads_up,
    mentions_left_out,
    preview_state,
)
from app.services.discord.raid_draft_views import MENTION_MAX
from app.services.wow.raid_time_parser import PAST_MESSAGE

from discord_raid_harness import (
    CHANNEL,
    GUILD,
    ORGANISER,
    ORGANISER_PERMS,
    ROLE,
    FakeDiscord,
    Post,
    click,
    command,
    content,
    custom_id_for,
    custom_ids,
    future_when,
    modal_submit,
    pick_roles,
    setup_guild,
)

pytestmark = pytest.mark.asyncio

_MEMBER = {"user_id": "401", "permissions": 0}
_CARD_LABELS = [
    "Title", "Leader", "Date & Time", "Deadline", "Description", "Image", "Color", "Event & thread",
    "Role limits", "Class limits", "Notes: off", "Advanced", "Post raid", "Mentions", "Back",
]
_PREVIEW_LABELS = ["Post raid", "More options", "Cancel"]


async def _draft(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> tuple[dict[str, Any], WowRaidEvent]:
    """A fresh create preview and its draft, with the Discord calls so far forgotten."""
    await setup_guild(post)
    preview = await post(command("raid-admin", "create", raid="onyxia", when=future_when(), size=5))
    event = (await db.execute(select(WowRaidEvent))).scalars().one()
    fake_discord.clear()
    return preview, event


def _ed(event: WowRaidEvent, action: str, **as_who: Any) -> dict[str, Any]:
    """A click on one of the draft's buttons — by the organiser unless *as_who* says otherwise."""
    as_who = {"user_id": ORGANISER, "permissions": ORGANISER_PERMS, **as_who}
    return click(f"raid:v1:ed:{event.id}:{action}", **as_who)


def _mentions(event: WowRaidEvent, roles: dict[str, bool], **as_who: Any) -> dict[str, Any]:
    return pick_roles(f"raid:v1:pick:{event.id}:mentions", roles, **as_who)


def _post_raid(event: WowRaidEvent) -> dict[str, Any]:
    return click(f"raid:v1:confirm:{event.id}", user_id=ORGANISER, permissions=ORGANISER_PERMS)


def _labels(response: dict[str, Any]) -> list[str]:
    return [c["label"] for row in response["data"]["components"] for c in row["components"] if "label" in c]


def _author(response: dict[str, Any]) -> str:
    [embed] = response["data"]["embeds"]
    return embed["author"]["name"]


def _card_says(response: dict[str, Any], first_line: str, role_ids: list[str]) -> None:
    """The draft's card: *first_line*, then where it posts and who it pings."""
    assert response["type"] == 7
    assert content(response) == f"{first_line}\n{preview_state(CHANNEL, role_ids)}"
    assert _labels(response) == _CARD_LABELS


async def test_more_options_changes_the_draft_and_back_returns_to_the_preview(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord, monkeypatch: pytest.MonkeyPatch
) -> None:
    preview, event = await _draft(post, db, fake_discord)
    refreshed: list[uuid.UUID] = []

    async def refresh(event_id: uuid.UUID) -> None:
        refreshed.append(event_id)

    monkeypatch.setattr(raid_publisher, "refresh_public_message", refresh)
    assert custom_id_for(preview, "ed") == f"raid:v1:ed:{event.id}:more"

    # --- More options: the post's embed, and a button per thing to change
    response = await post(_ed(event, "more"))
    _card_says(response, raid_copy.EDIT_PROMPT, [ROLE])
    assert _author(response) == "Onyxia's Lair · Leader: Thrall"

    # --- a form's submit lands back on the card, its embed showing the change
    response = await post(_ed(event, "title"))
    assert response["type"] == 9
    response = await post(modal_submit(f"raid:v1:m:{event.id}:title", {"value": "Ony speedrun"}))
    _card_says(response, raid_copy.TITLE_OK, [ROLE])
    assert _author(response) == "Ony speedrun · Leader: Thrall"
    await db.refresh(event)
    assert (event.title, event.status) == ("Ony speedrun", "draft")

    # --- a menu's [Back] comes back to this card, not to Raid: Edit's; a pick lands there too
    response = await post(_ed(event, "color"))
    assert f"raid:v1:pick:{event.id}:color" in custom_ids(response)
    response = await post(_ed(event, "back"))
    _card_says(response, raid_copy.EDIT_PROMPT, [ROLE])
    picker = f"raid:v1:pick:{event.id}:color"
    response = await post(click(picker, user_id=ORGANISER, permissions=ORGANISER_PERMS, values=["blue"]))
    _card_says(response, raid_copy.COLOR_OK, [ROLE])

    # --- buttons only a posted raid has, from a card left open: this card again
    response = await post(_ed(event, "delete"))
    _card_says(response, raid_copy.EDIT_PROMPT, [ROLE])

    # --- [Back] on the card: the preview again, with the change
    response = await post(_ed(event, "preview"))
    assert response["type"] == 7
    assert content(response) == raid_draft_copy.preview_intro(CHANNEL, [ROLE])
    assert _labels(response) == _PREVIEW_LABELS
    assert _author(response) == "Ony speedrun · Leader: Thrall"

    # A draft has no post to re-render, so nothing is even queued for it.
    assert fake_discord.calls == []
    assert refreshed == []


async def test_a_draft_moved_in_more_options_schedules_nothing_until_posted(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    _, event = await _draft(post, db, fake_discord)

    response = await post(modal_submit(f"raid:v1:m:{event.id}:when", {"value": future_when(days=12)}))
    await db.refresh(event)
    _card_says(response, raid_copy.moved(int(event.starts_at.timestamp())), [ROLE])
    assert raid_copy.NOTIFY_BUTTON not in _labels(response)
    assert (await db.execute(select(WowRaidNotification))).scalars().all() == []

    # --- posted: the reminders follow the time it was moved to
    await post(_post_raid(event))
    rows = (await db.execute(select(WowRaidNotification))).scalars().all()
    [ready_check] = [row for row in rows if row.kind == "ready_check"]
    assert event.starts_at - timedelta(hours=2) < ready_check.due_at < event.starts_at


async def test_post_raid_on_a_draft_whose_time_has_passed_lands_on_more_options(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    _, event = await _draft(post, db, fake_discord)
    event.starts_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    await db.flush()

    # [Date & Time] is one tap away there.
    response = await post(_post_raid(event))
    _card_says(response, PAST_MESSAGE, [ROLE])
    await db.refresh(event)
    assert event.status == "draft"
    assert fake_discord.channel_posts() == []


async def test_mentions_picks_who_the_post_pings(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    _, event = await _draft(post, db, fake_discord)

    # --- the menu holds the server's ping role until the raid picks its own
    response = await post(_ed(event, "mentions"))
    assert response["type"] == 7
    [menu] = response["data"]["components"][0]["components"]
    assert (menu["type"], menu["min_values"], menu["max_values"]) == (6, 0, MENTION_MAX)
    assert menu["default_values"] == [{"id": ROLE, "type": "role"}]

    # --- picked: the card says so, and who the raid pings now
    response = await post(_mentions(event, {"611": True, "612": True}))
    _card_says(response, MENTIONS_OK, ["611", "612"])
    await db.refresh(event)
    assert event.mention_role_ids == ["611", "612"]

    # --- the preview says so, and the post pings exactly those roles
    response = await post(_ed(event, "preview"))
    assert content(response) == raid_draft_copy.preview_intro(CHANNEL, ["611", "612"])
    response = await post(_post_raid(event))
    assert content(response) == raid_copy.posting(CHANNEL)
    (public_post,) = fake_discord.channel_posts()
    assert public_post.body is not None
    assert public_post.body["content"] == "<@&611> <@&612>"
    assert public_post.body["allowed_mentions"] == {"parse": [], "roles": ["611", "612"]}

    # --- once posted, the draft's buttons and menus give the edit card and change nothing
    for request in (_mentions(event, {"613": True}), _ed(event, "more"), _ed(event, "noping")):
        response = await post(request)
        assert content(response) == raid_copy.EDIT_PROMPT
        assert "Cancel raid" in _labels(response)
    await db.refresh(event)
    assert event.mention_role_ids == ["611", "612"]


async def test_a_role_that_isnt_mentionable_needs_someone_who_could_ping_it(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    _, event = await _draft(post, db, fake_discord)

    # --- the server's ping role stays as it is, mentionable or not
    response = await post(_mentions(event, {ROLE: False, "611": True}))
    _card_says(response, MENTIONS_OK, [ROLE, "611"])

    # --- one added by someone who couldn't ping it themselves is left out
    response = await post(_mentions(event, {ROLE: False, "611": True, "612": False}))
    _card_says(response, f"{MENTIONS_OK} {mentions_left_out(['612'])}", [ROLE, "611"])

    # --- someone who may ping any role keeps it, with a heads-up
    can_ping_any = {"permissions": ORGANISER_PERMS | MENTION_EVERYONE}
    response = await post(_mentions(event, {ROLE: False, "611": True, "612": False}, **can_ping_any))
    _card_says(response, f"{MENTIONS_OK} {mentions_heads_up(['612'])}", [ROLE, "611", "612"])

    # --- nothing left to ping: the menu again, and the raid keeps its roles
    response = await post(_mentions(event, {"613": False}))
    assert content(response).endswith(f"{NOTHING_CHANGED} {mentions_left_out(['613'])}")
    assert f"raid:v1:pick:{event.id}:mentions" in custom_ids(response)
    await db.refresh(event)
    assert event.mention_role_ids == [ROLE, "611", "612"]


async def test_the_servers_ping_role_can_always_be_picked_again(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    _, event = await _draft(post, db, fake_discord)

    # --- swapped for another role, then picked again: the raid would ping it by default anyway
    response = await post(_mentions(event, {"611": True}))
    _card_says(response, MENTIONS_OK, ["611"])
    response = await post(_mentions(event, {ROLE: False, "611": True}))
    _card_says(response, MENTIONS_OK, [ROLE, "611"])

    # --- after [No ping] too
    await post(_ed(event, "noping"))
    response = await post(_mentions(event, {ROLE: False}))
    _card_says(response, MENTIONS_OK, [ROLE])
    await db.refresh(event)
    assert event.mention_role_ids == [ROLE]


async def test_clearing_mentions_posts_without_a_ping(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    _, event = await _draft(post, db, fake_discord)

    response = await post(_mentions(event, {}))
    _card_says(response, MENTIONS_NONE, [])
    await db.refresh(event)
    assert event.mention_role_ids == []

    await post(_post_raid(event))
    (public_post,) = fake_discord.channel_posts()
    assert public_post.body is not None
    assert "content" not in public_post.body
    assert public_post.body["allowed_mentions"] == {"parse": []}


async def test_no_ping_clears_the_mentions_in_one_tap(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    _, event = await _draft(post, db, fake_discord)

    response = await post(_ed(event, "noping"))
    _card_says(response, MENTIONS_NONE, [])
    await db.refresh(event)
    assert event.mention_role_ids == []

    # --- the menu then starts empty, [No ping] greyed out
    response = await post(_ed(event, "mentions"))
    select_row, buttons_row = response["data"]["components"]
    assert select_row["components"][0]["default_values"] == []
    assert buttons_row["components"][0]["disabled"] is True


async def test_everyone_is_refused_and_only_resolved_roles_are_kept(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    _, event = await _draft(post, db, fake_discord)

    # --- @everyone's role id is the server's own: left out, the rest kept
    response = await post(_mentions(event, {GUILD: True, "611": True}))
    _card_says(response, f"{MENTIONS_OK} {EVERYONE_LEFT_OUT}", ["611"])

    # --- @everyone alone: the menu again, nothing changed
    response = await post(_mentions(event, {GUILD: True}))
    assert content(response).endswith(f"{NOTHING_CHANGED} {EVERYONE_LEFT_OUT}")
    assert f"raid:v1:pick:{event.id}:mentions" in custom_ids(response)
    await db.refresh(event)
    assert event.mention_role_ids == ["611"]

    # --- a value Discord didn't resolve as a role is dropped
    request = _mentions(event, {"612": True})
    request["data"]["values"].append("999")
    await post(request)
    await db.refresh(event)
    assert event.mention_role_ids == ["612"]


async def test_only_the_organiser_changes_the_draft(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    _, event = await _draft(post, db, fake_discord)

    for request in (
        _ed(event, "more", **_MEMBER),
        _ed(event, "mentions", **_MEMBER),
        _ed(event, "noping", **_MEMBER),
        _mentions(event, {"611": True}, **_MEMBER),
        modal_submit(f"raid:v1:m:{event.id}:title", {"value": "Mine now"}, **_MEMBER),
    ):
        response = await post(request)
        assert content(response) == raid_copy.NOT_LEADER
    await db.refresh(event)
    assert (event.title, event.mention_role_ids) == (None, None)

    # --- thrown away: its buttons find nothing
    await post(click(f"raid:v1:discard:{event.id}", user_id=ORGANISER, permissions=ORGANISER_PERMS))
    response = await post(_ed(event, "more"))
    assert content(response) == raid_copy.NOT_FOUND
