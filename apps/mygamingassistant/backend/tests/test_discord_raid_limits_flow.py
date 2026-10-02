"""End-to-end flows for a raid's role and class limits.

The limits refusing a place in line from the post's buttons, the spec
selects marking the specs with no room, and Raid: Edit's (and the create
preview's More options) Role limits / Class limits forms, through POST
/discord/interactions with the harness in ``discord_raid_harness.py``.
Sign-ups the tests start from are written straight to the repository.
"""
from __future__ import annotations

from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_member_pref import WowRaidMemberPref
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.repositories.wow import wow_raid_signup_repo
from app.services.discord import raid_copy, raid_limit_copy
from app.services.discord.raid_draft_copy import NOTHING_CHANGED, preview_state
from app.services.wow import raid_event_service
from app.services.wow.raid_catalog import spec_info

from discord_raid_harness import (
    CHANNEL,
    ORGANISER,
    ORGANISER_PERMS,
    ROLE,
    FakeDiscord,
    Post,
    assert_ephemeral,
    click,
    command,
    content,
    create_and_post,
    custom_id_for,
    future_when,
    modal_submit,
    setup_guild,
)

pytestmark = pytest.mark.asyncio

_HEALERS_FULL = "The raid already has all the **healers** it needs (1/1)."


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _raid(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> WowRaidEvent:
    """A posted five-player raid, with the Discord calls so far forgotten."""
    await setup_guild(post)
    event = await create_and_post(post, db)
    fake_discord.clear()
    return event


async def _in_line(db: AsyncSession, event: WowRaidEvent, user_id: str, choice: str, status: str = "confirmed") -> None:
    """*user_id* signed up as *choice* ('rogue.combat')."""
    wow_class, spec_key = choice.split(".")
    spec = spec_info(wow_class, spec_key)
    assert spec is not None
    await wow_raid_signup_repo.upsert_signup(
        db,
        event_id=event.id,
        discord_user_id=user_id,
        display_name=f"Player{user_id}",
        status=status,
        wow_class=wow_class,
        role=spec.raid_role,
        spec=spec_key,
    )


async def _save_prefs(post: Post, user_id: str, spec: str) -> None:
    response = await post(command("raid", "prefs", user_id=user_id, permissions=0, spec=spec))
    assert "Saved." in content(response)


async def _signup(db: AsyncSession, event: WowRaidEvent, user_id: str) -> WowRaidSignup | None:
    row = await wow_raid_signup_repo.get(db, event_id=event.id, discord_user_id=user_id)
    if row is not None:
        await db.refresh(row)
    return row


async def _saved_specs(db: AsyncSession, user_id: str) -> dict[str, str]:
    pref = (
        await db.execute(select(WowRaidMemberPref).where(WowRaidMemberPref.discord_user_id == user_id))
    ).scalars().one()
    await db.refresh(pref)
    return pref.saved_specs


def _class_id(event: WowRaidEvent, column: str) -> str:
    """A class button, or [Tank], on the post."""
    return f"raid:v1:cls:{event.id}:{column}"


def _form(event: WowRaidEvent, name: str, fields: dict[str, str]) -> dict[str, Any]:
    """A submit of Role limits / Class limits, by the organiser."""
    return modal_submit(f"raid:v1:m:{event.id}:{name}", fields)


def _options(response: dict[str, Any]) -> list[dict[str, Any]]:
    return response["data"]["components"][0]["components"][0]["options"]


def _description(response: dict[str, Any], value: str) -> str | None:
    """The spec select's line under the option *value* ('druid.restoration')."""
    [option] = [o for o in _options(response) if o["value"] == value]
    return option.get("description")


def _preselected(response: dict[str, Any]) -> list[str]:
    return [o["value"] for o in _options(response) if o.get("default")]


def _card_lines(response: dict[str, Any]) -> list[str]:
    [embed] = response["data"]["embeds"]
    return embed["description"].split("\n")


def _labels(response: dict[str, Any]) -> list[str]:
    return [c["label"] for row in response["data"]["components"] for c in row["components"] if "label" in c]


def _post(fake_discord: FakeDiscord) -> dict[str, Any]:
    """The raid post as the one re-render since the last clear left it."""
    (edit,) = fake_discord.public_edits()
    assert edit.body is not None
    return edit.body


def _button_labels(message: dict[str, Any]) -> list[str]:
    """The post's [Tank] and class buttons."""
    return [c["label"] for row in message["components"][:2] for c in row["components"]]


# ---------------------------------------------------------------------------
# The post's buttons
# ---------------------------------------------------------------------------


async def test_a_full_class_refuses_a_newcomer_but_not_its_own_players(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    await raid_event_service.set_class_limits(db, event, {"rogue": 1})
    await _in_line(db, event, "2001", "rogue.combat")

    # A saved Rogue spec is no way past it: tapped on the post, it's just why.
    await _save_prefs(post, "2002", "rogue.combat")
    fake_discord.clear()
    response = await post(click(_class_id(event, "rogue"), user_id="2002"))
    assert_ephemeral(response)
    assert content(response) == f"**Rogue** is full (1/1). {raid_limit_copy.END_CLASS}"
    assert response["data"]["components"] == []
    assert await _signup(db, event, "2002") is None
    assert fake_discord.public_edits() == []

    # The Rogue already in it may still switch spec.
    response = await post(click(_class_id(event, "rogue"), user_id="2001"))
    assert content(response) == raid_copy.spec_switch_prompt("Combat Rogue")
    response = await post(click(custom_id_for(response, "spec"), user_id="2001", values=["rogue.assassination"]))
    assert content(response) == f"{raid_copy.switched_to('Assassination Rogue')} {raid_copy.NEXT_TIME_ONE_TAP}"
    row = await _signup(db, event, "2001")
    assert row is not None and (row.status, row.spec) == ("confirmed", "assassination")


async def test_a_saved_spec_with_no_room_asks_for_another(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    await raid_event_service.set_role_limits(db, event, {"healer": 1})
    await _in_line(db, event, "2101", "priest.holy")
    await _save_prefs(post, "2102", "druid.restoration")

    response = await post(click(_class_id(event, "druid"), user_id="2102"))
    assert_ephemeral(response)
    assert content(response) == f"{_HEALERS_FULL} {raid_limit_copy.END_SPEC}"
    assert _description(response, "druid.restoration") == "Healer · full (1/1)"
    assert custom_id_for(response, "spec") == f"raid:v1:spec:{event.id}:druid:confirmed"
    assert await _signup(db, event, "2102") is None

    response = await post(click(custom_id_for(response, "spec"), user_id="2102", values=["druid.balance"]))
    assert content(response) == raid_copy.signed_up_as("Balance Druid")
    row = await _signup(db, event, "2102")
    assert row is not None and (row.status, row.wow_class, row.spec) == ("confirmed", "druid", "balance")


async def test_a_refused_pick_is_still_saved_as_your_spec(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    await raid_event_service.set_role_limits(db, event, {"healer": 1})
    await _in_line(db, event, "2201", "priest.holy")

    # No spec saved: the select, marking the spec with no room.
    response = await post(click(_class_id(event, "druid"), user_id="2202"))
    assert_ephemeral(response)
    assert content(response) == f"{raid_copy.spec_prompt('Druid')}\n{raid_limit_copy.SPEC_MARKS_NOTE}"
    assert _description(response, "druid.restoration") == "Healer · full (1/1)"
    assert _description(response, "druid.balance") == "Ranged DPS"

    # Picked anyway: the select again, saying why — and Restoration is their Druid spec now.
    response = await post(click(custom_id_for(response, "spec"), user_id="2202", values=["druid.restoration"]))
    assert response["type"] == 7
    assert content(response) == f"{_HEALERS_FULL} {raid_limit_copy.END_SPEC}"
    assert custom_id_for(response, "spec") == f"raid:v1:spec:{event.id}:druid:confirmed"
    assert await _signup(db, event, "2202") is None
    assert await _saved_specs(db, "2202") == {"druid": "restoration"}


async def test_late_is_refused_like_a_seat_but_tentative_never_is(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    await raid_event_service.set_class_limits(db, event, {"mage": 1})
    await _in_line(db, event, "2301", "mage.frost")
    await _in_line(db, event, "2302", "mage.fire", status="tentative")  # not in line: not counted

    response = await post(click(f"raid:v1:status:{event.id}:late", user_id="2302"))
    assert_ephemeral(response)
    assert content(response) == f"**Mage** is full (1/1). {raid_limit_copy.END_LISTED}"
    assert custom_id_for(response, "class") == f"raid:v1:class:{event.id}:late"
    row = await _signup(db, event, "2302")
    assert row is not None and row.status == "tentative"

    await _save_prefs(post, "2303", "mage.arcane")
    response = await post(click(f"raid:v1:status:{event.id}:tentative", user_id="2303"))
    assert response["type"] == 7  # the post, re-rendered
    row = await _signup(db, event, "2303")
    assert row is not None and (row.status, row.spec) == ("tentative", "arcane")


async def test_change_spec_marks_the_specs_with_no_room(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    await raid_event_service.set_role_limits(db, event, {"healer": 1})
    await _in_line(db, event, "2501", "priest.holy")
    await _save_prefs(post, "2502", "druid.balance")
    await _in_line(db, event, "2502", "druid.balance")

    response = await post(click(f"raid:v1:change:{event.id}", user_id="2502"))
    assert response["type"] == 7
    assert content(response) == f"{raid_copy.spec_switch_prompt('Balance Druid')}\n{raid_limit_copy.SPEC_MARKS_NOTE}"
    assert _description(response, "druid.restoration") == "Healer · full (1/1)"
    assert _preselected(response) == ["druid.balance"]

    response = await post(click(custom_id_for(response, "spec"), user_id="2502", values=["druid.restoration"]))
    assert response["type"] == 7
    assert content(response) == f"{_HEALERS_FULL} {raid_limit_copy.END_LISTED}"
    assert _preselected(response) == ["druid.balance"]
    assert custom_id_for(response, "card") == f"raid:v1:card:{event.id}:back"
    row = await _signup(db, event, "2502")
    assert row is not None and (row.status, row.spec) == ("confirmed", "balance")
    # On the list, a refused pick leaves the saved spec alone.
    assert await _saved_specs(db, "2502") == {"druid": "balance"}


# ---------------------------------------------------------------------------
# Raid: Edit's forms
# ---------------------------------------------------------------------------


async def test_a_class_limit_below_the_line_removes_nobody(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    await _in_line(db, event, "2401", "rogue.combat")
    await _in_line(db, event, "2402", "rogue.assassination")

    response = await post(_form(event, "class_limits", {"value": "Rogue: 1"}))
    assert response["type"] == 7
    assert content(response) == (
        f"{raid_limit_copy.CLASS_OK}\nThe raid already has 2 Rogues. "
        "Nobody was removed, but nobody else can join as a Rogue until there's room."
    )
    assert _card_lines(response)[6] == "**Class limits:** Rogue 1"
    assert "ROG 2/1" in _button_labels(_post(fake_discord))
    await db.refresh(event)
    assert event.class_limits == {"rogue": 1}
    for user_id in ("2401", "2402"):
        row = await _signup(db, event, user_id)
        assert row is not None and row.status == "confirmed"

    # Its Rogues can still switch spec; another Rogue can't join.
    response = await post(click(_class_id(event, "rogue"), user_id="2401"))
    response = await post(click(custom_id_for(response, "spec"), user_id="2401", values=["rogue.subtlety"]))
    assert content(response) == f"{raid_copy.switched_to('Subtlety Rogue')} {raid_copy.NEXT_TIME_ONE_TAP}"
    await _save_prefs(post, "2403", "rogue.combat")
    response = await post(click(_class_id(event, "rogue"), user_id="2403"))
    assert content(response) == f"**Rogue** is full (2/1). {raid_limit_copy.END_CLASS}"
    assert await _signup(db, event, "2403") is None


async def test_the_role_limits_form_saves_what_it_can_read(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)

    response = await post(_form(event, "role_limits", {"tank": "2", "melee": "", "ranged": "x", "healer": "4"}))
    assert response["type"] == 7
    assert content(response) == (
        "Saved the rest. I couldn't read **Max ranged DPS**. Use a whole number from 0 to 40, or leave a box empty."
    )
    assert _card_lines(response)[5] == "**Role limits:** Tanks 2 · Healers 4"
    await db.refresh(event)
    assert event.role_limits == {"tank": 2, "healer": 4}
    description = _post(fake_discord)["embeds"][0]["description"]
    assert "Tanks **0/2**" in description and "Healers **0/4**" in description

    # The same limits again: nothing to save, nothing to re-render.
    fake_discord.clear()
    response = await post(_form(event, "role_limits", {"tank": "2", "melee": "", "ranged": "", "healer": "4"}))
    assert content(response) == NOTHING_CHANGED
    assert fake_discord.public_edits() == []

    # Every box emptied: no limits, stored as null.
    response = await post(_form(event, "role_limits", {"tank": "", "melee": "", "ranged": "", "healer": ""}))
    assert content(response) == raid_limit_copy.ROLE_CLEARED
    assert _card_lines(response)[5] == "**Role limits:** *none*"
    await db.refresh(event)
    assert event.role_limits is None


async def test_more_options_sets_limits_on_a_draft(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    await setup_guild(post)
    await post(command("raid-admin", "create", raid="onyxia", when=future_when(), size=5))
    event = (await db.execute(select(WowRaidEvent))).scalars().one()
    fake_discord.clear()

    response = await post(click(f"raid:v1:ed:{event.id}:class_limits", user_id=ORGANISER, permissions=ORGANISER_PERMS))
    assert response["type"] == 9
    assert response["data"]["custom_id"] == f"raid:v1:m:{event.id}:class_limits"

    response = await post(_form(event, "class_limits", {"value": "Rogue: 3"}))
    assert response["type"] == 7
    assert content(response).split("\n") == [
        raid_limit_copy.CLASS_OK,
        preview_state(CHANNEL, [ROLE]),
        "**Class limits:** Rogue 3",
    ]
    assert _labels(response)[7:9] == ["Role limits", "Class limits"]  # after [Deadline] in row 1
    await db.refresh(event)
    assert (event.status, event.class_limits) == ("draft", {"rogue": 3})
    assert fake_discord.public_edits() == [] and fake_discord.channel_posts() == []

    # A submit without the box keeps them; only an emptied box clears them.
    response = await post(_form(event, "class_limits", {}))
    assert content(response).split("\n") == [NOTHING_CHANGED, preview_state(CHANNEL, [ROLE]), "**Class limits:** Rogue 3"]
    await db.refresh(event)
    assert event.class_limits == {"rogue": 3}

    # An emptied box clears them all, stored as null.
    response = await post(_form(event, "class_limits", {"value": ""}))
    assert content(response).split("\n") == [raid_limit_copy.CLASS_CLEARED, preview_state(CHANNEL, [ROLE])]
    await db.refresh(event)
    assert event.class_limits is None
