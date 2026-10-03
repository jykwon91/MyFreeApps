"""GET / PUT /wow/raids/{web_id}/plan — the leader's group planner over HTTP, against the DB.

The app is built as production mounts it with the bot (``discord_enabled``),
its sessions on the test's transaction.  Links are minted the way Raid: Edit
→ [Groups] mints them (``raid_plan_links.mint``); the post's re-render is
recorded instead of calling Discord.
"""
from __future__ import annotations

import hashlib
import logging
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import raid_web
from app.core.config import settings
from app.db.session import get_db
from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.models.wow.wow_raid_plan_link import WowRaidPlanLink
from app.models.wow.wow_raid_signup import WowRaidSignup
from app.services.discord import raid_publisher
from app.services.wow import raid_plan_links

pytestmark = pytest.mark.asyncio

_STARTS = datetime(2099, 1, 2, 20, 0, tzinfo=timezone.utc)
_CHANNEL = "700000000000000001"
_LEADER = "500000000000000001"
_OFFICER = "500000000000000002"
# (name, status) in sign-up order: four seats, then someone on the bench.
_ROSTER = (("Garrosh", "confirmed"), ("Anduin", "late"), ("Varian", "confirmed"), ("Jaina", "confirmed"),
           ("Rexxar", "bench"))


def _snowflake() -> str:
    return str(10**17 + uuid.uuid4().int % 10**17)


@pytest_asyncio.fixture
async def plan_client(db: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> AsyncGenerator[AsyncClient, None]:
    monkeypatch.setattr(settings, "discord_enabled", True)
    from app.main import create_app

    app = create_app()

    async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    for limiter in (raid_web.raid_page_limiter, raid_web.raid_plan_limiter):
        limiter._buckets.clear()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


@pytest.fixture
def refreshed(monkeypatch: pytest.MonkeyPatch) -> list[uuid.UUID]:
    """The raids whose post a save re-rendered."""
    calls: list[uuid.UUID] = []

    async def _refresh(event_id: uuid.UUID) -> None:
        calls.append(event_id)

    monkeypatch.setattr(raid_publisher, "refresh_public_message", _refresh)
    return calls


async def _raid(db: AsyncSession, *, status: str = "scheduled", size_cap: int = 10) -> WowRaidEvent:
    guild = WowRaidGuild(discord_guild_id=_snowflake(), raid_channel_id=_CHANNEL, timezone="UTC")
    db.add(guild)
    await db.flush()
    event = WowRaidEvent(
        guild_id=guild.id,
        raid_key="onyxia",
        starts_at=_STARTS,
        size_cap=size_cap,
        status=status,
        channel_id=_CHANNEL,
        message_id=_snowflake(),
        created_by_user_id=_LEADER,
        created_by_display_name="Thrall",
    )
    db.add(event)
    await db.flush()
    t0 = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
    for minute, (name, signup_status) in enumerate(_ROSTER):
        db.add(
            WowRaidSignup(
                event_id=event.id,
                discord_user_id=_snowflake(),
                display_name=name,
                status=signup_status,
                wow_class="warrior",
                role="dps",
                spec="fury",
                signed_up_at=t0 + timedelta(minutes=minute),
                updated_at=t0,
            )
        )
    await db.flush()
    return event


async def _signups(db: AsyncSession, event: WowRaidEvent) -> dict[str, WowRaidSignup]:
    result = await db.execute(
        select(WowRaidSignup).where(WowRaidSignup.event_id == event.id).execution_options(populate_existing=True)
    )
    return {signup.display_name: signup for signup in result.scalars()}


async def _mint(db: AsyncSession, event: WowRaidEvent, user: str = _LEADER, *, ago: timedelta = timedelta()) -> str:
    return await raid_plan_links.mint(db, event, user, datetime.now(timezone.utc) - ago)


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"RaidPlanner {token}"}


def _body(version: int, places: list[tuple[WowRaidSignup, int, int]], *, published: bool = False) -> dict[str, Any]:
    assignments = [{"signup_id": str(signup.id), "group": group, "slot": slot} for signup, group, slot in places]
    return {"version": version, "published": published, "assignments": assignments}


async def _save(client: AsyncClient, event: WowRaidEvent, token: str, body: dict[str, Any]) -> Response:
    return await client.put(f"/wow/raids/{event.web_id.hex}/plan", json=body, headers=_auth(token))


def _refusal(response: Response) -> tuple[int, str]:
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-robots-tag"] == "noindex"
    return response.status_code, response.json()["detail"]


# ---------------------------------------------------------------------------
# The link
# ---------------------------------------------------------------------------


