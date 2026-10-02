"""Manage sign-ups with a spec on file: the player's card is the add review.

A player off the raid who saved a spec (``/raid prefs``), or marked absence
as one, is offered it, as the post's buttons would sign them up: [Manage
sign-ups], pick them, [Add and tell them].  Through POST
/discord/interactions with the helpers in ``discord_raid_manage_harness.py``.
"""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.repositories.wow import wow_raid_member_pref_repo
from app.services.discord import raid_manage_copy
from app.services.wow.raid_limits import LimitHit

from discord_raid_harness import ORGANISER, FakeDiscord, Post, command, content, custom_ids
from discord_raid_manage_harness import (
    POST_LINK,
    RAID_NAME,
    card_description,
    card_lines,
    fill_seats,
    ml,
    pick,
    posted_raid,
    sign_up,
    signup_row,
    starts_unix,
    tap,
)

_BOB = "300000000000000001"
_DI = "300000000000000004"


async def _save(post: Post, user_id: str, spec: str | None, *, dm_reminders: bool | None = None) -> None:
    """*user_id* saved *spec* ('warrior.fury') and their DM setting with /raid prefs."""
    prefs = command("raid", "prefs", user_id=user_id, permissions=0, spec=spec, dm_reminders=dm_reminders)
    response = await post(prefs)
    assert "Saved." in content(response)


def _offer_ids(event: WowRaidEvent, user_id: str, choice: str, *, tell: bool = True) -> list[str]:
    """The offer card's ids: the class menu, [Add and tell them] (unless *tell* is off), [Add quietly], [Back]."""
    adds = [ml(event, "addq", user_id, choice)]
    if tell:
        adds.insert(0, ml(event, "addt", user_id, choice))
    return [ml(event, "class", user_id), *adds, ml(event, "open")]


