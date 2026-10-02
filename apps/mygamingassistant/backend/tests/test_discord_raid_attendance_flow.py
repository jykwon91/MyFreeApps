"""Raid attendance end to end: Raid: Signed → [Attendance], its card and player card, /raid attendance and
/raid-admin attendance, through POST /discord/interactions with the harness in ``discord_raid_harness.py``.

Raids, sign-ups and recorded rows are written straight to the repositories
(``discord_attendance_steps``): the sign-up buttons and the worker's sweep
have their own tests.  The exports are in ``test_discord_raid_export_flow.py``.
"""
from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest
from platform_shared.services.discord import MANAGE_EVENTS
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.repositories.wow import wow_raid_attendance_repo, wow_raid_guild_repo
from app.services.discord import raid_attendance_copy, raid_copy, raid_edit_views
from app.services.discord.commands_spec import SIGNED_MENU
from app.services.wow import raid_attendance_service, raid_custom_id
from app.services.wow.raid_attendance import SETTABLE_OUTCOMES, WindowQuery
from app.services.wow.raid_catalog import raid_name
from app.services.wow.raid_custom_id import NO_ARG

import discord_attendance_steps as steps
from discord_raid_harness import (
    CHANNEL,
    ORGANISER,
    ORGANISER_PERMS,
    Post,
    assert_ephemeral,
    click,
    command,
    content,
    create_and_post,
    custom_ids,
    menu_command,
    pick_user,
    resolved_member,
    setup_guild,
)

pytestmark = pytest.mark.asyncio

_COPY = raid_attendance_copy
_MENUS_25 = [_COPY.player_menu(1, 25), _COPY.player_menu(26, 50), _COPY.player_menu(51, 75)]


def _id(event: WowRaidEvent, verb: str, *ids: str) -> str:
    return raid_custom_id.attendance(event.id, verb, *ids)


def _embed(response: dict[str, Any]) -> dict[str, Any]:
    return response["data"]["embeds"][0]


def _lines(response: dict[str, Any]) -> list[str]:
    return _embed(response)["description"].splitlines()


def _disabled(response: dict[str, Any], custom_id: str) -> bool:
    (found,) = [c for row in response["data"]["components"] for c in row["components"] if c["custom_id"] == custom_id]
    return found.get("disabled", False)


def _raid_line(event: WowRaidEvent) -> str:
    return f"**Onyxia's Lair** · <t:{steps.unix(event.starts_at)}:F>"


def _due(event: WowRaidEvent) -> int:
    return steps.unix(event.starts_at + timedelta(hours=6))


def _add(event: WowRaidEvent, picks: dict[str, str], *, bots: tuple[str, ...] = ()) -> dict[str, Any]:
    """The walk-in menu's pick: *picks* (user id → name) and *bots*, as Discord resolves them."""
    ids = [*picks, *bots]
    payload = pick_user(_id(event, "add"), ids[0], picked_name="-")
    resolved: dict[str, dict[str, Any]] = {"users": {}, "members": {}}
    for user_id in ids:
        one = resolved_member(user_id, picks.get(user_id, "Bot"), bot=user_id in bots)
        resolved["users"].update(one["users"])
        resolved["members"].update(one["members"])
    payload["data"].update(values=ids, resolved=resolved)
    return payload


# ---------------------------------------------------------------------------
# Raid: Signed → [Attendance], and the card before it's recorded
# ---------------------------------------------------------------------------


async def test_raid_signed_shows_attendance_once_the_raid_has_started(post: Post, db: AsyncSession) -> None:
    await setup_guild(post)
    event = await create_and_post(post, db)
    attendance = _id(event, "open")
    assert attendance not in custom_ids(await post(menu_command(SIGNED_MENU, "m1")))

    event.start_applied_at = steps.now()
    await db.flush()
    started = custom_ids(await post(menu_command(SIGNED_MENU, "m1")))
    assert started[-1] == attendance
    assert raid_custom_id.manage(event.id, "open") in started

    event.status = "completed"
    await db.flush()
    assert custom_ids(await post(menu_command(SIGNED_MENU, "m1"))) == [attendance]


