"""Manage sign-ups: a seat on a full raid, tapped — the menu of seat holders, the swap and [Queue them instead].

Through POST /discord/interactions with the helpers in
``discord_raid_manage_harness.py``; the cards' builders are in
``test_discord_raid_manage_swap.py``.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.repositories.wow import wow_raid_signup_repo
from app.services.discord import raid_copy, raid_manage_copy
from app.services.wow.raid_limits import LimitHit
from app.services.wow.raid_roster import queue_position

from discord_raid_harness import ORGANISER, FakeDiscord, Post, command, content, custom_ids, modal_submit
from discord_raid_manage_harness import (
    POST_LINK,
    RAID_NAME,
    card_description,
    card_lines,
    fill_seats,
    ml,
    pick,
    posted_raid,
    raid_line_of,
    sign_up,
    signup_row,
    starts_unix,
    tap,
)

_BOB = "300000000000000001"
_CY = "300000000000000003"
_DI = "300000000000000004"
_MAGE0 = "300000000000000100"
_MAGE1 = "300000000000000101"
_MAGE2 = "300000000000000102"


async def _full_raid(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> WowRaidEvent:
    """The five seats taken by Mage0 to Mage4, Cy queued, and Bob on the bench."""
    event = await posted_raid(post, db, fake_discord)
    await fill_seats(db, event, 5)
    await sign_up(db, event, _CY, "Cy", "rogue.combat", status="queued")
    await sign_up(db, event, _BOB, "Bob", "warrior.fury", status="bench")
    return event


async def _menu(post: Post, event: WowRaidEvent, user_id: str = _BOB, name: str = "Bob") -> dict[str, Any]:
    """The player's card, then its [Seat]: the menu of seat holders."""
    card = await post(pick(event, user_id, name))
    return await post(tap(event, "mark", user_id, "confirmed", on=card))


async def _review(
    post: Post, event: WowRaidEvent, holder: str, user_id: str = _BOB, name: str = "Bob"
) -> dict[str, Any]:
    """The menu, then *holder* picked in it: the swap review."""
    menu = await _menu(post, event, user_id, name)
    return await post(tap(event, "swap", user_id, on=menu, values=[holder]))


def _swaps(event: WowRaidEvent, member: str, holder: str, *verbs: str) -> list[str]:
    """A review's ids: its swap buttons for *holder*, then [Back] to the menu."""
    return [*(ml(event, verb, member, holder) for verb in verbs), ml(event, "hold", member, "1")]


def _dm_text(fake_discord: FakeDiscord, user_id: str) -> str:
    (dm,) = fake_discord.dms_to(user_id)
    assert dm.body is not None
    return dm.body["content"]


def _moved_dm(event: WowRaidEvent, label: str, status: str, position: int | None, reason: str | None = None) -> str:
    when = starts_unix(event)
    return raid_manage_copy.moved_dm(
        ORGANISER, RAID_NAME, when, label, status, position, POST_LINK, signups_open=True, reason=reason
    )


