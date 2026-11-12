"""The guild page's API: GET /wow/guilds/{slug}, read from stored guilds only."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import wow_guilds
from app.core.rate_limit import RateLimiter
from app.models.wow.character import WowCharacter
from app.models.wow.character_daily_metric import WowCharacterDailyMetric
from app.models.wow.guild import WowGuild
from app.repositories.wow import guild_repo
from app.services.wow.character import character_store_service
from app.services.wow.character.character_mapper import to_character_response

from wow_guild_fixtures import GUILD, NOW, OTHER_GUILD, make_fetch, professions_json


@pytest.fixture(autouse=True)
def _reset_guild_limiter() -> None:
    wow_guilds.guild_limiter._buckets.clear()


async def _guild(db: AsyncSession) -> WowGuild:
    return (await db.execute(select(WowGuild).where(WowGuild.blizzard_guild_id == GUILD["id"]))).scalar_one()


async def test_the_page_lists_stored_members_with_level_class_item_level_and_rank(
    client: AsyncClient, db: AsyncSession,
) -> None:
    await character_store_service.record(make_fetch(), now=NOW, viewed=True)
    await character_store_service.record(make_fetch("tiny-john", 2), now=NOW)
    await character_store_service.record(make_fetch("away-guy", 3, guild=OTHER_GUILD), now=NOW)
    guild = await _guild(db)
    await guild_repo.record_roster(db, guild.id, 52, NOW)
    jason = (await db.execute(select(WowCharacter).where(WowCharacter.slug == "jason-kwon"))).scalar_one()
    jason.guild_rank = 0
    await db.flush()

    response = await client.get("/wow/guilds/TopDeadCenter")

    assert response.status_code == 200
    body = response.json()
    assert (body["slug"], body["name"], body["faction"], body["roster_size"]) == (
        "topdeadcenter", "topdeadcenter", "alliance", 52,
    )
    assert body["refresh_failed"] is False and body["gone"] is False
    assert body["gains_window_days"] == 7
    assert [(m["slug"], m["class_name"], m["level"], m["rank"]) for m in body["members"]] == [
        ("jason-kwon", "Warlock", 30, 0),
        ("tiny-john", "Warlock", 30, None),
    ]


async def _character(db: AsyncSession, slug: str) -> WowCharacter:
    return (await db.execute(select(WowCharacter).where(WowCharacter.slug == slug))).scalar_one()


async def test_level_and_item_level_come_from_the_newest_day_and_are_null_without_one(
    client: AsyncClient, db: AsyncSession,
) -> None:
    await character_store_service.record(make_fetch(), now=NOW, viewed=True)
    await character_store_service.record(make_fetch("tiny-john", 2), now=NOW)
    jason = await _character(db, "jason-kwon")
    db.add_all([
        WowCharacterDailyMetric(character_id=jason.id, day=(NOW - timedelta(days=30)).date(), level=12, item_level=9),
        WowCharacterDailyMetric(character_id=jason.id, day=(NOW + timedelta(days=1)).date(), level=31, item_level=33),
    ])
    tiny = await _character(db, "tiny-john")
    await db.execute(delete(WowCharacterDailyMetric).where(WowCharacterDailyMetric.character_id == tiny.id))
    await db.flush()

    members = {m["slug"]: m for m in (await client.get("/wow/guilds/topdeadcenter")).json()["members"]}

    assert (members["jason-kwon"]["level"], members["jason-kwon"]["item_level"]) == (31, 33)
    assert (members["tiny-john"]["level"], members["tiny-john"]["item_level"]) == (None, None)


async def test_each_member_carries_its_newest_days_leaderboard_numbers(client: AsyncClient, db: AsyncSession) -> None:
    await character_store_service.record(make_fetch(), now=NOW, viewed=True)
    jason = await _character(db, "jason-kwon")
    db.add(WowCharacterDailyMetric(
        character_id=jason.id, day=(NOW + timedelta(days=1)).date(), level=40, honorable_kills=12, killing_blows=7,
        deaths_from_players=3, total_kills=900, total_deaths=0, dungeons_done=4, exalted_reputations=1,
    ))
    await db.flush()

    member = (await client.get("/wow/guilds/topdeadcenter")).json()["members"][0]

    assert {k: member[k] for k in (
        "level", "honorable_kills", "killing_blows", "deaths_from_players", "total_kills", "total_deaths",
        "dungeons_done", "exalted_reputations",
    )} == {
        "level": 40, "honorable_kills": 12, "killing_blows": 7, "deaths_from_players": 3, "total_kills": 900,
        "total_deaths": 0, "dungeons_done": 4, "exalted_reputations": 1,
    }


async def test_professions_come_from_the_newest_day_that_has_them(client: AsyncClient, db: AsyncSession) -> None:
    await character_store_service.record(make_fetch(professions=professions_json()), now=NOW, viewed=True)
    await character_store_service.record(make_fetch("tiny-john", 2), now=NOW)
    jason = await _character(db, "jason-kwon")
    # A later day whose professions call failed: no skills, so yesterday's stand.
    db.add(WowCharacterDailyMetric(character_id=jason.id, day=(NOW + timedelta(days=1)).date(), level=31))
    await db.flush()

    members = {m["slug"]: m for m in (await client.get("/wow/guilds/topdeadcenter")).json()["members"]}

    assert members["jason-kwon"]["professions"] == [{"id": 197, "skill": 148, "max_skill": 225}]
    assert members["tiny-john"]["professions"] == []


async def test_a_gone_character_still_pointing_at_the_guild_is_left_out(client: AsyncClient, db: AsyncSession) -> None:
    await character_store_service.record(make_fetch(), now=NOW, viewed=True)
    await character_store_service.record(make_fetch("tiny-john", 2), now=NOW)
    (await _character(db, "tiny-john")).gone_at = NOW
    await db.flush()

    body = (await client.get("/wow/guilds/topdeadcenter")).json()

    assert [m["slug"] for m in body["members"]] == ["jason-kwon"]


async def test_the_live_guild_wins_over_a_gone_one_with_the_same_slug(client: AsyncClient, db: AsyncSession) -> None:
    await character_store_service.record(make_fetch(), now=NOW, viewed=True)
    old_id = await guild_repo.upsert(
        db, blizzard_guild_id=999, slug="oldname", name="TopDeadCenter", faction="HORDE", at=NOW, viewed=False,
    )
    await guild_repo.mark_gone(db, old_id, NOW)
    old = (await db.execute(select(WowGuild).where(WowGuild.id == old_id))).scalar_one()
    old.slug = "topdeadcenter"
    await db.flush()

    body = (await client.get("/wow/guilds/topdeadcenter")).json()

    assert (body["gone"], body["faction"], [m["slug"] for m in body["members"]]) == (False, "alliance", ["jason-kwon"])


async def test_a_guild_never_stored_or_an_impossible_slug_is_a_404(client: AsyncClient) -> None:
    for slug in ("nobody-guild", "a_b", "x" * 61):
        response = await client.get(f"/wow/guilds/{slug}")
        assert (response.status_code, response.json()["detail"]) == (404, "guild_not_found")


async def test_a_failed_refresh_is_flagged_and_a_gone_guild_lists_nobody(client: AsyncClient, db: AsyncSession) -> None:
    await character_store_service.record(make_fetch(), now=NOW, viewed=True)
    guild = await _guild(db)
    await guild_repo.record_roster(db, guild.id, 52, NOW)
    await guild_repo.record_error(db, guild.id, "HTTP 503", NOW + timedelta(hours=6))
    assert (await client.get("/wow/guilds/topdeadcenter")).json()["refresh_failed"] is True

    await guild_repo.mark_gone(db, guild.id, NOW + timedelta(hours=7))
    body = (await client.get("/wow/guilds/topdeadcenter")).json()
    assert (body["gone"], body["refresh_failed"], body["members"]) == (True, False, [])


async def test_the_page_has_its_own_per_ip_limit(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(wow_guilds, "guild_limiter", RateLimiter(max_attempts=1, window_seconds=60))
    assert (await client.get("/wow/guilds/nobody-guild")).status_code == 404
    assert (await client.get("/wow/guilds/nobody-guild")).status_code == 429


def test_the_character_sheet_carries_its_guilds_slug() -> None:
    fetch = make_fetch()
    assert to_character_response("jason-kwon", fetch.profile).guild_slug == "topdeadcenter"
    assert to_character_response("jason-kwon", make_fetch(guild=None).profile).guild_slug is None


async def _days(db: AsyncSession, slug: str, *days_ago_and_hk: tuple[int, int]) -> None:
    """Replace the character's stored days: (days before today, honorable kills)."""
    character = await _character(db, slug)
    await db.execute(delete(WowCharacterDailyMetric).where(WowCharacterDailyMetric.character_id == character.id))
    today = datetime.now(timezone.utc).date()
    db.add_all([
        WowCharacterDailyMetric(
            character_id=character.id, day=today - timedelta(days=ago), level=20 + hk, honorable_kills=hk,
        )
        for ago, hk in days_ago_and_hk
    ])
    await db.flush()