async def test_before_its_recorded_the_card_previews_the_sign_ups(post: Post, db: AsyncSession) -> None:
    guild = await steps.guild(post, db)
    on = await steps.raid(db, guild, hours_ago=1, status="scheduled", signups={1: "confirmed", 2: "late", 3: "absence"})

    card = await post(steps.at(on, "open"))
    assert card["type"] == 7
    assert _embed(card)["title"] == _COPY.CARD_TITLE
    assert _lines(card) == [_raid_line(on), _COPY.records_at(_due(on)), _COPY.COUNTED, "", "Attended 1 · Late 1 · Absent 1"]
    assert custom_ids(card) == [_id(on, "record"), _id(on, "nocount"), _id(on, "csv")]

    done = await steps.raid(db, guild)
    finished = await post(steps.at(done, "open"))
    assert _lines(finished)[1:] == [_COPY.RECORDING, _COPY.COUNTED, "", _COPY.NOBODY_LISTED]
    assert custom_ids(finished) == [_id(done, "nocount"), _id(done, "csv")]


async def test_record_now_freezes_a_started_raid_once(post: Post, db: AsyncSession) -> None:
    guild = await steps.guild(post, db)
    later = await steps.raid(db, guild, hours_ago=-240, status="scheduled", signups={1: "confirmed"})
    assert content(await post(steps.at(later, "record"))) == _COPY.NOT_STARTED
    await db.refresh(later)
    assert later.attendance_recorded_at is None

    on = await steps.raid(db, guild, hours_ago=1, status="scheduled", signups={1: "confirmed", 2: "bench"})
    card = await post(steps.at(on, "record"))
    await db.refresh(on)
    assert on.attendance_recorded_at is not None
    assert content(card) == ""
    assert _lines(card) == [
        _raid_line(on),
        _COPY.recorded_at(steps.unix(on.attendance_recorded_at)),
        _COPY.RECORDED_EARLY,
        _COPY.COUNTED,
        "",
        f"{_COPY.group_heading('attended', 1)} Player01",
        f"{_COPY.group_heading('standby', 1)} Player02",
    ]
    rows = await raid_attendance_service.raid_record(db, on)
    assert {row.discord_user_id: row.outcome for row in rows} == {steps.member(1): "attended", steps.member(2): "standby"}

    assert content(await post(steps.at(on, "record"))) == _COPY.ALREADY_RECORDED


# ---------------------------------------------------------------------------
# The recorded card: its menus, the player card, walk-ins, counting
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("players", "menus"),
    [(25, [_COPY.PLAYER_MENU]), (26, [_MENUS_25[0], _COPY.player_menu(26, 26)]), (51, [*_MENUS_25[:2], _COPY.player_menu(51, 51)]), (76, _MENUS_25)],
)
async def test_the_recorded_card_has_a_player_menu_per_25(
    post: Post, db: AsyncSession, players: int, menus: list[str]
) -> None:
    event = await steps.recorded(db, await steps.guild(post, db), players)

    card = await post(steps.at(event, "open"))
    selects = [c for row in card["data"]["components"] for c in row["components"] if c["type"] == 3]
    assert [s["placeholder"] for s in selects] == menus
    assert [s["custom_id"] for s in selects] == [_id(event, "who", NO_ARG, str(n)) for n in range(1, len(menus) + 1)]
    assert sum(len(s["options"]) for s in selects) == min(players, 75)
    assert custom_ids(card)[len(menus) :] == [_id(event, "add"), _id(event, "nocount"), _id(event, "csv")]
    assert (_COPY.MENU_CAPPED in _lines(card)) == (players > 75)
    assert _lines(card)[-1].startswith(_COPY.group_heading("attended", players))


async def test_a_player_card_changes_how_they_are_marked(post: Post, db: AsyncSession) -> None:
    one = steps.member(1)
    event = await steps.recorded(db, await steps.guild(post, db), signups={1: "confirmed", 2: "tentative"})

    card = await post(steps.at(event, "who", NO_ARG, "1", values=[one]))
    assert card["type"] == 7
    outcomes = [_id(event, "set", one, outcome) for outcome in SETTABLE_OUTCOMES]
    assert custom_ids(card) == [*outcomes, _id(event, "open")]  # signed up: no [Remove]
    assert [_disabled(card, cid) for cid in outcomes] == [o == "attended" for o in SETTABLE_OUTCOMES]
    assert _lines(card) == [_raid_line(event), _COPY.player_heading("Player01", one, "attended"), _COPY.signed_as("confirmed")]

    marked = await post(steps.at(event, "set", one, "no_show"))
    assert content(marked) == _COPY.marked("Player01", "no_show")
    row = await wow_raid_attendance_repo.get(db, event_id=event.id, discord_user_id=one)
    assert row is not None and row.marked_at is not None
    assert (row.outcome, row.marked_by_user_id) == ("no_show", ORGANISER)
    again = await post(steps.at(event, "who", NO_ARG, "1", values=[one]))
    assert _lines(again)[2:] == [_COPY.signed_as("confirmed"), _COPY.changed_by(ORGANISER, steps.unix(row.marked_at))]

    stranger = steps.member(9)
    gone = await post(steps.at(event, "who", NO_ARG, "1", values=[stranger]))
    assert content(gone) == _COPY.not_listed(f"<@{stranger}>")
    assert _embed(gone)["title"] == _COPY.CARD_TITLE


