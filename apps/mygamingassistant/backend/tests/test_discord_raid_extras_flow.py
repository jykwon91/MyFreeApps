"""End-to-end flows for Event & thread — a raid's Discord event and its thread.

Through POST /discord/interactions with the harness in ``discord_raid_harness.py``:
/raid-admin setup's defaults and report, [Post raid] making both, the edits
that keep them in step, the card's toggles, Length and Try again, Discord's
refusals and silences, Cancel and Delete raid cleaning up, and a repeat's
next raid.  Time passing is the re-render the sweeps make
(``raid_publisher.refresh_public_message``).  The rules are in
``test_wow_raid_extras_rules.py``, the card in
``test_discord_raid_extras_views.py``, migration 0038 in
``test_wow_raid_extras_db.py``.
"""
from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
import pytest
from platform_shared.services.discord import (
    CREATE_EVENTS,
    CREATE_PUBLIC_THREADS,
    EMBED_LINKS,
    MISSING_PERMISSIONS,
    SEND_MESSAGES,
    THREAD_ALREADY_CREATED,
    UNKNOWN_CHANNEL,
    UNKNOWN_GUILD_SCHEDULED_EVENT,
    VIEW_CHANNEL,
    DiscordRestClient,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.models.wow.wow_raid_series import WowRaidSeries
from app.repositories.wow import wow_raid_event_repo
from app.services.discord import raid_copy, raid_draft_copy, raid_extras_copy, raid_publisher, rest
from app.services.wow import raid_extras_rules, raid_repeat
from app.services.wow.raid_extras_service import LengthSaved
from app.services.wow.raid_notification_worker import process_due_notifications

from discord_raid_harness import (
    APP_ID,
    CHANNEL,
    GUILD,
    ORGANISER,
    ORGANISER_PERMS,
    FakeDiscord,
    Post,
    click,
    command,
    content,
    create_and_post,
    custom_id_for,
    custom_ids,
    future_when,
    modal_submit,
)

pytestmark = pytest.mark.asyncio

_TZ = "America/New_York"
_EVENTS = f"/guilds/{GUILD}/scheduled-events"
_EV1 = f"{_EVENTS}/ev1"
_THREADS = f"/channels/{CHANNEL}/messages/m1/threads"
_THREAD = "/channels/m1"  # the thread on the post m1: its id is the post's
_LINK = f"https://discord.com/channels/{GUILD}/{CHANNEL}/m1"
_WHERE = "Raid: Edit → **Event & thread** has **Try again**."


@dataclass
class _Discord:
    """The harness's fake Discord, answering for scheduled events and threads too.

    A create makes ``ev1``, ``ev2``…; *listed* is the server's events; a thread
    started on a post takes the post's id; *threads* is what reading a thread
    returns; *overwrites* are the raid channel's.
    """

    fake: FakeDiscord
    fallback: Callable[[str, str, dict[str, Any] | None], Any]
    made: int = 0
    listed: list[dict[str, Any]] = field(default_factory=list)
    threads: dict[str, dict[str, Any]] = field(default_factory=dict)
    overwrites: list[dict[str, Any]] = field(default_factory=list)

    def answer(self, method: str, path: str, body: dict[str, Any] | None) -> Any:
        if (method, path) == ("POST", _EVENTS):
            self.made += 1
            return {"id": f"ev{self.made}", "creator_id": APP_ID}
        if (method, path) == ("GET", _EVENTS):
            return self.listed
        if method == "POST" and path.endswith("/threads"):
            return {"id": path.split("/")[-2]}
        if (method, path) == ("GET", f"/channels/{CHANNEL}"):
            return {"id": CHANNEL, "permission_overwrites": self.overwrites}
        thread_id = path.removeprefix("/channels/")
        if method == "GET" and thread_id in self.threads:
            return self.threads[thread_id]
        return self.fallback(method, path, body)

    def extras_calls(self) -> list[tuple[str, str]]:
        """The calls about events and threads, in order."""
        return [
            (call.method, call.path)
            for call in self.fake.calls
            if "scheduled-events" in call.path or call.path.endswith("/threads") or call.path.startswith("/channels/m")
        ]


@pytest.fixture
def discord(fake_discord: FakeDiscord, monkeypatch: pytest.MonkeyPatch) -> _Discord:
    extras = _Discord(fake_discord, fake_discord._ok)
    monkeypatch.setattr(fake_discord, "_ok", extras.answer)
    return extras


def _setup(**defaults: bool) -> dict[str, Any]:
    """/raid-admin setup in the raid channel, naming the extras' *defaults* (the rest left as they are)."""
    return command("raid-admin", "setup", channel=CHANNEL, timezone="Eastern (US)", **defaults)


def _xt(event: WowRaidEvent, verb: str, **as_who: Any) -> dict[str, Any]:
    """A tap on the Event & thread card — the organiser's unless *as_who* says otherwise."""
    as_who = {"user_id": ORGANISER, "permissions": ORGANISER_PERMS, **as_who}
    return click(f"raid:v1:xt:{event.id}:{verb}", **as_who)


def _form(event: WowRaidEvent, name: str, value: str) -> dict[str, Any]:
    """A submit of one of the raid's forms: Raid: Edit's, or Length."""
    return modal_submit(f"raid:v1:m:{event.id}:{name}", {"value": value})


def _cancel(event: WowRaidEvent) -> dict[str, Any]:
    return click(f"raid:v1:cancel:{event.id}", user_id=ORGANISER, permissions=ORGANISER_PERMS)


async def _posted(post: Post, db: AsyncSession, discord: _Discord, **defaults: bool) -> WowRaidEvent:
    """A raid posted as m1 by a server whose *defaults* are on, with the Discord calls so far forgotten."""
    await post(_setup(**defaults))
    event = await create_and_post(post, db)
    discord.fake.clear()
    return event


def _said(fake: FakeDiscord) -> str:
    """The leader's message as the bot last left it (setup's reply, the "Posted" message, the card)."""
    edit = fake.original_edits()[-1]
    assert edit.body is not None
    return edit.body["content"]


def _bodies(fake: FakeDiscord, method: str, path: str) -> list[dict[str, Any] | None]:
    return [call.body for call in fake.find(method, path)]


def _iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).isoformat()


