"""End-to-end flows for Repeat — Raid: Edit → [Repeat], and ``/raid-admin repeats``.

The Repeat card, its menus, buttons and forms, through POST
/discord/interactions with the harness in ``discord_raid_harness.py``.
What the worker posts for a repeat is in ``test_wow_raid_series_db.py``.
"""
from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
from typing import Any

import pytest
from platform_shared.services.discord import MANAGE_EVENTS
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_series import WowRaidSeries
from app.repositories.wow import wow_raid_series_repo
from app.services.discord import raid_copy, raid_draft_copy, raid_repeat_copy
from app.services.discord.raid_edit_views import when_prefill
from app.services.discord.raid_leader_views import raid_line
from app.services.wow import raid_repeat
from app.services.wow.raid_text import display_title, title_text
from app.services.wow.raid_time_parser import PAST_MESSAGE

from discord_raid_harness import (
    NY,
    ORGANISER,
    ORGANISER_PERMS,
    FakeDiscord,
    Post,
    assert_ephemeral,
    click,
    command,
    content,
    create_and_post,
    custom_ids,
    future_when,
    modal_submit,
    setup_guild,
)

pytestmark = pytest.mark.asyncio

_TZ = "America/New_York"
_LEADER = {"user_id": "401", "permissions": 0}