async def test_walk_ins_go_in_attended_and_only_they_can_be_removed(post: Post, db: AsyncSession) -> None:
    one, walk, bot = steps.member(1), steps.member(9), steps.member(8)
    event = await steps.raid(db, await steps.guild(post, db), signups={1: "confirmed"})
    early = await post(_add(event, {walk: "Walk"}))
    assert content(early) == _COPY.not_recorded_yet(_due(event))
    await raid_attendance_service.record(db, event, steps.now())

    added = await post(_add(event, {one: "Player01", walk: "Walk"}, bots=(bot,)))
    assert content(added) == "\n".join(
        [_COPY.added(["Walk"]), _COPY.already_listed(["Player01"]), _COPY.SKIPPED_BOTS]
    )
    row = await wow_raid_attendance_repo.get(db, event_id=event.id, discord_user_id=walk)
    assert row is not None and row.marked_at is not None
    assert (row.outcome, row.signup_status, row.marked_by_user_id, row.display_name) == ("attended", None, ORGANISER, "Walk")
    assert row.created_at == row.marked_at
    assert await wow_raid_attendance_repo.get(db, event_id=event.id, discord_user_id=bot) is None

    card = await post(steps.at(event, "who", NO_ARG, "1", values=[walk]))
    assert _lines(card)[2:] == [_COPY.added_by(ORGANISER, steps.unix(row.marked_at))]
    assert custom_ids(card)[-1] == _id(event, "drop", walk)

    kept = await post(steps.at(event, "drop", one))
    assert content(kept) == _COPY.cant_remove_signup("Player01")
    removed = await post(steps.at(event, "drop", walk))
    assert content(removed) == _COPY.removed("Walk")
    assert await wow_raid_attendance_repo.get(db, event_id=event.id, discord_user_id=walk) is None


async def test_a_raid_can_stop_and_start_counting(post: Post, db: AsyncSession) -> None:
    event = await steps.recorded(db, await steps.guild(post, db), 1)

    off = await post(steps.at(event, "nocount"))
    assert content(off) == _COPY.NOW_NOT_COUNTED
    assert _COPY.NOT_COUNTED in _lines(off)
    assert _id(event, "count") in custom_ids(off)
    await db.refresh(event)
    assert event.attendance_counted is False

    on = await post(steps.at(event, "count"))
    assert content(on) == _COPY.NOW_COUNTED
    await db.refresh(event)
    assert event.attendance_counted is True


async def test_only_its_leader_or_a_manager_opens_a_raids_attendance(post: Post, db: AsyncSession) -> None:
    guild = await steps.guild(post, db)
    event = await steps.recorded(db, guild, 1)
    someone = steps.member(7)

    stranger = await post(steps.at(event, "open", user_id=someone, permissions=0))
    assert (stranger["type"], content(stranger)) == (7, raid_copy.NOT_LEADER)
    manager = await post(steps.at(event, "open", user_id=someone, permissions=MANAGE_EVENTS))
    assert _embed(manager)["title"] == _COPY.CARD_TITLE

    other = await wow_raid_guild_repo.upsert_config(db, discord_guild_id="800000000000000009", raid_channel_id=CHANNEL)
    for elsewhere in (await steps.recorded(db, other, 1), await steps.raid(db, guild, status="draft")):
        assert content(await post(steps.at(elsewhere, "open"))) == raid_copy.NOT_FOUND


# ---------------------------------------------------------------------------
# /raid attendance and /raid-admin attendance
# ---------------------------------------------------------------------------


