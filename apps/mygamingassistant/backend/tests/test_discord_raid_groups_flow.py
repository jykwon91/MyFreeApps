"""End-to-end flows for [Groups] — Raid: Edit's planner link and the post's shared groups.

Through POST /discord/interactions with the harness in ``discord_raid_harness.py``:
Raid: Edit → [Groups] handing the leader a private 2-hour link to the group
planner (who may, when not, what's stored), and the post's [Groups] — there
while the leader shares the groups — answering anyone privately with them.
The leader's saves go through the planner's service and the re-render its
API runs after one that shares or hides the groups
(``raid_publisher.refresh_public_message``).  The API itself is in
``test_wow_raid_plan_api_db.py``, the rules in ``test_wow_raid_groups.py``.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from platform_shared.services.discord import BUTTON_STYLE_LINK, BUTTON_STYLE_SECONDARY, MANAGE_EVENTS
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_plan_link import WowRaidPlanLink
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.repositories.wow import wow_raid_signup_repo
from app.schemas.wow.raid_plan import PlanAssignment, RaidPlanSave
from app.services.discord import raid_copy, raid_groups_copy, raid_publisher
from app.services.discord.commands_spec import EDIT_MENU
from app.services.wow import raid_custom_id, raid_plan_links, raid_plan_service

from discord_raid_harness import (
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
    menu_command,
    setup_guild,
)

_ORIGIN = "https://mga.example"
_TITLE = "Onyxia's Lair"
_MEMBER = {"user_id": "401", "permissions": 0}
_OFFICER = {"user_id": "402", "permissions": MANAGE_EVENTS}
_PLANNER = re.compile(r"https://mga\.example/wow-forever/raids/([0-9a-f]{32})/plan#k=([A-Za-z0-9_-]{43})")
# (user id, name, class, role, spec), in sign-up order.
_PLAYERS = (
    ("301", "Garrosh", "warrior", "tank", "protection"),
    ("302", "Jaina", "mage", "dps", "frost"),
    ("303", "Anduin", "priest", "healer", "holy"),
)


@pytest.fixture(autouse=True)
def public_origin(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "frontend_url", _ORIGIN)


async def _raid(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> WowRaidEvent:
    """A posted raid — its post is m1 — with the Discord calls so far forgotten."""
    await setup_guild(post)
    event = await create_and_post(post, db)
    fake_discord.clear()
    return event


async def _sign_up_players(db: AsyncSession, event: WowRaidEvent) -> dict[str, WowRaidSignup]:
    for user_id, name, wow_class, role, spec in _PLAYERS:
        await wow_raid_signup_repo.upsert_signup(
            db,
            event_id=event.id,
            discord_user_id=user_id,
            display_name=name,
            status="confirmed",
            wow_class=wow_class,
            role=role,
            spec=spec,
        )
    return {signup.display_name: signup for signup in await wow_raid_signup_repo.list_for_event(db, event.id)}


def _plan_click(event: WowRaidEvent, **as_who: Any) -> dict[str, Any]:
    """Raid: Edit → [Groups] — by the organiser unless *as_who* says otherwise."""
    as_who = {"user_id": ORGANISER, "permissions": ORGANISER_PERMS, **as_who}
    return click(f"raid:v1:gp:{event.id}:plan", **as_who)


def _view_click(event: WowRaidEvent) -> dict[str, Any]:
    """The post's [Groups], by a member of the channel."""
    return click(f"raid:v1:gp:{event.id}:view", **_MEMBER)


def _buttons(response: dict[str, Any]) -> list[dict[str, Any]]:
    rows = response["data"].get("components") or []
    return [component for row in rows for component in row["components"]]


def _planner_token(response: dict[str, Any], event: WowRaidEvent) -> str:
    [button] = _buttons(response)
    assert (button["style"], button["label"]) == (BUTTON_STYLE_LINK, raid_groups_copy.OPEN_PLANNER)
    match = _PLANNER.fullmatch(button["url"])
    assert match is not None, button["url"]
    assert match.group(1) == event.web_id.hex
    return match.group(2)