async def test_a_seat_on_a_full_raid_is_a_seat_holders_and_the_swap_moves_nobody_else(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _full_raid(post, db, fake_discord)
    event.signup_notes_enabled = True
    await db.flush()
    for user_id, note in ((_MAGE2, "Leaving at 9"), (_BOB, "Can tank")):
        row = await signup_row(db, event, user_id)
        assert row is not None
        await wow_raid_signup_repo.set_note(db, row, note)
    mage2 = await signup_row(db, event, _MAGE2)
    assert mage2 is not None
    seat_at = mage2.signed_up_at

    # --- [Seat]: who goes to the bench, numbered as on the post
    menu = await _menu(post, event)
    assert menu["type"] == 7
    assert card_description(menu).split("\n") == [
        raid_manage_copy.holders_prompt("**Bob**", "Fury Warrior"),
        raid_manage_copy.RAISE_INSTEAD,
    ]
    [select] = menu["data"]["components"][0]["components"]
    assert [option["label"] for option in select["options"]] == [f"{n + 1}. Mage{n}" for n in range(5)]
    assert custom_ids(menu) == [ml(event, "swap", _BOB), ml(event, "queue", _BOB), ml(event, "card", _BOB)]

    # --- Mage2 picked: the review, with the note the swap clears; nothing changes yet
    review = await post(tap(event, "swap", _BOB, on=menu, values=[_MAGE2]))
    assert card_description(review).split("\n") == [
        raid_manage_copy.swap_prompt("**Bob**", "Fury Warrior", "**Mage2**", "Frost Mage"),
        raid_manage_copy.holder_note("**Mage2**", "Leaving at 9"),
    ]
    assert custom_ids(review) == _swaps(event, _BOB, _MAGE2, "swapt", "swapq", "swapr")
    back = await post(tap(event, "hold", _BOB, "1", on=review))
    assert custom_ids(back) == custom_ids(menu)
    assert fake_discord.calls == []

    # --- [Swap and tell them]: Bob in at Mage2's number, Mage2 benched, both told; Cy still waits first
    swapped = await post(tap(event, "swapt", _BOB, _MAGE2, on=review))
    assert card_lines(swapped) == [
        raid_line_of(event),
        raid_manage_copy.swapped("**Bob**", "**Mage2**"),
        raid_manage_copy.DM_SENDING,
    ]
    assert card_description(swapped) == "**Bob** is in as **Fury Warrior**."
    bob = await signup_row(db, event, _BOB)
    mage2 = await signup_row(db, event, _MAGE2)
    assert bob is not None and mage2 is not None
    assert (bob.status, bob.signed_up_at, bob.note) == ("confirmed", seat_at, None)
    assert (mage2.status, mage2.signed_up_at, mage2.note) == ("bench", seat_at, None)
    assert queue_position(await wow_raid_signup_repo.list_for_event(db, event.id), _CY) == 1
    assert fake_discord.dms_to(_CY) == []
    assert _dm_text(fake_discord, _BOB) == _moved_dm(event, "Fury Warrior", "confirmed", None)
    assert _dm_text(fake_discord, _MAGE2) == _moved_dm(event, "Frost Mage", "bench", None)
    assert fake_discord.public_edits()


async def test_a_queued_player_swapped_in_leaves_the_next_one_first_and_has_no_queue_them_instead(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _full_raid(post, db, fake_discord)
    await sign_up(db, event, _DI, "Di", "priest.holy", status="queued")

    menu = await _menu(post, event, _CY, "Cy")
    assert custom_ids(menu) == [ml(event, "swap", _CY), ml(event, "card", _CY)]
    review = await post(tap(event, "swap", _CY, on=menu, values=[_MAGE0]))
    swapped = await post(tap(event, "swapq", _CY, _MAGE0, on=review))
    assert card_lines(swapped)[1:] == [raid_manage_copy.swapped("**Cy**", "**Mage0**")]
    signups = await wow_raid_signup_repo.list_for_event(db, event.id)
    assert [queue_position(signups, user_id) for user_id in (_CY, _DI)] == [None, 1]
    cy = await signup_row(db, event, _CY)
    assert cy is not None and cy.status == "confirmed"
    assert (fake_discord.dms_to(_CY), fake_discord.dms_to(_MAGE0)) == ([], [])
    assert fake_discord.public_edits()


async def test_swap_and_say_why_opens_a_form_and_only_the_benched_player_reads_the_reason(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _full_raid(post, db, fake_discord)
    review = await _review(post, event, _MAGE2)

    form = await post(tap(event, "swapr", _BOB, _MAGE2, on=review))
    assert form["type"] == 9
    assert form["data"]["custom_id"] == ml(event, "swapr", _BOB, _MAGE2)
    [field] = form["data"]["components"]
    assert field["description"] == raid_manage_copy.SWAP_REASON_HINT
    assert fake_discord.calls == []

    payload = modal_submit(ml(event, "swapr", _BOB, _MAGE2), {"value": "  Need a   tank "})
    payload["message"] = review["data"]
    swapped = await post(payload)
    assert card_lines(swapped)[1:] == [raid_manage_copy.swapped("**Bob**", "**Mage2**"), raid_manage_copy.DM_SENDING]
    assert _dm_text(fake_discord, _BOB) == _moved_dm(event, "Fury Warrior", "confirmed", None)
    assert _dm_text(fake_discord, _MAGE2) == _moved_dm(event, "Frost Mage", "bench", None, reason="Need a tank")

    # --- the form sent again, or its button tapped again: Bob has a seat, so nothing changes
    fake_discord.clear()
    for again in (payload, tap(event, "swapr", _BOB, _MAGE2, on=review)):
        card = await post(again)
        assert card_lines(card)[1] == raid_manage_copy.status_unchanged("**Bob**", "confirmed", None)
    assert fake_discord.calls == []


async def test_a_player_with_dms_off_or_the_leader_benching_themself_gets_no_dm(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    await fill_seats(db, event, 4)
    await sign_up(db, event, ORGANISER, "Org", "mage.frost")
    await sign_up(db, event, _BOB, "Bob", "warrior.fury", status="bench")
    await sign_up(db, event, _DI, "Di", "priest.holy", status="tentative")
    response = await post(command("raid", "prefs", user_id=_BOB, permissions=0, dm_reminders=False))
    assert "Saved." in content(response)

    # --- Bob's DMs are off: the review says so; told, only Mage1 gets a DM
    review = await _review(post, event, _MAGE1)
    assert card_description(review).split("\n")[1:] == [raid_manage_copy.dm_off("**Bob**")]
    assert custom_ids(review) == _swaps(event, _BOB, _MAGE1, "swapt", "swapq", "swapr")
    swapped = await post(tap(event, "swapt", _BOB, _MAGE1, on=review))
    assert card_lines(swapped)[1:] == [
        raid_manage_copy.swapped("**Bob**", "**Mage1**"),
        raid_manage_copy.DM_SENDING,
        raid_manage_copy.dm_off_done("**Bob**"),
    ]
    assert fake_discord.dms_to(_BOB) == []
    assert _dm_text(fake_discord, _MAGE1) == _moved_dm(event, "Frost Mage", "bench", None)

    # --- the leader giving Di their own seat: no [Swap and say why], and no DM to themself
    review = await _review(post, event, ORGANISER, _DI, "Di")
    assert custom_ids(review) == _swaps(event, _DI, ORGANISER, "swapt", "swapq")
    swapped = await post(tap(event, "swapt", _DI, ORGANISER, on=review))
    assert card_lines(swapped)[1:] == [raid_manage_copy.swapped("**Di**", "**Org**"), raid_manage_copy.DM_SENDING]
    assert fake_discord.dms_to(ORGANISER) == []
    assert _dm_text(fake_discord, _DI) == _moved_dm(event, "Holy Priest", "confirmed", None)


async def test_a_menu_or_review_left_open_answers_with_where_things_stand(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _full_raid(post, db, fake_discord)
    review = await _review(post, event, _MAGE2)

    # --- Mage2 benched since (Cy has the seat): the menu again, saying so
    mage2 = await signup_row(db, event, _MAGE2)
    cy = await signup_row(db, event, _CY)
    assert mage2 is not None and cy is not None
    mage2.status, cy.status = "bench", "confirmed"
    await db.flush()
    menu = await post(tap(event, "swapt", _BOB, _MAGE2, on=review))
    assert card_lines(menu)[1] == raid_manage_copy.holder_lost_seat("**Mage2**")
    assert custom_ids(menu)[0] == ml(event, "swap", _BOB)

    # --- then removed: named by a mention, as nothing names them now
    await wow_raid_signup_repo.delete(db, mage2)
    menu = await post(tap(event, "swap", _BOB, on=review, values=[_MAGE2]))
    assert card_lines(menu)[1] == raid_manage_copy.holder_lost_seat(f"<@{_MAGE2}>")

    # --- a seat free since (the size raised): Bob's card, and no swap
    event.size_cap = 6
    await db.flush()
    card = await post(tap(event, "swapq", _BOB, _MAGE0, on=review))
    assert card_lines(card)[1] == raid_manage_copy.SEAT_OPENED
    assert ml(event, "mark", _BOB, "confirmed") in custom_ids(card)

    # --- Bob took it himself, then left
    await sign_up(db, event, _BOB, "Bob", "warrior.fury")
    card = await post(tap(event, "hold", _BOB, "1", on=review))
    assert card_lines(card)[1] == raid_manage_copy.status_unchanged("**Bob**", "confirmed", None)
    bob = await signup_row(db, event, _BOB)
    assert bob is not None
    await wow_raid_signup_repo.delete(db, bob)
    card = await post(tap(event, "swapt", _BOB, _MAGE0, on=review))
    assert card_lines(card)[1] == raid_manage_copy.gone_from_raid("**Bob**")
    mage0 = await signup_row(db, event, _MAGE0)
    assert mage0 is not None and mage0.status == "confirmed"
    assert fake_discord.calls == []


async def test_a_seat_review_from_before_the_raid_filled_moves_nobody(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    await fill_seats(db, event, 4)
    await sign_up(db, event, _BOB, "Bob", "warrior.fury", status="tentative")
    card = await post(pick(event, _BOB, "Bob"))
    review = await post(tap(event, "mark", _BOB, "confirmed", on=card))
    assert custom_ids(review)[0] == ml(event, "markt", _BOB, "confirmed")

    await sign_up(db, event, _DI, "Di", "priest.holy")
    menu = await post(tap(event, "markt", _BOB, "confirmed", on=review))
    assert card_lines(menu)[1] == raid_manage_copy.NOBODY_MOVED
    assert custom_ids(menu)[0] == ml(event, "swap", _BOB)
    bob = await signup_row(db, event, _BOB)
    assert bob is not None and bob.status == "tentative"
    assert fake_discord.calls == []


async def test_a_swap_over_a_limit_says_so_and_still_happens(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    event.class_limits = {"warrior": 1}
    await db.flush()
    await fill_seats(db, event, 4)
    await sign_up(db, event, _DI, "Di", "warrior.arms")
    await sign_up(db, event, _BOB, "Bob", "warrior.fury", status="bench")
    hit = LimitHit("class", "warrior", 1, 1)

    review = await _review(post, event, _MAGE0)
    assert card_description(review).split("\n")[1:] == [raid_manage_copy.over_limit_ok(hit)]
    swapped = await post(tap(event, "swapq", _BOB, _MAGE0, on=review))
    assert card_lines(swapped)[1:] == [
        raid_manage_copy.swapped("**Bob**", "**Mage0**"),
        raid_manage_copy.moved_over(hit),
    ]
    bob = await signup_row(db, event, _BOB)
    assert bob is not None and bob.status == "confirmed"


async def test_past_25_seat_holders_the_menu_pages(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    event = await posted_raid(post, db, fake_discord)
    event.size_cap = 26
    await db.flush()
    await fill_seats(db, event, 26)
    await sign_up(db, event, _BOB, "Bob", "warrior.fury", status="bench")

    menu = await _menu(post, event)
    assert custom_ids(menu)[1:3] == [ml(event, "hold", _BOB, "1"), ml(event, "hold", _BOB, "2")]
    page = await post(tap(event, "hold", _BOB, "2", on=menu))
    [select] = page["data"]["components"][0]["components"]
    assert (select["placeholder"], [o["label"] for o in select["options"]]) == (
        raid_manage_copy.holder_page(26, 26, 26),
        ["26. Mage25"],
    )


async def test_a_swap_for_no_class_by_a_non_leader_or_on_a_cancelled_raid_is_turned_away(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _full_raid(post, db, fake_discord)
    response = await post(tap(event, "swap", _BOB, values=[_MAGE2], user_id="300000000000000009", permissions=0))
    assert (content(response), custom_ids(response)) == (raid_copy.NOT_LEADER, [])

    # No class: nothing to seat them as (their card shows no [Seat]).
    await wow_raid_signup_repo.upsert_signup(
        db,
        event_id=event.id,
        discord_user_id=_DI,
        display_name="Di",
        status="bench",
        wow_class=None,
        role=None,
        spec=None,
    )
    response = await post(tap(event, "hold", _DI, "1"))
    assert content(response) == raid_copy.GENERIC_ERROR

    event.status = "cancelled"
    await db.flush()
    response = await post(tap(event, "swapq", _BOB, _MAGE2))
    assert (content(response), custom_ids(response)) == (raid_manage_copy.GONE, [])
    bob = await signup_row(db, event, _BOB)
    assert bob is not None and bob.status == "bench"
    assert fake_discord.calls == []


async def test_queue_them_instead_reviews_a_place_in_the_queue_and_queues(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _full_raid(post, db, fake_discord)
    menu = await _menu(post, event)

    review = await post(tap(event, "queue", _BOB, on=menu))
    assert card_description(review).split("\n") == [
        "Give **Bob** a seat as **Fury Warrior**?",
        raid_manage_copy.would_queue(2),
    ]
    moves = [ml(event, verb, _BOB, "queued") for verb in ("markt", "markq", "markr")]
    assert custom_ids(review) == [*moves, ml(event, "hold", _BOB, "1")]
    back = await post(tap(event, "hold", _BOB, "1", on=review))
    assert custom_ids(back) == custom_ids(menu)
    assert fake_discord.calls == []

    # --- [Move and tell them]: in the queue behind Cy, and told so
    moved = await post(tap(event, "markt", _BOB, "queued", on=review))
    assert card_lines(moved)[1:] == [raid_manage_copy.moved("**Bob**", "queued", 2), raid_manage_copy.DM_SENDING]
    bob = await signup_row(db, event, _BOB)
    assert bob is not None and bob.status == "queued"
    assert _dm_text(fake_discord, _BOB) == _moved_dm(event, "Fury Warrior", "queued", 2)

    # --- queued now: the old buttons change nothing, and his menu has no [Queue them instead]
    fake_discord.clear()
    for verb, arg in (("queue", "-"), ("markt", "queued")):
        card = await post(tap(event, verb, _BOB, arg, on=review))
        assert card_lines(card)[1] == raid_manage_copy.status_unchanged("**Bob**", "queued", 2)
    assert fake_discord.calls == []
    menu = await _menu(post, event)
    assert custom_ids(menu) == [ml(event, "swap", _BOB), ml(event, "card", _BOB)]
