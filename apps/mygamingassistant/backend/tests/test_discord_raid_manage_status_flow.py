"""Manage sign-ups' status row, tapped: moves made at once, moves reviewed first, the DMs and the queue.

Through POST /discord/interactions with the helpers in
``discord_raid_manage_harness.py``; the cards' builders are in
``test_discord_raid_manage_status.py``.
"""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.wow import wow_raid_signup_repo
from app.services.discord import raid_copy, raid_manage_copy
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
    raid_line_of,
    sign_up,
    signup_row,
    starts_unix,
    tap,
)

_BOB = "300000000000000001"
_CY = "300000000000000003"
_DI = "300000000000000004"
_MARKS = ("confirmed", "late", "tentative", "bench")


def _card_ids(event: object, user_id: str) -> list[str]:
    """A player card's ids on the raid: the class menu, the status row, [Remove] and [Back]."""
    return [
        ml(event, "class", user_id),
        *(ml(event, "mark", user_id, status) for status in _MARKS),
        ml(event, "ask", user_id),
        ml(event, "open"),
    ]


async def test_late_and_the_bench_change_at_once_and_tell_nobody(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    await sign_up(db, event, _BOB, "Bob", "warrior.fury")
    await sign_up(db, event, _CY, "Cy", "priest.holy", status="tentative")
    bob = await signup_row(db, event, _BOB)
    assert bob is not None
    signed_up_at = bob.signed_up_at

    card = await post(pick(event, _BOB, "Bob"))
    assert custom_ids(card) == _card_ids(event, _BOB)

    # --- [Late]: still his seat, so no review and no DM; the post shows it
    late = await post(tap(event, "mark", _BOB, "late", on=card))
    assert late["type"] == 7
    assert card_lines(late) == [raid_line_of(event), "**Bob** has a seat and is marked **late**."]
    assert card_description(late) == "**Bob** is in as **Fury Warrior** and marked **late**."
    bob = await signup_row(db, event, _BOB)
    assert bob is not None
    assert (bob.status, bob.signed_up_at) == ("late", signed_up_at)
    assert fake_discord.public_edits()
    assert fake_discord.dms_to(_BOB) == []

    # --- Cy from tentative to the bench: no seat either way
    card = await post(pick(event, _CY, "Cy"))
    benched = await post(tap(event, "mark", _CY, "bench", on=card))
    assert card_lines(benched)[1] == "**Cy** is on the **bench**."
    cy = await signup_row(db, event, _CY)
    assert cy is not None and cy.status == "bench"
    assert fake_discord.dms_to(_CY) == []

    # --- [Late] again, from the card before: nothing to do
    fake_discord.clear()
    again = await post(tap(event, "mark", _BOB, "late", on=late))
    assert card_lines(again)[1] == "Nothing changed. **Bob** has a seat and is marked **late**."
    assert fake_discord.calls == []


async def test_benching_a_seat_holder_asks_first_then_the_queue_moves_up(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    await fill_seats(db, event, 4)
    await sign_up(db, event, _BOB, "Bob", "warrior.fury")
    await sign_up(db, event, _CY, "Cy", "rogue.combat", status="queued")

    card = await post(pick(event, _BOB, "Bob"))
    review = await post(tap(event, "mark", _BOB, "bench", on=card))
    assert review["type"] == 7
    assert card_description(review) == (
        "Move **Bob** (**Fury Warrior**) to the **bench**?\nTheir seat goes to the next player in the queue."
    )
    assert custom_ids(review) == [ml(event, "markt", _BOB, "bench"), ml(event, "markq", _BOB, "bench"), ml(event, "card", _BOB)]
    bob = await signup_row(db, event, _BOB)
    assert bob is not None and bob.status == "confirmed"
    assert fake_discord.calls == []

    # --- [Back] is his card again
    back = await post(tap(event, "card", _BOB, on=review))
    assert custom_ids(back) == _card_ids(event, _BOB)

    # --- [Move and tell them]: Bob benched and told; Cy moves up and is told too
    moved = await post(tap(event, "markt", _BOB, "bench", on=review))
    assert card_lines(moved) == [
        raid_line_of(event),
        "**Bob** is on the **bench**. **Cy** moved up from the queue.",
        raid_manage_copy.DM_SENDING,
    ]
    assert card_description(moved).split("\n") == [
        "**Bob** is on the **bench** as **Fury Warrior**.",
        raid_manage_copy.SEAT_QUEUES,
    ]
    bob = await signup_row(db, event, _BOB)
    cy = await signup_row(db, event, _CY)
    assert bob is not None and bob.status == "bench"
    assert cy is not None and cy.status == "confirmed"
    (dm,) = fake_discord.dms_to(_BOB)
    assert dm.body is not None
    assert dm.body["content"] == raid_manage_copy.moved_dm(
        ORGANISER, RAID_NAME, starts_unix(event), "Fury Warrior", "bench", None, POST_LINK, signups_open=True
    )
    (promoted,) = fake_discord.dms_to(_CY)
    assert promoted.body is not None
    assert promoted.body["content"] == raid_copy.promoted_dm(RAID_NAME, starts_unix(event), POST_LINK)
    assert fake_discord.public_edits()


async def test_a_seat_on_a_full_raid_is_reviewed_as_the_queue_and_queues(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    await fill_seats(db, event, 5)
    await sign_up(db, event, _CY, "Cy", "rogue.combat", status="queued")
    await sign_up(db, event, _BOB, "Bob", "warrior.fury", status="bench")

    # --- the card says [Seat] queues him; [Late] is greyed out
    card = await post(pick(event, _BOB, "Bob"))
    assert card_description(card).split("\n") == [
        "**Bob** is on the **bench** as **Fury Warrior**.",
        raid_manage_copy.SEAT_QUEUES,
    ]
    review = await post(tap(event, "mark", _BOB, "confirmed", on=card))
    assert card_description(review) == (
        "Give **Bob** a seat as **Fury Warrior**?\nThe raid is full, so they'd be **#2 in the queue**."
    )

    # --- [Move and tell them]: second in the queue, and his DM says so
    queued = await post(tap(event, "markt", _BOB, "confirmed", on=review))
    assert card_lines(queued)[1:] == ["The raid is full, so **Bob** is **#2 in the queue**.", raid_manage_copy.DM_SENDING]
    assert card_description(queued) == f"**Bob** is **#2 in the queue** as **Fury Warrior**.\n{raid_manage_copy.QUEUE_WAITS}"
    bob = await signup_row(db, event, _BOB)
    assert bob is not None and bob.status == "queued"
    (dm,) = fake_discord.dms_to(_BOB)
    assert dm.body is not None
    assert dm.body["content"] == raid_manage_copy.moved_dm(
        ORGANISER, RAID_NAME, starts_unix(event), "Fury Warrior", "queued", 2, POST_LINK, signups_open=True
    )


async def test_a_move_over_a_limit_says_so_and_still_happens(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    event.class_limits = {"warrior": 1}
    await db.flush()
    await sign_up(db, event, _DI, "Di", "warrior.arms")
    await sign_up(db, event, _BOB, "Bob", "warrior.fury", status="tentative")
    hit = LimitHit("class", "warrior", 1, 1)

    card = await post(pick(event, _BOB, "Bob"))
    review = await post(tap(event, "mark", _BOB, "confirmed", on=card))
    assert card_description(review).split("\n")[1] == raid_manage_copy.over_limit_ok(hit)
    moved = await post(tap(event, "markq", _BOB, "confirmed", on=review))
    assert card_lines(moved)[1:] == ["**Bob** has a seat.", raid_manage_copy.moved_over(hit)]
    assert fake_discord.dms_to(_BOB) == []


async def test_a_player_with_dms_off_or_the_leader_themself_is_just_moved(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    await sign_up(db, event, _BOB, "Bob", "warrior.fury")
    card = await post(pick(event, _BOB, "Bob"))
    stale = await post(tap(event, "mark", _BOB, "tentative", on=card))
    assert custom_ids(stale)[0] == ml(event, "markt", _BOB, "tentative")
    response = await post(command("raid", "prefs", user_id=_BOB, permissions=0, spec="warrior.fury", dm_reminders=False))
    assert "Saved." in content(response)

    # --- the review says so, and only moves
    review = await post(tap(event, "mark", _BOB, "tentative", on=card))
    assert card_description(review).split("\n")[-1] == raid_manage_copy.dm_off("**Bob**")
    assert custom_ids(review) == [ml(event, "markq", _BOB, "tentative"), ml(event, "card", _BOB)]

    # --- [Move and tell them] on the review from before: moved, and no DM
    fake_discord.clear()
    moved = await post(tap(event, "markt", _BOB, "tentative", on=stale))
    assert card_lines(moved)[1:] == ["**Bob** is **tentative**.", raid_manage_copy.dm_off_done("**Bob**")]
    assert fake_discord.dms_to(_BOB) == []

    # --- the leader moving themself: a single [Move], and no DM
    await sign_up(db, event, ORGANISER, "Org", "mage.frost")
    card = await post(pick(event, ORGANISER, "Org"))
    review = await post(tap(event, "mark", ORGANISER, "bench", on=card))
    assert card_description(review) == "Move **Org** (**Frost Mage**) to the **bench**?"
    assert custom_ids(review) == [ml(event, "markq", ORGANISER, "bench"), ml(event, "card", ORGANISER)]
    await post(tap(event, "markt", ORGANISER, "bench", on=review))
    assert fake_discord.dms_to(ORGANISER) == []


async def test_a_card_left_open_moves_the_player_as_they_are_now(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    await sign_up(db, event, _BOB, "Bob", "warrior.fury", status="tentative")
    card = await post(pick(event, _BOB, "Bob"))
    review = await post(tap(event, "mark", _BOB, "confirmed", on=card))

    # --- Bob took a seat himself since: [Move and tell them] changes nothing and tells nobody
    await sign_up(db, event, _BOB, "Bob", "warrior.fury")
    same = await post(tap(event, "markt", _BOB, "confirmed", on=review))
    assert card_lines(same)[1] == "Nothing changed. **Bob** has a seat."
    assert fake_discord.calls == []

    # --- [Late] on the old card is now a late flip: made at once
    late = await post(tap(event, "mark", _BOB, "late", on=card))
    assert card_lines(late)[1] == "**Bob** has a seat and is marked **late**."

    # --- and the old review's [Move and tell them] flips him back: made, but quietly
    flip = await post(tap(event, "markt", _BOB, "confirmed", on=review))
    assert card_lines(flip)[1:] == ["**Bob** has a seat."]
    assert fake_discord.public_edits()
    assert fake_discord.dms_to(_BOB) == []

    # --- removed since: his card says so
    bob = await signup_row(db, event, _BOB)
    assert bob is not None
    await wow_raid_signup_repo.delete(db, bob)
    gone = await post(tap(event, "mark", _BOB, "bench", on=card))
    assert card_lines(gone)[1] == raid_manage_copy.gone_from_raid("**Bob**")
    assert card_description(gone) == raid_manage_copy.not_on_raid("**Bob**")


async def test_a_move_by_hand_for_no_class_or_by_a_non_leader_is_turned_away(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await posted_raid(post, db, fake_discord)
    await wow_raid_signup_repo.upsert_signup(
        db,
        event_id=event.id,
        discord_user_id=_BOB,
        display_name="Bob",
        status="tentative",
        wow_class=None,
        role=None,
        spec=None,
    )
    # No class: nothing to seat him as (the card shows no row).
    response = await post(tap(event, "mark", _BOB, "confirmed"))
    assert content(response) == raid_copy.GENERIC_ERROR

    response = await post(tap(event, "mark", _BOB, "bench", user_id=_CY, permissions=0))
    assert (content(response), custom_ids(response)) == (raid_copy.NOT_LEADER, [])
    bob = await signup_row(db, event, _BOB)
    assert bob is not None and bob.status == "tentative"
    assert fake_discord.calls == []