def _card_ids(event: WowRaidEvent, *verbs: str) -> list[str]:
    return [f"raid:v1:xt:{event.id}:{verb}" for verb in verbs] + [f"raid:v1:ed:{event.id}:back"]


# ---------------------------------------------------------------------------
# /raid-admin setup
# ---------------------------------------------------------------------------


async def test_setup_sets_what_new_raids_get_and_says_what_the_bot_needs(
    post: Post, db: AsyncSession, discord: _Discord
) -> None:
    fake = discord.fake
    await post(_setup(discord_events=True, threads=True))
    guild = (await db.execute(select(WowRaidGuild))).scalars().one()
    assert (guild.default_discord_event, guild.default_thread) == (True, True)
    assert _said(fake).split("\n")[1:] == [
        raid_extras_copy.setup_defaults(True, True),
        raid_extras_copy.SETUP_NO_EVENTS,
        raid_extras_copy.setup_no_threads(CHANNEL),
    ]

    # --- the bot may make both now, but the channel is private: its events show to the whole server
    fake.bot_channel_permissions |= CREATE_EVENTS | CREATE_PUBLIC_THREADS
    discord.overwrites = [
        {"id": GUILD, "type": 0, "allow": "0", "deny": str(VIEW_CHANNEL)},
        {"id": APP_ID, "type": 1, "allow": str(VIEW_CHANNEL | SEND_MESSAGES | EMBED_LINKS), "deny": "0"},
    ]
    await post(_setup())  # neither named: both stay on
    await db.refresh(guild)
    assert (guild.default_discord_event, guild.default_thread) == (True, True)
    assert _said(fake).split("\n")[1:] == [
        raid_extras_copy.setup_defaults(True, True),
        raid_extras_copy.setup_private(CHANNEL),
    ]

    # --- one named off: only that one changes
    await post(_setup(threads=False))
    await db.refresh(guild)
    assert (guild.default_discord_event, guild.default_thread) == (True, False)
    assert _said(fake).split("\n")[1:] == [
        raid_extras_copy.setup_defaults(True, False),
        raid_extras_copy.setup_private(CHANNEL),
    ]


# ---------------------------------------------------------------------------
# Post raid, and the edits after
# ---------------------------------------------------------------------------