async def test_a_minted_link_opens_its_raids_planner(plan_client: AsyncClient, db: AsyncSession) -> None:
    event = await _raid(db)
    token = await _mint(db, event)
    for scheme in ("RaidPlanner", "raidplanner"):
        headers = {"Authorization": f"{scheme} {token}"}
        response = await plan_client.get(f"/wow/raids/{event.web_id.hex}/plan", headers=headers)
        assert response.status_code == 200, response.text
    assert (response.headers["cache-control"], response.headers["x-robots-tag"]) == ("no-store", "noindex")
    plan = response.json()
    assert (plan["web_id"], plan["version"], plan["published"], plan["group_count"]) == (str(event.web_id), 0, False, 2)
    assert [(p["name"], p["number"], p["late"], p["group"]) for p in plan["players"]] == [
        ("Garrosh", 1, False, None), ("Anduin", 2, True, None), ("Varian", 3, False, None), ("Jaina", 4, False, None)
    ]
    link = (await db.execute(select(WowRaidPlanLink))).scalars().one()
    assert datetime.fromisoformat(plan["link_expires_at"]) == link.expires_at == link.created_at + timedelta(hours=2)


@pytest.mark.parametrize("header", ["none", "bearer", "another token", "short", "scheme only", "another raid's"])
async def test_anything_but_this_raids_link_is_refused_and_never_401(
    plan_client: AsyncClient, db: AsyncSession, header: str
) -> None:
    event, other = await _raid(db), await _raid(db)
    token, others = await _mint(db, event), await _mint(db, other)
    headers = {
        "none": {},
        "bearer": {"Authorization": f"Bearer {token}"},
        "another token": _auth("A" * 43),
        "short": _auth(token[:20]),
        "scheme only": {"Authorization": "RaidPlanner"},
        "another raid's": _auth(others),
    }[header]
    url = f"/wow/raids/{event.web_id.hex}/plan"
    assert _refusal(await plan_client.get(url, headers=headers)) == (403, "plan_link_invalid")
    assert _refusal(await plan_client.put(url, json=_body(0, []), headers=headers)) == (403, "plan_link_invalid")


async def test_a_link_past_its_two_hours_says_it_expired(plan_client: AsyncClient, db: AsyncSession) -> None:
    event = await _raid(db)
    token = await _mint(db, event, ago=timedelta(hours=2, seconds=1))
    assert _refusal(await plan_client.get(f"/wow/raids/{event.web_id.hex}/plan", headers=_auth(token))) == (
        403, "plan_link_expired"
    )
    assert _refusal(await _save(plan_client, event, token, _body(0, []))) == (403, "plan_link_expired")


async def test_minting_again_ends_that_leaders_previous_link_only(plan_client: AsyncClient, db: AsyncSession) -> None:
    event = await _raid(db)
    first, officers, second = await _mint(db, event), await _mint(db, event, _OFFICER), await _mint(db, event)
    url = f"/wow/raids/{event.web_id.hex}/plan"
    assert _refusal(await plan_client.get(url, headers=_auth(first))) == (403, "plan_link_invalid")
    for token in (officers, second):
        assert (await plan_client.get(url, headers=_auth(token))).status_code == 200
    links = (await db.execute(select(WowRaidPlanLink))).scalars().all()
    assert sorted(link.discord_user_id for link in links) == [_LEADER, _OFFICER]


async def test_a_mint_deletes_the_raids_links_expired_over_a_day_ago(db: AsyncSession) -> None:
    event = await _raid(db)
    await _mint(db, event, ago=timedelta(days=1, hours=3))  # expired 25 hours ago
    await _mint(db, event, _OFFICER, ago=timedelta(hours=3))  # expired an hour ago: still says "expired"
    await _mint(db, event, "500000000000000003")
    links = (await db.execute(select(WowRaidPlanLink))).scalars().all()
    assert sorted(link.discord_user_id for link in links) == [_OFFICER, "500000000000000003"]


async def test_an_unknown_raid_or_a_draft_is_not_found(plan_client: AsyncClient, db: AsyncSession) -> None:
    draft = await _raid(db, status="draft")
    token = await _mint(db, draft)
    for web_id in (draft.web_id.hex, uuid.uuid4().hex):
        response = await plan_client.get(f"/wow/raids/{web_id}/plan", headers=_auth(token))
        assert _refusal(response) == (404, "raid_not_found")


# ---------------------------------------------------------------------------
# Saving
# ---------------------------------------------------------------------------