async def test_raid_attendance_shows_a_member_their_own_raids_only(post: Post, db: AsyncSession) -> None:
    guild = await steps.guild(post, db)
    two = steps.member(2)
    empty = await post(command("raid", "attendance", user_id=two, permissions=0))
    assert content(empty) == _COPY.NO_COUNTED_RAIDS
    older = await steps.recorded(db, guild, hours_ago=31, signups={1: "confirmed", 2: "confirmed"})
    newer = await steps.recorded(db, guild, hours_ago=8, signups={1: "confirmed"})

    mine = await post(command("raid", "attendance", user_id=two, permissions=0))
    assert_ephemeral(mine)
    assert _embed(mine)["title"] == _COPY.summary_title(2, None)
    first = steps.unix(older.starts_at)
    assert _lines(mine) == [
        f"You made 1 of 2 raids (50%) since your first on <t:{first}:D>, out of the last 2 counted.",
        "",
        _COPY.history_line(steps.unix(newer.starts_at), "Onyxia's Lair", None),
        _COPY.history_line(first, "Onyxia's Lair", "attended"),
    ]
    assert steps.member(1) not in _embed(mine)["description"]

    nobody = await post(command("raid", "attendance", user_id=steps.member(3), permissions=0))
    assert content(nobody) == _COPY.no_history_self(2)


async def test_the_summary_pages_through_every_player(post: Post, db: AsyncSession) -> None:
    guild = await steps.guild(post, db)
    assert content(await post(command("raid-admin", "attendance"))) == _COPY.NO_COUNTED_RAIDS
    await steps.recorded(db, guild, 30)
    query = WindowQuery()
    back, ahead = raid_custom_id.summary("page", query, "1"), raid_custom_id.summary("page", query, "2")

    first = await post(command("raid-admin", "attendance"))
    assert_ephemeral(first)
    assert custom_ids(first) == [back, ahead, raid_custom_id.summary("csv", query)]
    assert (_disabled(first, back), _disabled(first, ahead)) == (True, False)
    assert _embed(first)["title"] == _COPY.summary_title(1, None)
    assert _embed(first)["footer"]["text"] == _COPY.page_footer(1, 2, 30)
    assert "**Player01**" in _embed(first)["description"]

    second = await post(click(ahead, user_id=ORGANISER, permissions=ORGANISER_PERMS))
    assert second["type"] == 7
    assert (_disabled(second, back), _disabled(second, ahead)) == (False, True)
    assert _embed(second)["footer"]["text"] == _COPY.page_footer(2, 2, 30)
    assert "**Player26**" in _embed(second)["description"]

    far = await post(click(raid_custom_id.summary("page", query, "99"), user_id=ORGANISER, permissions=ORGANISER_PERMS))
    assert _embed(far)["footer"]["text"] == _COPY.page_footer(2, 2, 30)
    refused = await post(click(ahead, user_id=steps.member(5), permissions=0))
    assert content(refused) == raid_copy.NOT_PERMITTED_EVENTS


async def test_admin_attendance_narrows_by_raid_count_player_and_bench(post: Post, db: AsyncSession) -> None:
    guild = await steps.guild(post, db)
    two, bot = steps.member(2), steps.member(8)
    ony = await steps.recorded(db, guild, hours_ago=31, signups={1: "confirmed", 2: "bench"})
    await steps.recorded(db, guild, hours_ago=8, raid_key="mc", signups={1: "late"})

    by_raid = await post(command("raid-admin", "attendance", raid="mc"))
    assert _embed(by_raid)["title"] == _COPY.summary_title(1, raid_name("mc"))
    latest = await post(command("raid-admin", "attendance", raids=1))
    assert _embed(latest)["title"] == _COPY.summary_title(1, None)
    bench = await post(command("raid-admin", "attendance", bench=True))
    assert _lines(bench)[0] == _COPY.summary_sub(True)

    since = f"since their first on <t:{steps.unix(ony.starts_at)}:D>, out of the last 2 counted."
    player = resolved_member(two, "Player02")
    theirs = await post(command("raid-admin", "attendance", resolved=player, player=two))
    assert _lines(theirs)[0] == f"<@{two}> made 0 of 2 raids (0%) {since}"
    benched = await post(command("raid-admin", "attendance", resolved=player, player=two, bench=True))
    assert _lines(benched)[0] == f"<@{two}> made 1 of 2 raids (50%) {since}"

    robot = await post(command("raid-admin", "attendance", resolved=resolved_member(bot, "Bot", bot=True), player=bot))
    assert content(robot) == _COPY.BOTS_DONT_RAID
    refused = await post(command("raid-admin", "attendance", user_id=two, permissions=0))
    assert content(refused) == raid_copy.NOT_PERMITTED_EVENTS


async def test_deleting_a_recorded_raid_says_its_attendance_goes_too(post: Post, db: AsyncSession) -> None:
    event = await steps.raid(db, await steps.guild(post, db))
    goes = "Its attendance record goes too."
    assert goes not in raid_edit_views.delete_check(event, 0)["content"]

    await raid_attendance_service.record(db, event, steps.now())
    await db.refresh(event)
    assert goes in raid_edit_views.delete_check(event, 0)["content"]
