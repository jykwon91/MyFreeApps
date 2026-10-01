"""Raid notification worker against real Postgres with a fake Discord.

Discord REST is an ``httpx.MockTransport`` behind a patched
``rest.make_rest_client``.  Most tests run inside the SAVEPOINT-bound ``db``
session (``bound_unit_of_work``); the concurrency test commits for real on
separate connections and cleans up after itself.

Every timestamp is in 2001 so ``claim_due`` can never pick up a real row
that happens to be sitting in the shared local test database.
"""
from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
import pytest
from platform_shared.services.discord import DiscordRestClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.config import settings
from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.models.wow.wow_raid_notification import MAX_ATTEMPTS, WowRaidNotification
from app.repositories.wow import (
    wow_raid_event_repo,
    wow_raid_guild_repo,
    wow_raid_member_pref_repo,
    wow_raid_notification_repo,
    wow_raid_signup_repo,
)
from app.services.discord import rest
from app.services.wow.raid_notification_worker import process_due_notifications

_NOW = datetime(2001, 3, 1, 12, 0, tzinfo=timezone.utc)
CHANNEL = "4242"
PING_ROLE = "777"
SIGNUP_MESSAGE = "9001"


@dataclass
class Call:
    method: str
    path: str
    body: dict[str, Any] | None


@dataclass
class FakeDiscord:
    calls: list[Call] = field(default_factory=list)
    # (method, path) → queued (status, body) responses; consumed first.
    queued: dict[tuple[str, str], list[tuple[int, dict[str, Any]]]] = field(default_factory=dict)
    # (method, path) → response returned every time (after the queue).
    always: dict[tuple[str, str], tuple[int, dict[str, Any]]] = field(default_factory=dict)
    delay_s: float = 0.0
    _next_id: int = 0

    async def handler(self, request: httpx.Request) -> httpx.Response:
        if self.delay_s:
            await asyncio.sleep(self.delay_s)
        path = request.url.path.removeprefix("/api/v10")
        body = json.loads(request.content) if request.content else None
        self.calls.append(Call(request.method, path, body))
        key = (request.method, path)
        if self.queued.get(key):
            status, payload = self.queued[key].pop(0)
            return httpx.Response(status, json=payload)
        if key in self.always:
            status, payload = self.always[key]
            return httpx.Response(status, json=payload)
        if key == ("POST", "/users/@me/channels"):
            assert body is not None
            return httpx.Response(200, json={"id": f"dm-{body['recipient_id']}"})
        self._next_id += 1
        return httpx.Response(200, json={"id": f"m{self._next_id}"})

    def posts(self, channel_id: str) -> list[Call]:
        return [c for c in self.calls if c.method == "POST" and c.path == f"/channels/{channel_id}/messages"]


@pytest.fixture
def fake_discord(monkeypatch: pytest.MonkeyPatch) -> FakeDiscord:
    fake = FakeDiscord()

    async def _no_sleep(_seconds: float) -> None:
        return None

    def _factory() -> DiscordRestClient:
        return DiscordRestClient("test-bot-token", transport=httpx.MockTransport(fake.handler), sleep=_no_sleep)

    monkeypatch.setattr(rest, "make_rest_client", _factory)
    monkeypatch.setattr(settings, "discord_enabled", True)
    return fake


async def _raid(
    db: AsyncSession,
    *,
    starts_at: datetime,
    raid_key: str = "onyxia",
    size: int = 10,
    status: str = "scheduled",
    guild_discord_id: str = "5150",
) -> WowRaidEvent:
    guild = await wow_raid_guild_repo.upsert_config(
        db, discord_guild_id=guild_discord_id, raid_channel_id=CHANNEL, ping_role_id=PING_ROLE,
    )
    event = await wow_raid_event_repo.create(
        db, guild_id=guild.id, raid_key=raid_key, starts_at=starts_at, size_cap=size,
        channel_id=CHANNEL, created_by_user_id="1", status=status,
    )
    await wow_raid_event_repo.set_message_id(db, event, SIGNUP_MESSAGE)
    return event