async def test_posting_makes_both_and_edits_keep_them_in_step(post: Post, db: AsyncSession, discord: _Discord) -> None:
    fake = discord.fake
    await post(_setup(discord_events=True, threads=True))
    event = await create_and_post(post, db)

    assert _bodies(fake, "POST", _EVENTS) == [
        {
            "name": "Onyxia's Lair",
            "description": f"Onyxia's Lair · 5 players · led by Thrall\nBring FR\nSign up on the raid post: {_LINK}",
            "scheduled_start_time": _iso(event.starts_at),
            "scheduled_end_time": _iso(event.starts_at + timedelta(hours=3)),
            "entity_metadata": {"location": _LINK},
            "entity_type": 3,
            "privacy_level": 2,
        }
    ]
    name = raid_extras_rules.thread_name(event, _TZ)
    assert _bodies(fake, "POST", _THREADS) == [{"name": name, "auto_archive_duration": 10080}]
    assert _said(fake) == f"{raid_copy.posted(CHANNEL, _LINK)}\nIts Discord event and thread are up."
    assert (event.discord_event_id, event.thread_id, event.thread_name) == ("ev1", "m1", name)

    # --- a sign-up re-renders the post but changes neither: no call
    fake.clear()
    await post(click(f"raid:v1:spec:{event.id}:druid:confirmed", user_id="101", values=["druid.restoration"]))
    assert len(fake.public_edits()) == 1
    assert discord.extras_calls() == []

    # --- a new title: the event takes it and the thread is renamed
    fake.clear()
    await post(_form(event, "title", "Ony speedrun"))
    await db.refresh(event)
    name = raid_extras_rules.thread_name(event, _TZ)
    assert name.startswith("Ony speedrun · ")
    assert discord.extras_calls() == [("PATCH", _EV1), ("PATCH", _THREAD)]
    (patched,) = _bodies(fake, "PATCH", _EV1)
    assert patched is not None and patched["name"] == "Ony speedrun"
    assert _bodies(fake, "PATCH", _THREAD) == [{"name": name, "archived": False}]

    # --- moved two days on: the event's new times, and the thread named for the new day
    fake.clear()
    await post(_form(event, "when", future_when(12)))
    await db.refresh(event)
    (moved,) = _bodies(fake, "PATCH", _EV1)
    assert moved is not None
    assert (moved["scheduled_start_time"], moved["scheduled_end_time"]) == (
        _iso(event.starts_at),
        _iso(event.starts_at + timedelta(hours=3)),
    )
    assert _bodies(fake, "PATCH", _THREAD) == [{"name": raid_extras_rules.thread_name(event, _TZ), "archived": False}]


async def test_on_a_draft_the_toggles_only_write_the_choice(post: Post, db: AsyncSession, discord: _Discord) -> None:
    fake = discord.fake
    await post(_setup())
    preview = await post(command("raid-admin", "create", raid="onyxia", when=future_when(), size=5))
    event = (await db.execute(select(WowRaidEvent))).scalars().one()
    fake.clear()

    response = await post(_xt(event, "open"))
    assert custom_ids(response) == _card_ids(event, "event_on", "thread_on", "length")
    response = await post(_xt(event, "event_on"))
    assert content(response).split("\n")[0] == raid_extras_copy.draft_notice("event_on")
    response = await post(_xt(event, "thread_on"))
    assert content(response).split("\n")[0] == raid_extras_copy.draft_notice("thread_on")
    assert fake.calls == []

    # --- [Post raid] makes them
    await post(click(custom_id_for(preview, "confirm"), user_id=ORGANISER, permissions=ORGANISER_PERMS))
    assert discord.extras_calls() == [("POST", _EVENTS), ("POST", _THREADS)]
    await db.refresh(event)
    assert (event.discord_event_id, event.thread_id) == ("ev1", "m1")


# ---------------------------------------------------------------------------
# When Discord says no, or nothing
# ---------------------------------------------------------------------------


async def test_a_refusal_is_logged_stored_and_left_until_try_again(
    post: Post, db: AsyncSession, discord: _Discord, caplog: pytest.LogCaptureFixture
) -> None:
    fake = discord.fake
    await post(_setup(discord_events=True))
    fake.fail("POST", _EVENTS, 403, MISSING_PERMISSIONS)
    with caplog.at_level(logging.WARNING, logger="app.services.discord.raid_extras_calls"):
        event = await create_and_post(post, db)

    why = raid_extras_copy.reason("event", MISSING_PERMISSIONS, CHANNEL)
    assert _said(fake).split("\n")[1:] == [f"No Discord event: {why}. {_WHERE}"]
    assert "Discord refused the event create" in caplog.text and "code 50013" in caplog.text
    assert (event.discord_event_id, event.discord_event_error, event.discord_event_claimed_at) == (None, 50013, None)

    # --- nothing tries it again on its own
    fake.clear()
    await post(_form(event, "title", "Ony"))
    assert discord.extras_calls() == []

    # --- the card says why, and offers Try again
    response = await post(_xt(event, "open"))
    lines = content(response).split("\n")
    assert f"**Discord event:** on · not made: {why}" in lines
    assert lines[-1] == raid_extras_copy.FIX_HINT
    assert custom_ids(response) == _card_ids(event, "event_off", "thread_on", "length", "retry")

    # --- Try again: the card busy at once, then the event up
    response = await post(_xt(event, "retry"))
    assert content(response).split("\n")[0] == raid_extras_copy.BUSY["retry"]
    assert all(button["disabled"] for row in response["data"]["components"] for button in row["components"])
    assert discord.extras_calls() == [("POST", _EVENTS)]
    assert _said(fake).split("\n")[0] == raid_extras_copy.EVENT_UP
    await db.refresh(event)
    assert (event.discord_event_id, event.discord_event_error) == ("ev1", None)


