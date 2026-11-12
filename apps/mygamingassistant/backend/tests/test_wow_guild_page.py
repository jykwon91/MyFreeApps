"""The guild page's API: GET /wow/guilds/{slug}, read from stored guilds only."""
from __future__ import annotations

from datetime import timedelta

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

from wow_guild_fixtures import GUILD, NOW, OTHER_GUILD, make_fetch


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