async def _signup(
    db: AsyncSession, event: WowRaidEvent, user_id: str, status: str = "confirmed",
    wow_class: str | None = "priest", role: str | None = "healer", spec: str | None = None,
) -> None:
    await wow_raid_signup_repo.upsert_signup(
        db, event_id=event.id, discord_user_id=user_id, display_name=f"P{user_id}",
        status=status, wow_class=wow_class, role=role, spec=spec,
    )


async def _row(
    db: AsyncSession, event: WowRaidEvent, kind: str, due_at: datetime, target: str | None = None
) -> WowRaidNotification:
    row = WowRaidNotification(event_id=event.id, kind=kind, due_at=due_at, target_user_id=target)
    db.add(row)
    await db.flush()
    return row


async def _rows(db: AsyncSession, event: WowRaidEvent) -> list[WowRaidNotification]:
    result = await db.execute(
        select(WowRaidNotification)
        .where(WowRaidNotification.event_id == event.id)
        .execution_options(populate_existing=True)
    )
    return list(result.scalars().all())


def _starts_for_round(round_due_at: datetime) -> datetime:
    """The pull time whose consumables round (24h before, the default) opens at *round_due_at*."""
    return round_due_at + timedelta(hours=24)


# ---------------------------------------------------------------------------
# Channel posts
# ---------------------------------------------------------------------------


async def test_nudge_sent_once_with_role_ping(bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord) -> None:
    db = bound_unit_of_work
    event = await _raid(db, starts_at=_NOW + timedelta(hours=47, minutes=59))
    await _signup(db, event, "10", role="dps", wow_class="rogue")
    nudge = await _row(db, event, "signup_nudge", _NOW - timedelta(minutes=1))

    stats = await process_due_notifications(now=_NOW)
    assert stats.sent == 1

    [post] = fake_discord.posts(CHANNEL)
    assert post.body is not None
    assert post.body["content"].startswith(f"<@&{PING_ROLE}> **Onyxia is <t:")
    assert "1 of 10 confirmed. Still need: **2 tanks, 3 healers**. 9 spots open." in post.body["content"]
    assert f"[Sign up](https://discord.com/channels/5150/{CHANNEL}/{SIGNUP_MESSAGE})" in post.body["content"]
    assert post.body["allowed_mentions"] == {"parse": [], "roles": [PING_ROLE]}
    assert post.body["enforce_nonce"] is True and len(post.body["nonce"]) <= 25

    await db.refresh(nudge)
    assert nudge.sent_at is not None and nudge.last_error is None

    again = await process_due_notifications(now=_NOW + timedelta(minutes=5))
    assert again.claimed == 0
    assert len(fake_discord.posts(CHANNEL)) == 1