async def _links(db: AsyncSession) -> list[WowRaidPlanLink]:
    result = await db.execute(
        select(WowRaidPlanLink).order_by(WowRaidPlanLink.discord_user_id).execution_options(populate_existing=True)
    )
    return list(result.scalars().all())


async def _share(
    db: AsyncSession,
    event: WowRaidEvent,
    token: str,
    *,
    version: int,
    published: bool,
    places: list[tuple[WowRaidSignup, int, int]],
) -> None:
    """A planner save that shares or hides the groups, then the re-render its API runs after one."""
    now = datetime.now(timezone.utc)
    access = await raid_plan_links.resolve(db, event.web_id, f"RaidPlanner {token}", now)
    assert not isinstance(access, str)
    assignments = [PlanAssignment(signup_id=signup.id, group=group, slot=slot) for signup, group, slot in places]
    body = RaidPlanSave(version=version, published=published, assignments=assignments)
    outcome = await raid_plan_service.save_plan(db, access, body, now)
    assert not isinstance(outcome, str) and outcome.visibility_changed
    await raid_publisher.refresh_public_message(event.id)


def _post_links(fake_discord: FakeDiscord) -> list[dict[str, Any]]:
    """The last row of the post as its one re-render since the last clear left it."""
    (edit,) = fake_discord.public_edits()
    assert edit.body is not None
    fake_discord.clear()
    return edit.body["components"][-1]["components"]


# ---------------------------------------------------------------------------
# Raid: Edit → [Groups]: the planner link
# ---------------------------------------------------------------------------