async def _raid(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> WowRaidEvent:
    """A posted raid — its post is m1 — with the Discord calls so far forgotten."""
    await setup_guild(post)
    event = await create_and_post(post, db)
    fake_discord.clear()
    return event


def _rp(event: WowRaidEvent, verb: str, *, values: list[str] | None = None, **as_who: Any) -> dict[str, Any]:
    """A Repeat card menu or button — the organiser's unless *as_who* says otherwise."""
    as_who = {"user_id": ORGANISER, "permissions": ORGANISER_PERMS, **as_who}
    return click(f"raid:v1:rp:{event.id}:{verb}", values=values, **as_who)


def _form(event: WowRaidEvent, form: str, value: str, **as_who: Any) -> dict[str, Any]:
    """A Repeat card form's submit (``repeat_days`` or ``repeat_next``)."""
    return modal_submit(f"raid:v1:m:{event.id}:{form}", {"value": value}, **as_who)


async def _repeating(post: Post, event: WowRaidEvent, every: str = "7") -> dict[str, Any]:
    response = await post(_rp(event, "every", values=[every]))
    assert response["type"] == 7
    return response


async def _repeats(db: AsyncSession, event: WowRaidEvent) -> list[WowRaidSeries]:
    """The server's repeats."""
    result = await db.execute(select(WowRaidSeries).where(WowRaidSeries.guild_id == event.guild_id))
    return list(result.scalars())


def _menu(response: dict[str, Any], row: int) -> dict[str, Any]:
    return response["data"]["components"][row]["components"][0]


def _values(response: dict[str, Any], row: int) -> list[str]:
    return [option["value"] for option in _menu(response, row)["options"]]


def _prefill(response: dict[str, Any]) -> str:
    return response["data"]["components"][0]["component"]["value"]


def _off(event: WowRaidEvent, *notices: str) -> str:
    """The Repeat card's text while it's off."""
    return "\n".join([raid_line(event), raid_repeat_copy.OFF, *notices])


def _on(event: WowRaidEvent, series: WowRaidSeries, *notices: str) -> str:
    """The Repeat card's text while it's on (the raid is the latest in it)."""
    lines = raid_repeat_copy.on_lines(series, event, datetime.now(timezone.utc))
    return "\n".join([raid_line(event), *lines, *notices])


def _days_on(moment: datetime, days: int) -> datetime:
    """*moment*'s time in New York, *days* days on."""
    local = moment.astimezone(NY)
    return datetime.combine(local.date() + timedelta(days=days), local.time(), tzinfo=NY)


def _later_when(days: int, clock: str) -> tuple[str, datetime]:
    """What's typed for *days* from now at *clock*, and the time it means."""
    typed = (datetime.now(NY) + timedelta(days=days)).strftime("%Y-%m-%d") + f" {clock}"
    return typed, datetime.strptime(typed, "%Y-%m-%d %H:%M").replace(tzinfo=NY)


# ---------------------------------------------------------------------------
# Off → on
# ---------------------------------------------------------------------------


async def test_repeat_starts_off_and_every_week_turns_it_on(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)

    # --- off: how often, and Back
    response = await post(_rp(event, "open"))
    assert response["type"] == 7
    assert content(response) == _off(event)
    assert response["data"]["embeds"] == []
    assert custom_ids(response) == [f"raid:v1:rp:{event.id}:every", f"raid:v1:rp:{event.id}:back"]
    every = _menu(response, 0)
    assert every["placeholder"] == raid_repeat_copy.EVERY_PLACEHOLDER
    assert [(o["label"], o["value"]) for o in every["options"]] == [
        ("Every week", "7"), ("Every 2 weeks", "14"), ("Every 3 days", "3"), ("Every 5 days", "5"),
        (raid_repeat_copy.OTHER, "other"),
    ]

    # --- Every week: on, a week after the raid at its time, each posted when the one before starts
    response = await _repeating(post, event)
    (series,) = await _repeats(db, event)
    assert (series.every_days, series.post_ahead_hours) == (7, None)
    assert series.next_starts_at == _days_on(event.starts_at, 7)
    assert (series.start_local, series.tz_name, series.created_by_user_id) == (time(20, 0), _TZ, ORGANISER)
    assert event.series_id == series.id
    started = raid_repeat_copy.started(
        title_text(event), 7, raid_repeat.post_at(series), datetime.now(timezone.utc)
    )
    assert content(response) == _on(event, series, started)
    assert custom_ids(response) == [
        f"raid:v1:rp:{event.id}:{verb}" for verb in ("every", "ahead", "skip", "next", "stop", "back")
    ]
    assert [o["value"] for o in _menu(response, 0)["options"] if o.get("default")] == ["7"]
    ahead = _menu(response, 1)
    assert ahead["placeholder"] == raid_repeat_copy.AHEAD_PLACEHOLDER
    # Two weeks ahead isn't offered for a weekly raid: no further ahead than the interval.
    assert [(o["label"], o["value"]) for o in ahead["options"]] == [
        (raid_repeat.ahead_words(hours).capitalize(), str(hours or 0)) for hours in (None, 24, 48, 72, 168)
    ]
    assert [o["value"] for o in ahead["options"] if o.get("default")] == ["0"]
    labels = [c["label"] for c in response["data"]["components"][2]["components"]]
    assert labels == [
        raid_repeat.skip_label(series.next_starts_at, _TZ), "Change next date", "Stop repeating", "Back"
    ]
    assert fake_discord.calls == []

    # --- Back: the edit card says it repeats
    response = await post(_rp(event, "back"))
    assert response["type"] == 7
    assert response["data"]["embeds"][0]["title"] == "Edit raid"
    assert "**Repeat:** on" in response["data"]["embeds"][0]["description"].splitlines()


async def test_how_far_ahead_each_raid_posts_stays_within_the_interval(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    await _repeating(post, event)
    (series,) = await _repeats(db, event)

    response = await post(_rp(event, "ahead", values=["48"]))
    assert series.post_ahead_hours == 48
    now = datetime.now(timezone.utc)
    assert content(response) == _on(event, series, raid_repeat_copy.ahead_set(48, raid_repeat.post_at(series), now))
    assert [o["value"] for o in _menu(response, 1)["options"] if o.get("default")] == ["48"]

    response = await post(_rp(event, "ahead", values=["48"]))
    assert content(response) == _on(event, series, raid_draft_copy.NOTHING_CHANGED)

    # Two weeks ahead, sent though not offered: refused.
    response = await post(_rp(event, "ahead", values=["336"]))
    assert content(response) == _on(event, series, raid_repeat_copy.too_long(7))
    assert series.post_ahead_hours == 48

    # --- every 3 days: a week ahead is longer than that, so it's cleared
    await post(_rp(event, "ahead", values=["168"]))
    response = await post(_rp(event, "every", values=["3"]))
    assert (series.every_days, series.post_ahead_hours) == (3, None)
    assert series.next_starts_at == _days_on(event.starts_at, 3)
    notice = f"{raid_repeat_copy.every_set(3, series.next_starts_at)} {raid_repeat_copy.AHEAD_CLEARED}"
    assert content(response) == _on(event, series, notice)
    assert _values(response, 1) == ["0", "24", "48", "72"]


async def test_raids_never_post_with_sign_ups_already_closed(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    event.signup_deadline_minutes = 2 * 24 * 60
    await db.flush()

    # Every day: each raid would post a day ahead, after sign-ups close.
    response = await post(_form(event, "repeat_days", "1"))
    assert content(response) == _off(event, raid_repeat_copy.every_conflict(2880, 1))
    assert await _repeats(db, event) == []

    await _repeating(post, event)
    (series,) = await _repeats(db, event)
    response = await post(_rp(event, "ahead", values=["48"]))  # equal counts: closed as it posts
    assert content(response) == _on(event, series, raid_repeat_copy.conflict(2880))
    assert series.post_ahead_hours is None
    await post(_rp(event, "ahead", values=["72"]))
    assert series.post_ahead_hours == 72

    # Every 2 days clears the 3 days ahead, and 2 days is too late.
    response = await post(_form(event, "repeat_days", "2"))
    assert content(response) == _on(event, series, raid_repeat_copy.every_conflict(2880, 2))
    assert (series.every_days, series.post_ahead_hours) == (7, 72)

    # A deadline set after: the card warns that each raid posts closed.
    event.signup_deadline_minutes = 3 * 24 * 60
    await db.flush()
    response = await post(_rp(event, "open"))
    assert content(response).splitlines()[-1] == (
        "**Heads up:** sign-ups close 3 days before each raid but each posts 3 days before, so it posts closed."
    )


async def test_other_takes_any_number_of_days_from_1_to_28(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)

    response = await post(_rp(event, "every", values=["other"]))
    assert response["type"] == 9
    assert response["data"]["custom_id"] == f"raid:v1:m:{event.id}:repeat_days"
    assert response["data"]["title"] == raid_repeat_copy.DAYS_MODAL
    for typed in ("0", "29", "two"):
        response = await post(_form(event, "repeat_days", typed))
        assert content(response) == _off(event, raid_repeat_copy.DAYS_ERROR)
    assert await _repeats(db, event) == []

    response = await post(_form(event, "repeat_days", " 10 "))
    (series,) = await _repeats(db, event)
    assert series.every_days == 10
    # Its own interval is on the menu, and in the form.
    assert _values(response, 0) == ["7", "14", "3", "5", "10", "other"]
    response = await post(_rp(event, "every", values=["10"]))
    assert content(response) == _on(event, series, raid_draft_copy.NOTHING_CHANGED)
    response = await post(_rp(event, "every", values=["other"]))
    assert _prefill(response) == "10"


async def test_change_next_date_moves_the_next_raid_and_the_ones_after_it(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    await _repeating(post, event)
    (series,) = await _repeats(db, event)

    response = await post(_rp(event, "next"))
    assert response["type"] == 9
    assert response["data"]["custom_id"] == f"raid:v1:m:{event.id}:repeat_next"
    assert _prefill(response) == when_prefill(series.next_starts_at, _TZ)

    typed, moved = _later_when(20, "21:30")
    response = await post(_form(event, "repeat_next", typed))
    assert (series.next_starts_at, series.start_local) == (moved, time(21, 30))
    assert content(response) == _on(event, series, raid_repeat_copy.next_set(moved, 7))

    response = await post(_form(event, "repeat_next", "1/1/2020 8pm"))
    assert content(response) == _on(event, series, PAST_MESSAGE)

    # Sign-ups close 2 days before: tomorrow they'd be closed already.
    event.signup_deadline_minutes = 2 * 24 * 60
    await db.flush()
    response = await post(_form(event, "repeat_next", future_when(days=1)))
    assert content(response) == _on(event, series, raid_repeat_copy.next_deadline_passed(2880))
    assert series.next_starts_at == moved


async def test_skip_moves_the_next_raid_on_one_interval(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    await _repeating(post, event)
    (series,) = await _repeats(db, event)
    skipped = series.next_starts_at

    response = await post(_rp(event, "skip"))
    assert series.next_starts_at == _days_on(skipped, 7)
    now = datetime.now(timezone.utc)
    notice = raid_repeat_copy.skipped(skipped, series.next_starts_at, raid_repeat.post_at(series), now)
    assert content(response) == _on(event, series, notice)


async def test_stop_repeating_turns_it_off_and_keeps_the_raid(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    await _repeating(post, event)

    response = await post(_rp(event, "stop"))
    assert content(response) == _off(event, raid_repeat_copy.STOPPED)
    assert await _repeats(db, event) == []
    assert (event.series_id, event.status, event.message_id) == (None, "scheduled", "m1")

    # A card left open: its buttons find it off.
    response = await post(_rp(event, "skip"))
    assert content(response) == _off(event)
    assert fake_discord.calls == []


# ---------------------------------------------------------------------------
# Who, what and when
# ---------------------------------------------------------------------------


async def test_repeating_needs_manage_events_even_for_the_raids_leader(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    event = await _raid(post, db, fake_discord)
    event.leader_user_id, event.leader_display_name = "401", "Jaina"
    await db.flush()

    requests = [
        _rp(event, "open", **_LEADER),
        _rp(event, "every", values=["7"], **_LEADER),
        _form(event, "repeat_days", "5", **_LEADER),
        _form(event, "repeat_next", future_when(days=20), **_LEADER),
        click("raid:v1:rpl", values=[str(event.id)], **_LEADER),
    ]
    for request in requests:
        response = await post(request)
        assert_ephemeral(response)
        assert content(response) == raid_repeat_copy.NOT_PERMITTED_REPEAT
    response = await post(command("raid-admin", "repeats", **_LEADER))
    assert content(response) == raid_copy.NOT_PERMITTED_EVENTS
    assert await _repeats(db, event) == []


async def test_a_choice_never_offered_changes_nothing(post: Post, db: AsyncSession, fake_discord: FakeDiscord) -> None:
    event = await _raid(post, db, fake_discord)

    response = await post(_rp(event, "every", values=["6"]))
    assert response["type"] == 7
    assert content(response) == raid_copy.GENERIC_ERROR
    assert response["data"]["components"] == []
    await _repeating(post, event)
    response = await post(_rp(event, "ahead", values=["5"]))
    assert content(response) == raid_copy.GENERIC_ERROR
    (series,) = await _repeats(db, event)
    assert (series.every_days, series.post_ahead_hours) == (7, None)


async def test_a_change_while_the_worker_posts_the_repeats_next_raid_asks_to_try_again(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord, monkeypatch: pytest.MonkeyPatch
) -> None:
    event = await _raid(post, db, fake_discord)
    await _repeating(post, event)
    (series,) = await _repeats(db, event)
    next_raid = series.next_starts_at

    async def held(db: AsyncSession, series_id: object) -> None:
        return None  # SKIP LOCKED passed over it: the worker holds it

    monkeypatch.setattr(wow_raid_series_repo, "lock_for_change", held)
    for request in (_rp(event, "skip"), _rp(event, "stop"), _form(event, "repeat_days", "3")):
        response = await post(request)
        assert content(response) == _on(event, series, raid_repeat_copy.BUSY)
    assert (series.every_days, series.next_starts_at) == (7, next_raid)
    assert event.series_id == series.id


@pytest.mark.parametrize("over", ["cancelled", "completed"])
async def test_a_raid_that_is_over_can_be_repeated(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord, over: str
) -> None:
    event = await _raid(post, db, fake_discord)
    event.status = over
    await db.flush()

    response = await post(_rp(event, "open"))
    assert content(response) == _off(event)
    await _repeating(post, event)
    (series,) = await _repeats(db, event)
    assert event.series_id == series.id


# ---------------------------------------------------------------------------
# /raid-admin repeats and [Repeat this raid]
# ---------------------------------------------------------------------------


async def test_raid_admin_repeats_lists_the_servers_repeats(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    response = await post(command("raid-admin", "repeats"))
    assert_ephemeral(response)
    assert content(response) == raid_copy.NOT_CONFIGURED

    await setup_guild(post)
    response = await post(command("raid-admin", "repeats"))
    assert_ephemeral(response)
    assert content(response) == raid_repeat_copy.REPEATS_NONE

    event = await create_and_post(post, db)
    await _repeating(post, event)
    (series,) = await _repeats(db, event)
    response = await post(command("raid-admin", "repeats"))
    assert_ephemeral(response)
    assert content(response) == raid_repeat_copy.repeats_header(1)
    menu = _menu(response, 0)
    assert (menu["custom_id"], menu["placeholder"]) == ("raid:v1:rpl", raid_repeat_copy.PICK_PLACEHOLDER)
    next_raid = raid_repeat.slot_words(series.next_starts_at, _TZ)
    assert menu["options"] == [
        {"label": display_title(event), "description": f"Every week · next {next_raid}", "value": str(event.id)}
    ]

    # --- picking it opens its Repeat card in place of the list
    response = await post(click("raid:v1:rpl", values=[str(event.id)], user_id=ORGANISER, permissions=MANAGE_EVENTS))
    assert response["type"] == 7
    assert content(response) == _on(event, series)

    response = await post(click("raid:v1:rpl", values=["nope"], user_id=ORGANISER, permissions=MANAGE_EVENTS))
    assert content(response) == raid_copy.GENERIC_ERROR


async def test_the_posted_message_offers_repeat_this_raid(
    post: Post, db: AsyncSession, fake_discord: FakeDiscord
) -> None:
    await setup_guild(post)
    event = await create_and_post(post, db)

    posted = fake_discord.original_edits()[-1].body
    assert posted is not None
    (button,) = [c for row in posted["components"] for c in row["components"]]
    assert (button["label"], button["custom_id"]) == (raid_repeat_copy.REPEAT_THIS, f"raid:v1:rp:{event.id}:open")

    response = await post(_rp(event, "open"))
    assert content(response) == _off(event)