async def test_a_create_discord_never_answered_is_looked_for_before_another_is_made(
    post: Post, db: AsyncSession, discord: _Discord
) -> None:
    fake = discord.fake
    await post(_setup(discord_events=True))
    fake.time_out("POST", _EVENTS)
    event = await create_and_post(post, db)
    assert _said(fake).split("\n")[1:] == [f"Discord didn't answer when I made the Discord event. {_WHERE}"]
    claimed = event.discord_event_claimed_at
    assert event.discord_event_id is None and claimed is not None

    # --- while that create may still land: no second one
    fake.clear()
    await post(_form(event, "title", "Ony"))
    assert discord.extras_calls() == []

    # --- the claim gone stale: the server's events are read, and the bot's one at this post taken on
    await wow_raid_event_repo.claim_discord_event(db, event, claimed - timedelta(minutes=3))
    discord.listed = [
        {"id": "ev7", "creator_id": "123", "entity_metadata": {"location": _LINK}},
        {"id": "ev8", "creator_id": APP_ID, "entity_metadata": {"location": "https://example.com/other"}},
        {"id": "ev9", "creator_id": APP_ID, "entity_metadata": {"location": _LINK}},
    ]
    fake.clear()
    await post(_form(event, "title", "Ony again"))
    assert discord.extras_calls() == [("GET", _EVENTS), ("PATCH", f"{_EVENTS}/ev9")]
    await db.refresh(event)
    assert (event.discord_event_id, event.discord_event_claimed_at) == ("ev9", None)


async def test_a_members_thread_on_the_post_is_used_as_it_is(post: Post, db: AsyncSession, discord: _Discord) -> None:
    fake = discord.fake
    discord.threads["m1"] = {"id": "m1", "owner_id": "401", "name": "Ony chat"}
    await post(_setup(threads=True))
    fake.fail("POST", _THREADS, 400, THREAD_ALREADY_CREATED)
    event = await create_and_post(post, db)
    assert (event.thread_id, event.thread_name) == ("m1", None)
    assert discord.extras_calls() == [("POST", _THREADS), ("GET", _THREAD)]

    # --- never renamed, and cancelling leaves it open
    fake.clear()
    await post(_form(event, "title", "Ony"))
    await post(_form(event, "cancel", "Server down"))
    await post(_cancel(event))
    assert discord.extras_calls() == []


async def test_the_bots_own_thread_on_the_post_is_named_after_the_raid(
    post: Post, db: AsyncSession, discord: _Discord
) -> None:
    discord.threads["m1"] = {"id": "m1", "owner_id": APP_ID, "name": "Ony chat"}
    await post(_setup(threads=True))
    discord.fake.fail("POST", _THREADS, 400, THREAD_ALREADY_CREATED)
    event = await create_and_post(post, db)
    name = raid_extras_rules.thread_name(event, _TZ)
    assert (event.thread_id, event.thread_name) == ("m1", name)
    assert discord.extras_calls() == [("POST", _THREADS), ("GET", _THREAD), ("PATCH", _THREAD)]
    assert _bodies(discord.fake, "PATCH", _THREAD) == [{"name": name, "archived": False}]