async def test_ready_check_mentions_seated_players_only(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    event = await _raid(db, starts_at=_NOW + timedelta(minutes=55))
    await _signup(db, event, "21")
    await _signup(db, event, "22", status="late")
    await _signup(db, event, "23", status="tentative")
    await _signup(db, event, "24", status="bench")
    await _row(db, event, "ready_check", _NOW - timedelta(minutes=5))

    await process_due_notifications(now=_NOW)

    [post] = fake_discord.posts(CHANNEL)
    assert post.body is not None
    assert post.body["content"].startswith("**Ready check — Onyxia starts <t:")
    assert post.body["allowed_mentions"] == {"parse": [], "users": ["21", "22"]}
    assert "<@&" not in post.body["content"]


# ---------------------------------------------------------------------------
# Consumables DMs + the 50007 fallback
# ---------------------------------------------------------------------------


async def test_consumables_dms_and_single_fallback_post(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    round_due = _NOW - timedelta(minutes=1)
    event = await _raid(db, starts_at=_starts_for_round(round_due))
    await _signup(db, event, "31")                                            # priest healer → checklist
    await _signup(db, event, "38", wow_class="druid", role="dps", spec="balance")  # spec → spec title
    await _signup(db, event, "32", status="tentative", wow_class="mage", role="dps")  # DMs closed
    await _signup(db, event, "33", status="late", wow_class=None, role=None)  # no class → generic DM
    await _signup(db, event, "34", status="absence")                          # not DMed
    await _signup(db, event, "35")                                            # opted out
    await _signup(db, event, "36", wow_class="warrior", role="tank")          # DMs closed
    await _signup(db, event, "37", status="queued")                           # not DMed
    await _signup(db, event, "39", status="bench")                            # not DMed
    guild_id = event.guild_id
    await wow_raid_member_pref_repo.upsert(db, guild_id=guild_id, discord_user_id="35", dm_opt_out=True)
    for blocked in ("32", "36"):
        fake_discord.always[("POST", f"/channels/dm-{blocked}/messages")] = (
            403, {"code": 50007, "message": "Cannot send messages to this user"},
        )
    trigger = await _row(db, event, "consumables_reminder", round_due)

    first = await process_due_notifications(now=_NOW)
    assert first.undeliverable == 2
    rows = await _rows(db, event)
    assert {r.target_user_id for r in rows if r.target_user_id} == {"31", "32", "33", "36", "38"}
    assert {r.due_at for r in rows if r.kind == "consumables_reminder"} == {round_due}

    dm_31 = fake_discord.posts("dm-31")
    assert len(dm_31) == 1 and dm_31[0].body is not None
    [embed] = dm_31[0].body["embeds"]
    assert embed["title"] == "Onyxia tomorrow — Priest (Healer)"
    assert "*Classic advice, which may differ in Forever.*" in embed["description"]
    assert {f["name"] for f in embed["fields"]} <= {"Essential", "Recommended", "Tryhard"}
    assert "https://www.wowhead.com/classic/item=" in embed["fields"][0]["value"]
    assert embed["footer"]["text"] == "To stop these DMs, use /raid prefs dm_reminders:false"

    [balance] = fake_discord.posts("dm-38")
    assert balance.body is not None and balance.body["embeds"][0]["title"] == "Onyxia tomorrow — Balance Druid"

    [generic] = fake_discord.posts("dm-33")
    assert generic.body is not None and "/raid prefs" in generic.body["content"]
    for not_dmed in ("34", "35", "37", "39"):
        assert not fake_discord.posts(f"dm-{not_dmed}"), not_dmed
    assert not fake_discord.posts(CHANNEL)  # fallback waits for its due time

    await process_due_notifications(now=_NOW + timedelta(minutes=3))
    [fallback] = fake_discord.posts(CHANNEL)
    assert fallback.body is not None
    assert fallback.body["content"] == (
        "I couldn't DM <@32> <@36>. Open DMs from this server to get reminders, or use `/raid prefs`."
    )
    assert fallback.body["allowed_mentions"] == {"parse": [], "users": ["32", "36"]}

    # Later ticks and a re-run of the fan-out never post or DM again.
    await process_due_notifications(now=_NOW + timedelta(minutes=10))
    again = await wow_raid_notification_repo.schedule_user_rows(
        db, event_id=event.id, kind="consumables_reminder", due_at=trigger.due_at, user_ids=["31", "32"],
    )
    assert again == 0
    await process_due_notifications(now=_NOW + timedelta(minutes=20))
    assert len(fake_discord.posts(CHANNEL)) == 1
    assert len(fake_discord.posts("dm-31")) == 1
    assert all(row.sent_at is not None for row in await _rows(db, event))


async def test_fallback_waits_for_pending_dms(bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord) -> None:
    db = bound_unit_of_work
    round_due = _NOW - timedelta(minutes=5)
    event = await _raid(db, starts_at=_starts_for_round(round_due))
    await _signup(db, event, "41")
    await _signup(db, event, "42")
    fake_discord.always[("POST", "/channels/dm-41/messages")] = (403, {"code": 50007, "message": "closed"})
    fake_discord.queued[("POST", "/channels/dm-42/messages")] = [(503, {"message": "busy"})]
    await _row(db, event, "consumables_reminder", round_due)

    # 41 blocked, 42 failed once (backs off 1 min) → the already-due fallback waits.
    first = await process_due_notifications(now=_NOW)
    assert first.deferred == 1 and not fake_discord.posts(CHANNEL)
    assert (await process_due_notifications(now=_NOW + timedelta(seconds=30))).claimed == 0

    await process_due_notifications(now=_NOW + timedelta(minutes=2))  # 42 retried OK, fallback posts
    [fallback] = fake_discord.posts(CHANNEL)
    assert fallback.body is not None and fallback.body["allowed_mentions"]["users"] == ["41"]
    assert len(fake_discord.posts("dm-42")) == 2


# ---------------------------------------------------------------------------
# Late consumables DMs (players eligible after the round opened)
# ---------------------------------------------------------------------------


async def test_late_signups_get_one_dm_and_earlier_players_none_extra(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    round_due = _NOW - timedelta(minutes=1)
    event = await _raid(db, starts_at=_starts_for_round(round_due))
    await _signup(db, event, "51")
    await _row(db, event, "consumables_reminder", round_due)
    await process_due_notifications(now=_NOW)
    await process_due_notifications(now=_NOW + timedelta(minutes=3))  # fallback: every DM delivered

    # Two hours on: a new signup, a queued player, a tentative one with DMs closed.
    later = _NOW + timedelta(hours=2)
    await _signup(db, event, "52")
    await _signup(db, event, "53", status="queued")
    await _signup(db, event, "54", status="tentative")
    fake_discord.always[("POST", "/channels/dm-54/messages")] = (403, {"code": 50007, "message": "closed"})
    stats = await process_due_notifications(now=later)
    assert (stats.late_dms, stats.sent, stats.undeliverable) == (2, 1, 1)

    await _signup(db, event, "53", status="confirmed")  # moved up from the queue
    assert (await process_due_notifications(now=later + timedelta(minutes=1))).late_dms == 1
    assert (await process_due_notifications(now=later + timedelta(minutes=10))).late_dms == 0

    for user_id in ("51", "52", "53", "54"):
        assert len(fake_discord.posts(f"dm-{user_id}")) == 1, user_id
    assert not fake_discord.posts(CHANNEL)  # the round's one fallback already ran
    dm_rows = [r for r in await _rows(db, event) if r.target_user_id]
    assert len(dm_rows) == 4 and {r.due_at for r in dm_rows} == {round_due}


async def test_raid_posted_inside_the_window_dms_each_signup(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    event = await _raid(db, starts_at=_NOW + timedelta(hours=10))
    guild = await db.get(WowRaidGuild, event.guild_id)
    assert guild is not None
    # Posted 10h out: the 24h trigger is already past, so only the ready check is scheduled.
    await wow_raid_notification_repo.schedule_for_event(
        db, event_id=event.id, starts_at=event.starts_at, guild_settings=guild.settings, now=_NOW
    )
    assert [r.kind for r in await _rows(db, event)] == ["ready_check"]
    await _signup(db, event, "61")
    await _signup(db, event, "62", status="late")
    await _signup(db, event, "63", status="absence")
    await _signup(db, event, "64")
    await wow_raid_member_pref_repo.upsert(db, guild_id=guild.id, discord_user_id="64", dm_opt_out=True)

    assert (await process_due_notifications(now=_NOW)).late_dms == 2
    assert len(fake_discord.posts("dm-61")) == 1 and len(fake_discord.posts("dm-62")) == 1
    assert not fake_discord.posts("dm-63") and not fake_discord.posts("dm-64")

    # Switching DMs back on gets the checklist on the next run.
    await wow_raid_member_pref_repo.upsert(db, guild_id=guild.id, discord_user_id="64", dm_opt_out=False)
    assert (await process_due_notifications(now=_NOW + timedelta(minutes=1))).late_dms == 1
    assert len(fake_discord.posts("dm-64")) == 1
    assert not fake_discord.posts(CHANNEL)


async def test_no_late_dms_before_the_round_opens_or_in_the_last_hour(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    too_early = await _raid(db, starts_at=_NOW + timedelta(hours=25))
    too_close = await _raid(db, starts_at=_NOW + timedelta(minutes=59), guild_discord_id="5153")
    for event in (too_early, too_close):
        await _signup(db, event, "71")

    stats = await process_due_notifications(now=_NOW)
    assert stats.late_dms == 0 and fake_discord.calls == []
    assert await _rows(db, too_early) == [] and await _rows(db, too_close) == []


async def test_time_edit_dms_again_and_skips_rows_for_the_old_time(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    old_round = _NOW - timedelta(hours=3)
    event = await _raid(db, starts_at=_starts_for_round(old_round))
    await _signup(db, event, "81")
    await process_due_notifications(now=_NOW)
    assert len(fake_discord.posts("dm-81")) == 1

    # The pull moves 30 minutes later.  A row a concurrent run scheduled for
    # the old time (it read the event before the edit) must not be sent.
    event.starts_at += timedelta(minutes=30)
    await wow_raid_notification_repo.cancel_pending_for_event(db, event.id)
    stale = await _row(db, event, "consumables_reminder", old_round, target="82")
    await _signup(db, event, "82")

    stats = await process_due_notifications(now=_NOW + timedelta(minutes=1))
    assert (stats.late_dms, stats.sent, stats.skipped) == (2, 2, 1)
    await db.refresh(stale)
    assert stale.last_error == "skipped: raid time changed"
    second = fake_discord.posts("dm-81")[1]
    assert f"<t:{int(event.starts_at.timestamp())}" in json.dumps(second.body)
    assert len(fake_discord.posts("dm-82")) == 1


# ---------------------------------------------------------------------------
# Retries
# ---------------------------------------------------------------------------


async def test_429_and_5xx_back_off_then_give_up(bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord) -> None:
    db = bound_unit_of_work
    event = await _raid(db, starts_at=_NOW + timedelta(hours=40))
    row = await _row(db, event, "signup_nudge", _NOW - timedelta(minutes=1))
    route = ("POST", f"/channels/{CHANNEL}/messages")
    fake_discord.queued[route] = [(429, {"retry_after": 0.01, "global": False})] * 3
    fake_discord.always[route] = (503, {"message": "upstream"})

    moment = _NOW
    for attempt in range(1, MAX_ATTEMPTS + 1):
        stats = await process_due_notifications(now=moment)
        assert stats.failed == 1
        await db.refresh(row)
        assert row.attempts == attempt
        assert row.claimed_at is None
        if attempt < MAX_ATTEMPTS:
            assert row.sent_at is None
            assert row.next_attempt_at is not None and row.next_attempt_at > moment
            # Backoff respected: an immediate re-run claims nothing.
            assert (await process_due_notifications(now=moment)).claimed == 0
            moment = row.next_attempt_at
    assert row.sent_at is not None  # given up
    assert row.last_error == "discord status=503 code=None"
    assert (await process_due_notifications(now=moment + timedelta(hours=1))).claimed == 0


# ---------------------------------------------------------------------------
# Event state
# ---------------------------------------------------------------------------


async def test_cancelled_event_and_cancel_kind_are_skipped(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    cancelled = await _raid(db, starts_at=_NOW + timedelta(hours=10), status="cancelled")
    nudge = await _row(db, cancelled, "signup_nudge", _NOW - timedelta(minutes=1))
    live = await _raid(db, starts_at=_NOW + timedelta(hours=10), guild_discord_id="5151")
    cancel_row = await _row(db, live, "raid_cancelled", _NOW - timedelta(minutes=1))

    stats = await process_due_notifications(now=_NOW)
    assert stats.skipped == 2
    assert fake_discord.calls == []
    await db.refresh(nudge)
    await db.refresh(cancel_row)
    assert nudge.sent_at is not None and nudge.last_error == "skipped: event cancelled"
    assert cancel_row.sent_at is not None and cancel_row.last_error is not None


async def test_finished_raids_are_completed_and_missed_windows_dropped(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord
) -> None:
    db = bound_unit_of_work
    finished = await _raid(db, starts_at=_NOW - timedelta(hours=7))
    upcoming = await _raid(db, starts_at=_NOW + timedelta(hours=20), guild_discord_id="5152")
    stale = await _row(db, upcoming, "signup_nudge", _NOW - timedelta(hours=28))

    stats = await process_due_notifications(now=_NOW)
    assert stats.completed_events == 1
    await db.refresh(finished)
    await db.refresh(upcoming)
    assert finished.status == "completed" and upcoming.status == "scheduled"
    await db.refresh(stale)
    assert stale.last_error == "skipped: missed its window"
    assert fake_discord.calls == []


async def test_noop_when_discord_disabled(
    bound_unit_of_work: AsyncSession, fake_discord: FakeDiscord, monkeypatch: pytest.MonkeyPatch
) -> None:
    db = bound_unit_of_work
    event = await _raid(db, starts_at=_NOW + timedelta(hours=40))
    row = await _row(db, event, "signup_nudge", _NOW - timedelta(minutes=1))
    monkeypatch.setattr(settings, "discord_enabled", False)

    stats = await process_due_notifications(now=_NOW)
    assert stats.claimed == 0 and fake_discord.calls == []
    await db.refresh(row)
    assert row.claimed_at is None and row.sent_at is None


# ---------------------------------------------------------------------------
# Two workers at once (real commits, separate connections)
# ---------------------------------------------------------------------------


async def test_concurrent_workers_never_double_send(db_engine: AsyncEngine, fake_discord: FakeDiscord) -> None:
    maker = async_sessionmaker(db_engine, expire_on_commit=False)

    @asynccontextmanager
    async def scope() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            async with session.begin():
                yield session

    guild_discord_id = f"conc-{uuid.uuid4().hex[:12]}"
    users = [str(600 + i) for i in range(12)]
    try:
        async with scope() as db:
            # The round opened a minute ago with no DM rows yet: both runs'
            # late passes race to schedule them, then both claim loops race.
            due = _NOW - timedelta(minutes=1)
            event = await _raid(db, starts_at=_starts_for_round(due), guild_discord_id=guild_discord_id)
            for user_id in users:
                await _signup(db, event, user_id)
            await _row(db, event, "ready_check", due)
            event_id = event.id

        fake_discord.delay_s = 0.01  # let the two runs interleave on the network await
        results = await asyncio.gather(
            process_due_notifications(now=_NOW, session_scope=scope),
            process_due_notifications(now=_NOW, session_scope=scope),
        )

        assert sum(r.late_dms for r in results) == len(users)
        assert sum(r.claimed for r in results) == len(users) + 1
        assert all(r.claimed > 0 for r in results)
        for user_id in users:
            assert len(fake_discord.posts(f"dm-{user_id}")) == 1, user_id
        assert len(fake_discord.posts(CHANNEL)) == 1
        async with scope() as db:
            rows = (
                await db.execute(select(WowRaidNotification).where(WowRaidNotification.event_id == event_id))
            ).scalars().all()
            assert all(row.sent_at is not None for row in rows)
    finally:
        async with scope() as db:
            await db.execute(delete(WowRaidGuild).where(WowRaidGuild.discord_guild_id == guild_discord_id))