async def test_a_save_places_the_players_and_bumps_the_version(
    plan_client: AsyncClient, db: AsyncSession, refreshed: list[uuid.UUID]
) -> None:
    event = await _raid(db)
    token = await _mint(db, event)
    players = await _signups(db, event)
    touched = {name: signup.updated_at for name, signup in players.items()}

    body = _body(0, [(players["Garrosh"], 1, 1), (players["Jaina"], 2, 5), (players["Anduin"], 1, 2)])
    response = await _save(plan_client, event, token, body)
    assert response.status_code == 200, response.text
    saved = response.json()
    assert (saved["dropped"], saved["plan"]["version"], saved["plan"]["published"]) == ([], 1, False)
    assert [(p["name"], p["group"], p["slot"]) for p in saved["plan"]["players"]] == [
        ("Garrosh", 1, 1), ("Anduin", 1, 2), ("Varian", None, None), ("Jaina", 2, 5)
    ]
    players = await _signups(db, event)
    assert {name: (s.raid_group, s.group_slot) for name, s in players.items()} == {
        "Garrosh": (1, 1), "Anduin": (1, 2), "Varian": (None, None), "Jaina": (2, 5), "Rexxar": (None, None)
    }
    # A save is no sign-up change: "last played" (wow_raid_signup_repo.last_classes) reads updated_at.
    assert {name: signup.updated_at for name, signup in players.items()} == touched
    await db.refresh(event)
    assert (event.groups_version, event.groups_published_at) == (1, None)
    assert event.groups_updated_at is not None and refreshed == []

    reread = (await plan_client.get(f"/wow/raids/{event.web_id.hex}/plan", headers=_auth(token))).json()
    assert reread == saved["plan"]


async def test_sharing_stamps_once_hiding_clears_and_only_those_re_render_the_post(
    plan_client: AsyncClient, db: AsyncSession, refreshed: list[uuid.UUID]
) -> None:
    event = await _raid(db)
    token = await _mint(db, event)
    garrosh = (await _signups(db, event))["Garrosh"]
    page_url = f"/wow/raids/{event.web_id.hex}"
    assert (await plan_client.get(page_url)).json()["groups"] is None

    assert (await _save(plan_client, event, token, _body(0, [(garrosh, 1, 1)], published=True))).status_code == 200
    await db.refresh(event)
    shared_at = event.groups_published_at
    assert shared_at is not None and refreshed == [event.id]
    groups = (await plan_client.get(page_url)).json()["groups"]
    assert ([g["number"] for g in groups["groups"]], groups["groups"][0]["entries"][0]["name"]) == ([1], "Garrosh")
    assert groups["unplaced"] == 3

    assert (await _save(plan_client, event, token, _body(1, [(garrosh, 2, 1)], published=True))).status_code == 200
    await db.refresh(event)
    assert (event.groups_published_at, refreshed) == (shared_at, [event.id])  # a plain save keeps the stamp

    assert (await _save(plan_client, event, token, _body(2, [(garrosh, 2, 1)]))).status_code == 200
    await db.refresh(event)
    assert (event.groups_published_at, event.groups_version, refreshed) == (None, 3, [event.id, event.id])
    assert (await plan_client.get(page_url)).json()["groups"] is None


async def test_a_save_planned_on_an_older_version_is_refused(plan_client: AsyncClient, db: AsyncSession) -> None:
    event = await _raid(db)
    leader, officer = await _mint(db, event), await _mint(db, event, _OFFICER)
    players = await _signups(db, event)
    assert (await _save(plan_client, event, leader, _body(0, [(players["Garrosh"], 1, 1)]))).status_code == 200
    late = await _save(plan_client, event, officer, _body(0, [(players["Varian"], 1, 1)]))
    assert _refusal(late) == (409, "groups_changed")
    players = await _signups(db, event)
    assert (players["Garrosh"].raid_group, players["Varian"].raid_group) == (1, None)


@pytest.mark.parametrize("status", ["cancelled", "completed"])
async def test_a_raid_that_is_over_reads_but_does_not_save(
    plan_client: AsyncClient, db: AsyncSession, status: str
) -> None:
    event = await _raid(db)
    token = await _mint(db, event)
    event.status = status
    await db.flush()
    plan = (await plan_client.get(f"/wow/raids/{event.web_id.hex}/plan", headers=_auth(token))).json()
    assert plan["state"] == status
    assert _refusal(await _save(plan_client, event, token, _body(0, []))) == (409, "raid_over")


@pytest.mark.parametrize("case", ["a player twice", "two in one slot", "another raid's player", "past the groups"])
async def test_a_plan_that_does_not_fit_the_raid_is_refused(
    plan_client: AsyncClient, db: AsyncSession, case: str
) -> None:
    event, other = await _raid(db), await _raid(db)
    token = await _mint(db, event)
    players, strangers = await _signups(db, event), await _signups(db, other)
    garrosh, varian = players["Garrosh"], players["Varian"]
    places = {
        "a player twice": [(garrosh, 1, 1), (garrosh, 1, 2)],
        "two in one slot": [(garrosh, 1, 1), (varian, 1, 1)],
        "another raid's player": [(garrosh, 1, 1), (strangers["Varian"], 1, 2)],
        "past the groups": [(garrosh, 3, 1)],  # a 10-man has two
    }[case]
    assert _refusal(await _save(plan_client, event, token, _body(0, places))) == (422, "invalid_plan")
    await db.refresh(event)
    assert event.groups_version == 0