async def test_an_event_or_thread_someone_deleted_turns_its_toggle_off(
    post: Post, db: AsyncSession, discord: _Discord
) -> None:
    event = await _posted(post, db, discord, discord_events=True, threads=True)
    discord.fake.fail("PATCH", _EV1, 404, UNKNOWN_GUILD_SCHEDULED_EVENT)
    discord.fake.fail("PATCH", _THREAD, 404, UNKNOWN_CHANNEL)
    await post(_form(event, "title", "Ony"))
    await db.refresh(event)
    assert (event.discord_event_enabled, event.discord_event_id) == (False, None)
    assert (event.thread_enabled, event.thread_id, event.thread_name) == (False, None, None)

    # --- the next edit makes neither again
    discord.fake.clear()
    await post(_form(event, "title", "Ony again"))
    assert discord.extras_calls() == []


async def test_an_event_discord_may_start_early_is_replaced_and_a_started_raid_gets_none(
    post: Post, db: AsyncSession, discord: _Discord
) -> None:
    event = await _posted(post, db, discord, discord_events=True)
    # The start Discord holds has passed (it can start the event itself), though the raid is still ahead.
    passed = datetime.now(timezone.utc) - timedelta(minutes=5)
    await wow_raid_event_repo.set_discord_event_state(
        db, event, event_id="ev1", digest=event.discord_event_digest, starts_at=passed, error=None
    )
    await raid_publisher.refresh_public_message(event.id)
    assert discord.extras_calls() == [("DELETE", _EV1), ("POST", _EVENTS)]
    await db.refresh(event)
    assert (event.discord_event_id, event.discord_event_starts_at) == ("ev2", event.starts_at)

    # --- the raid itself has started: Discord runs its event from here
    event.starts_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    await db.flush()
    discord.fake.clear()
    await raid_publisher.refresh_public_message(event.id)
    assert discord.extras_calls() == []


# ---------------------------------------------------------------------------
# The card's toggles and Length
# ---------------------------------------------------------------------------


async def test_the_toggles_take_down_archive_and_bring_back(post: Post, db: AsyncSession, discord: _Discord) -> None:
    fake = discord.fake
    event = await _posted(post, db, discord, discord_events=True, threads=True)
    response = await post(_xt(event, "event_off", user_id="401", permissions=0))
    assert content(response) == raid_copy.NOT_LEADER

    response = await post(_xt(event, "event_off"))
    assert content(response).split("\n")[0] == raid_extras_copy.BUSY["event_off"]
    assert discord.extras_calls() == [("DELETE", _EV1)]
    assert _said(fake).split("\n")[0] == raid_extras_copy.EVENT_REMOVED

    fake.clear()
    await post(_xt(event, "thread_off"))
    assert _bodies(fake, "PATCH", _THREAD) == [{"archived": True}]
    assert _said(fake).split("\n")[0] == raid_extras_copy.THREAD_ARCHIVED
    await db.refresh(event)
    assert (event.discord_event_enabled, event.discord_event_id) == (False, None)
    assert (event.thread_enabled, event.thread_id) == (False, "m1")  # kept: on again reopens it

    # --- on again: the thread reopens under its name, and a new event is made
    fake.clear()
    await post(_xt(event, "thread_on"))
    assert _bodies(fake, "PATCH", _THREAD) == [{"name": event.thread_name, "archived": False}]
    assert _said(fake).split("\n")[0] == raid_extras_copy.THREAD_UP
    fake.clear()
    await post(_xt(event, "event_on"))
    assert discord.extras_calls() == [("POST", _EVENTS)]
    assert _said(fake).split("\n")[0] == raid_extras_copy.EVENT_UP
    await db.refresh(event)
    assert (event.discord_event_enabled, event.discord_event_id) == (True, "ev2")


async def test_the_length_form_moves_the_events_end(post: Post, db: AsyncSession, discord: _Discord) -> None:
    fake = discord.fake
    event = await _posted(post, db, discord, discord_events=True)

    response = await post(_xt(event, "length"))
    assert response["type"] == 9
    assert response["data"]["custom_id"] == f"raid:v1:m:{event.id}:length"
    assert "value" not in response["data"]["components"][0]["component"]  # empty: 3 hours

    for typed, kind in (("x", "format"), ("14m", "too_short"), ("6h 1m", "too_long")):
        response = await post(_form(event, "length", typed))
        assert content(response).split("\n")[0] == raid_extras_copy.length_notice(LengthSaved(kind))
    assert fake.calls == []

    response = await post(_form(event, "length", "2h 30m"))
    assert content(response).split("\n")[0] == raid_extras_copy.BUSY["length"]
    (moved,) = _bodies(fake, "PATCH", _EV1)
    assert moved is not None and moved["scheduled_end_time"] == _iso(event.starts_at + timedelta(minutes=150))
    assert _said(fake).split("\n")[0] == "The raid runs 2 hours 30 minutes."
    response = await post(_xt(event, "length"))
    assert response["data"]["components"][0]["component"]["value"] == "2h 30m"

    # --- the same again: nothing to send
    fake.clear()
    response = await post(_form(event, "length", "2h 30m"))
    assert content(response).split("\n")[0] == raid_draft_copy.NOTHING_CHANGED
    assert fake.calls == []