async def test_three_taps_add_a_player_as_their_saved_spec(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    await _save(post, _BOB, "warrior.fury")
    fake_discord.clear()

    # --- [Manage sign-ups], then pick Bob: his card offers his saved spec
    await post(tap(event, "open"))
    card = await post(pick(event, _BOB, "Bob"))
    assert card_description(card) == "Add **Bob** to this raid as **Fury Warrior**?"
    assert custom_ids(card) == _offer_ids(event, _BOB, "warrior.fury")
    menu = card["data"]["components"][0]["components"][0]
    assert menu["placeholder"] == raid_manage_copy.PICK_OTHER_CLASS

    # --- [Add and tell them]: he's in, and told
    hub = await post(tap(event, "addt", _BOB, "warrior.fury", on=card))
    assert card_lines(hub)[1:3] == ["**Bob** is in as **Fury Warrior**.", raid_manage_copy.DM_SENDING]
    bob = await signup_row(db, event, _BOB)
    assert bob is not None
    assert (bob.status, bob.wow_class, bob.spec) == ("confirmed", "warrior", "fury")
    (dm,) = fake_discord.dms_to(_BOB)
    assert dm.body is not None
    assert dm.body["content"] == raid_manage_copy.added_dm(
        ORGANISER, RAID_NAME, starts_unix(event), "Fury Warrior", None, POST_LINK, signups_open=True
    )
    assert fake_discord.public_edits()


async def test_with_no_spec_on_file_the_card_asks_for_a_class(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    await _save(post, _DI, None, dm_reminders=False)  # preferences, but no spec saved
    for user_id, name in ((_BOB, "Bob"), (_DI, "Di")):
        card = await post(pick(event, user_id, name))
        assert card_description(card) == raid_manage_copy.not_on_raid(f"**{name}**")
        assert custom_ids(card) == [ml(event, "class", user_id), ml(event, "open")]


async def test_an_absent_players_own_spec_wins_over_their_saved_one(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    await _save(post, _BOB, "mage.frost")
    await sign_up(db, event, _BOB, "Bob", "warrior.fury", status="absence")

    card = await post(pick(event, _BOB, "Bob"))
    assert card_description(card).split("\n") == [
        raid_manage_copy.absent_note("**Bob**"),
        "Add **Bob** to this raid as **Fury Warrior**?",
    ]
    assert custom_ids(card) == _offer_ids(event, _BOB, "warrior.fury")
    hub = await post(tap(event, "addq", _BOB, "warrior.fury", on=card))
    assert card_lines(hub)[1] == "**Bob** is in as **Fury Warrior**."
    bob = await signup_row(db, event, _BOB)
    assert bob is not None and (bob.status, bob.wow_class) == ("confirmed", "warrior")
    assert fake_discord.dms_to(_BOB) == []


async def test_the_offer_says_when_they_would_queue_or_go_over_a_limit(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    event.class_limits = {"warrior": 1}
    await db.flush()
    await fill_seats(db, event, 4)
    await sign_up(db, event, _DI, "Di", "warrior.arms")
    await _save(post, _BOB, "warrior.fury")
    hit = LimitHit("class", "warrior", 1, 1)

    card = await post(pick(event, _BOB, "Bob"))
    assert card_description(card).split("\n") == [
        "Add **Bob** to this raid as **Fury Warrior**?",
        raid_manage_copy.would_queue(1),
        raid_manage_copy.over_limit_ok(hit),
    ]
    hub = await post(tap(event, "addq", _BOB, "warrior.fury", on=card))
    assert card_lines(hub)[1:3] == [raid_manage_copy.added_queued("**Bob**", 1), raid_manage_copy.added_over(hit)]
    bob = await signup_row(db, event, _BOB)
    assert bob is not None and bob.status == "queued"


async def test_a_saved_tank_spec_is_offered_as_a_tank(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    event = await posted_raid(post, db, fake_discord)
    await _save(post, _BOB, "warrior.protection")
    card = await post(pick(event, _BOB, "Bob"))
    assert card_description(card) == "Add **Bob** to this raid as **Protection Warrior**?"
    await post(tap(event, "addq", _BOB, "warrior.protection", on=card))
    bob = await signup_row(db, event, _BOB)
    assert bob is not None and (bob.role, bob.spec) == ("tank", "protection")


async def test_a_player_with_dms_off_or_the_leader_themself_gets_a_single_add(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    await _save(post, _BOB, "warrior.fury", dm_reminders=False)
    await _save(post, ORGANISER, "mage.frost")

    card = await post(pick(event, _BOB, "Bob"))
    assert card_description(card).split("\n") == [
        "Add **Bob** to this raid as **Fury Warrior**?",
        raid_manage_copy.dm_off("**Bob**"),
    ]
    assert custom_ids(card) == _offer_ids(event, _BOB, "warrior.fury", tell=False)

    card = await post(pick(event, ORGANISER, "Org"))
    assert card_description(card) == "Add **Org** to this raid as **Frost Mage**?"
    assert custom_ids(card) == _offer_ids(event, ORGANISER, "mage.frost", tell=False)
    hub = await post(tap(event, "addq", ORGANISER, "mage.frost", on=card))
    assert card_lines(hub)[1] == "**Org** is in as **Frost Mage**."
    assert fake_discord.dms_to(ORGANISER) == []


async def test_another_class_from_the_menu_adds_them_as_that_and_saves_nothing(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    await _save(post, _BOB, "warrior.fury")
    card = await post(pick(event, _BOB, "Bob"))

    specs = await post(tap(event, "class", _BOB, on=card, values=["priest"]))
    review = await post(tap(event, "spec", _BOB, "priest", on=specs, values=["priest.holy"]))
    assert card_description(review) == "Add **Bob** to this raid as **Holy Priest**?"

    # --- [Back] is his card, still offering the saved spec
    back = await post(tap(event, "card", _BOB, on=review))
    assert custom_ids(back) == _offer_ids(event, _BOB, "warrior.fury")

    await post(tap(event, "addq", _BOB, "priest.holy", on=review))
    bob = await signup_row(db, event, _BOB)
    assert bob is not None and (bob.wow_class, bob.spec) == ("priest", "holy")
    # A leader's pick is for this raid only: his saved spec stays as he left it.
    pref = await wow_raid_member_pref_repo.get(db, guild_id=event.guild_id, discord_user_id=_BOB)
    assert pref is not None
    await db.refresh(pref)
    assert (pref.default_wow_class, pref.saved_specs) == ("warrior", {"warrior": "fury"})


async def test_an_offer_left_open_after_they_signed_up_adds_nobody(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    await _save(post, _BOB, "warrior.fury")
    card = await post(pick(event, _BOB, "Bob"))
    await sign_up(db, event, _BOB, "Bob", "mage.frost")
    fake_discord.clear()

    stale = await post(tap(event, "addt", _BOB, "warrior.fury", on=card))
    assert card_lines(stale)[1] == raid_manage_copy.already_on("**Bob**")
    assert card_description(stale) == "**Bob** is in as **Frost Mage**."
    assert fake_discord.calls == []