async def test_the_gains_baseline_is_the_newest_day_a_week_old_else_the_earliest(
    client: AsyncClient, db: AsyncSession,
) -> None:
    for i, slug in enumerate(("jason-kwon", "tiny-john", "lone-day", "went-quiet"), start=1):
        await character_store_service.record(make_fetch(slug, i), now=NOW, viewed=i == 1)
    await _days(db, "jason-kwon", (30, 1), (8, 5), (3, 9), (0, 12))
    await _days(db, "tiny-john", (4, 2), (2, 3), (0, 7))
    await _days(db, "lone-day", (0, 4))
    await _days(db, "went-quiet", (20, 1), (9, 6))

    members = {m["slug"]: m for m in (await client.get("/wow/guilds/topdeadcenter")).json()["members"]}

    today = datetime.now(timezone.utc).date()
    jason = members["jason-kwon"]["baseline"]
    assert (jason["day"], jason["honorable_kills"], jason["level"]) == (str(today - timedelta(days=8)), 5, 25)
    tiny = members["tiny-john"]["baseline"]
    assert (tiny["day"], tiny["honorable_kills"]) == (str(today - timedelta(days=4)), 2)
    # One stored day: nothing to count from. Nobody looked them up this week: no gain seen.
    assert members["lone-day"]["baseline"] is None
    assert members["went-quiet"]["baseline"] is None