# ---------------------------------------------------------------------------
# Cancel raid, Delete raid
# ---------------------------------------------------------------------------


async def test_cancelling_takes_down_the_event_and_archives_the_thread(
    post: Post, db: AsyncSession, discord: _Discord
) -> None:
    event = await _posted(post, db, discord, discord_events=True, threads=True)
    await post(_form(event, "cancel", "Server down"))
    await post(_cancel(event))
    assert discord.extras_calls() == [("DELETE", _EV1), ("PATCH", _THREAD)]
    assert _bodies(discord.fake, "PATCH", _THREAD) == [{"archived": True}]


@pytest.mark.parametrize(
    ("silences", "outcome"),
    [(0, raid_copy.DELETED), (2, f"{raid_copy.DELETED}\n{raid_extras_copy.END_LEFT}")],
    ids=["removed", "discord-silent-twice"],
)
async def test_deleting_takes_down_the_event_too(
    silences: int, outcome: str, post: Post, db: AsyncSession, discord: _Discord
) -> None:
    event = await _posted(post, db, discord, discord_events=True, threads=True)
    for _ in range(silences):
        discord.fake.time_out("DELETE", _EV1)

    response = await post(click(f"raid:v1:del:{event.id}", user_id=ORGANISER, permissions=ORGANISER_PERMS))
    assert content(response) == raid_copy.DELETING
    assert discord.extras_calls() == [("DELETE", _EV1)] * max(silences, 1) + [("PATCH", _THREAD)]
    assert _said(discord.fake) == outcome


async def test_an_event_that_lands_after_the_raid_was_cancelled_is_taken_down(
    post: Post, db: AsyncSession, discord: _Discord, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = discord.fake
    await post(_setup(discord_events=True, threads=True))

    async def cancelled_meanwhile(request: httpx.Request) -> httpx.Response:
        """The raid is cancelled while Discord makes its event."""
        if request.method == "POST" and request.url.path.endswith(_EVENTS):
            raid = (await db.execute(select(WowRaidEvent))).scalars().one()
            await wow_raid_event_repo.cancel(db, raid)
        return fake.handler(request)

    async def no_sleep(_seconds: float) -> None:
        return None

    def client() -> DiscordRestClient:
        return DiscordRestClient("test-bot-token", transport=httpx.MockTransport(cancelled_meanwhile), sleep=no_sleep)

    monkeypatch.setattr(rest, "make_rest_client", client)
    event = await create_and_post(post, db)
    assert discord.extras_calls() == [("POST", _EVENTS), ("DELETE", _EV1), ("POST", _THREADS), ("PATCH", _THREAD)]
    assert _bodies(fake, "PATCH", _THREAD) == [{"archived": True}]
    assert (event.status, event.discord_event_id) == ("cancelled", None)


# ---------------------------------------------------------------------------
# Repeat
# ---------------------------------------------------------------------------


async def test_a_repeats_next_raid_gets_its_own_event_and_thread(
    post: Post, db: AsyncSession, discord: _Discord
) -> None:
    event = await _posted(post, db, discord, discord_events=True, threads=True)
    every = click(f"raid:v1:rp:{event.id}:every", user_id=ORGANISER, permissions=ORGANISER_PERMS, values=["7"])
    assert (await post(every))["type"] == 7
    series = (await db.execute(select(WowRaidSeries))).scalars().one()
    discord.fake.clear()

    @asynccontextmanager
    async def scope() -> AsyncIterator[AsyncSession]:
        async with db.begin_nested():
            yield db

    stats = await process_due_notifications(now=raid_repeat.post_at(series), session_scope=scope)
    assert stats.repeats_posted == 1
    following = (await db.execute(select(WowRaidEvent).where(WowRaidEvent.id != event.id))).scalars().one()
    post_id = following.message_id
    assert (following.discord_event_enabled, following.thread_enabled) == (True, True)
    assert (following.discord_event_id, following.thread_id) == ("ev2", post_id)
    assert discord.extras_calls() == [("POST", _EVENTS), ("POST", f"/channels/{CHANNEL}/messages/{post_id}/threads")]