@pytest.mark.parametrize(("group", "slot"), [(0, 1), (9, 1), (1, 0), (1, 6)])
async def test_a_place_outside_eight_groups_of_five_fails_validation(
    plan_client: AsyncClient, db: AsyncSession, group: int, slot: int
) -> None:
    event = await _raid(db)
    token = await _mint(db, event)
    garrosh = (await _signups(db, event))["Garrosh"]
    assert (await _save(plan_client, event, token, _body(0, [(garrosh, group, slot)]))).status_code == 422


async def test_players_who_lost_their_seat_are_left_out_and_named(plan_client: AsyncClient, db: AsyncSession) -> None:
    event = await _raid(db)
    token = await _mint(db, event)
    players = await _signups(db, event)
    response = await _save(plan_client, event, token, _body(0, [(players["Garrosh"], 1, 1), (players["Rexxar"], 1, 2)]))
    assert response.json()["dropped"] == ["Rexxar"]
    players = await _signups(db, event)
    assert (players["Garrosh"].group_slot, players["Rexxar"].group_slot) == (1, None)


async def test_a_save_frees_the_places_it_leaves_out(plan_client: AsyncClient, db: AsyncSession) -> None:
    event = await _raid(db)
    token = await _mint(db, event)
    players = await _signups(db, event)
    assert (await _save(plan_client, event, token, _body(0, [(players["Garrosh"], 1, 1)]))).status_code == 200
    players["Garrosh"].status = "bench"
    await db.flush()
    # Garrosh still holds (1, 1) in the table; the save must free it before giving it to Varian.
    assert (await _save(plan_client, event, token, _body(1, [(players["Varian"], 1, 1)]))).status_code == 200
    players = await _signups(db, event)
    assert ((players["Garrosh"].raid_group, players["Garrosh"].group_slot), players["Varian"].raid_group) == (
        (None, None), 1
    )


async def test_the_table_refuses_two_players_in_one_slot_and_half_a_place(db: AsyncSession) -> None:
    event = await _raid(db)
    players = await _signups(db, event)
    first, second = players["Garrosh"].id, players["Varian"].id
    await db.execute(update(WowRaidSignup).where(WowRaidSignup.id == first).values(raid_group=1, group_slot=1))
    for row, values in (
        (second, {"raid_group": 1, "group_slot": 1}),
        (second, {"raid_group": 2, "group_slot": None}),
        (second, {"raid_group": 9, "group_slot": 1}),
        (second, {"raid_group": 1, "group_slot": 6}),
    ):
        with pytest.raises(IntegrityError):
            async with db.begin_nested():
                await db.execute(update(WowRaidSignup).where(WowRaidSignup.id == row).values(**values))
    other = await _raid(db)
    stranger = (await _signups(db, other))["Garrosh"].id
    await db.execute(update(WowRaidSignup).where(WowRaidSignup.id == stranger).values(raid_group=1, group_slot=1))


# ---------------------------------------------------------------------------
# Secrets and limits
# ---------------------------------------------------------------------------


async def test_only_the_tokens_hash_is_kept_and_the_token_is_never_logged(
    plan_client: AsyncClient, db: AsyncSession, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    event = await _raid(db)
    token = await _mint(db, event)
    garrosh = (await _signups(db, event))["Garrosh"]
    read = await plan_client.get(f"/wow/raids/{event.web_id.hex}/plan", headers=_auth(token))
    saved = await _save(plan_client, event, token, _body(0, [(garrosh, 1, 1)]))
    assert (read.status_code, saved.status_code) == (200, 200)
    link = (await db.execute(select(WowRaidPlanLink))).scalars().one()
    assert link.token_hash == hashlib.sha256(token.encode()).hexdigest()
    assert token not in {str(getattr(link, column.key)) for column in WowRaidPlanLink.__table__.columns}
    assert "Raid groups saved" in caplog.text
    for text in (caplog.text, read.text, saved.text):
        assert token not in text and link.token_hash not in text


async def test_the_planner_is_rate_limited_per_ip(
    plan_client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    event = await _raid(db)
    token = await _mint(db, event)
    monkeypatch.setattr(raid_web.raid_plan_limiter._config, "max_attempts", 2)
    url = f"/wow/raids/{event.web_id.hex}/plan"
    statuses = [(await plan_client.get(url, headers=_auth(token))).status_code for _ in range(3)]
    assert statuses == [200, 200, 429]