async def test_groups_on_raid_edit_hands_the_leader_a_private_planner_link(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    card = await post(menu_command(EDIT_MENU, "m1"))
    groups = card["data"]["components"][1]["components"][-1]
    assert (groups["label"], groups["custom_id"]) == (raid_groups_copy.BUTTON, f"raid:v1:gp:{event.id}:plan")

    response = await post(_plan_click(event))
    assert_ephemeral(response)
    token = _planner_token(response, event)
    [link] = await _links(db)
    assert (link.discord_user_id, link.token_hash) == (ORGANISER, raid_plan_links.token_hash(token))
    assert link.expires_at - link.created_at == timedelta(hours=2)
    assert content(response) == raid_groups_copy.planner_link_text(_TITLE, link.expires_at)
    assert token not in content(response)
    assert fake_discord.calls == []  # a private reply: the post and the card stay as they are

    # --- again: a new link, and the first one stops working
    again = _planner_token(await post(_plan_click(event)), event)
    [link] = await _links(db)
    assert again != token and link.token_hash == raid_plan_links.token_hash(again)


async def test_only_the_raids_leader_or_manage_events_gets_a_link(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    response = await post(_plan_click(event, **_MEMBER))
    assert_ephemeral(response)
    assert (content(response), _buttons(response)) == (raid_groups_copy.NOT_LEADER, [])
    assert await _links(db) == []

    _planner_token(await post(_plan_click(event, **_OFFICER)), event)
    assert [link.discord_user_id for link in await _links(db)] == [_OFFICER["user_id"]]
    assert fake_discord.calls == []


async def test_no_link_without_https_for_a_raid_that_is_over_or_a_draft(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord, monkeypatch: pytest.MonkeyPatch
) -> None:
    event = await _raid(post, db, fake_discord)
    monkeypatch.setattr(settings, "frontend_url", "http://localhost:5176")
    assert content(await post(_plan_click(event))) == raid_groups_copy.NO_HTTPS
    monkeypatch.setattr(settings, "frontend_url", _ORIGIN)
    for status in ("cancelled", "completed"):
        event.status = status
        await db.flush()
        assert content(await post(_plan_click(event))) == raid_groups_copy.RAID_OVER

    await post(command("raid-admin", "create", raid="onyxia", when=future_when(), size=5))
    draft = (await db.execute(select(WowRaidEvent).where(WowRaidEvent.status == "draft"))).scalars().one()
    assert content(await post(_plan_click(draft))) == raid_copy.NOT_FOUND
    assert await _links(db) == []


# ---------------------------------------------------------------------------
# The post's [Groups]: the shared groups
# ---------------------------------------------------------------------------


async def test_the_post_offers_the_groups_while_the_leader_shares_them(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    players = await _sign_up_players(db, event)
    token = await raid_plan_links.mint(db, event, ORGANISER, datetime.now(timezone.utc))
    assert content(await post(_view_click(event))) == raid_groups_copy.NOT_SHARED

    places = [(players["Jaina"], 1, 2), (players["Garrosh"], 1, 1)]
    await _share(db, event, token, version=0, published=True, places=places)
    web_view, groups = _post_links(fake_discord)
    assert web_view["label"] == "Web view"
    assert (groups["custom_id"], groups["label"], groups["style"], groups["disabled"]) == (
        f"raid:v1:gp:{event.id}:view", "Groups", BUTTON_STYLE_SECONDARY, False
    )

    response = await post(_view_click(event))
    assert_ephemeral(response)
    [embed] = response["data"]["embeds"]
    assert embed["title"] == f"Groups — {_TITLE}"
    [group] = embed["fields"]
    assert (group["name"], group["inline"]) == ("Group 1", True)
    first, second = group["value"].split("\n")
    assert "Garrosh" in first and "Jaina" in second  # slot order, not sign-up order
    assert embed["description"] == raid_groups_copy.unplaced_line(1)  # Anduin
    [browser] = _buttons(response)
    assert (browser["style"], browser["label"], browser["url"]) == (
        BUTTON_STYLE_LINK, raid_groups_copy.OPEN_IN_BROWSER, f"{_ORIGIN}/wow-forever/raids/{event.web_id.hex}#groups"
    )
    assert fake_discord.calls == []

    # --- hidden again: the post loses [Groups], and a click on one not yet re-rendered says so
    await _share(db, event, token, version=1, published=False, places=places)
    assert [button["label"] for button in _post_links(fake_discord)] == ["Web view"]
    assert content(await post(_view_click(event))) == raid_groups_copy.NOT_SHARED


async def test_shared_groups_with_nobody_placed_say_so(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord, monkeypatch: pytest.MonkeyPatch
) -> None:
    event = await _raid(post, db, fake_discord)
    await _sign_up_players(db, event)
    token = await raid_plan_links.mint(db, event, ORGANISER, datetime.now(timezone.utc))
    await _share(db, event, token, version=0, published=True, places=[])
    fake_discord.clear()

    monkeypatch.setattr(settings, "frontend_url", "http://localhost:5176")
    response = await post(_view_click(event))
    [embed] = response["data"]["embeds"]
    assert embed["fields"] == []
    assert embed["description"] == f"{raid_groups_copy.NOBODY_PLACED}\n{raid_groups_copy.unplaced_line(3)}"
    assert _buttons(response) == []  # no public https address: nothing to open in a browser


# ---------------------------------------------------------------------------
# The custom ids
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("verb", ["view", "plan"])
def test_groups_custom_ids_round_trip(verb: str) -> None:
    event_id = uuid.uuid4()
    parsed = raid_custom_id.parse(raid_custom_id.encode("gp", event_id, verb))
    assert parsed is not None
    assert (parsed.action, parsed.event_id, parsed.args) == ("gp", event_id, (verb,))


@pytest.mark.parametrize("tail", ["edit", "", "view:x"])
def test_a_groups_custom_id_with_any_other_ending_is_ignored(tail: str) -> None:
    custom_id = f"raid:v1:gp:{uuid.uuid4()}"
    if tail:
        custom_id = f"{custom_id}:{tail}"
    assert raid_custom_id.parse(custom_id) is None
