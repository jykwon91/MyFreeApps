"""The guild page's faction standing board: GET /wow/guilds/{slug}/reputations?faction=, from stored data only."""
from __future__ import annotations

from datetime import timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import wow_guilds
from app.core.wow_character import FACTION_NAME_MAX_LENGTH
from app.models.wow.character import WowCharacter
from app.models.wow.character_reputation import WowCharacterReputation
from app.models.wow.faction import WowFaction
from app.models.wow.guild import WowGuild
from app.repositories.wow import guild_repo
from app.services.wow.character import character_store_service

from wow_guild_fixtures import NOW, OTHER_GUILD, make_fetch, reputations_json

IRONFORGE = 47
STORMWIND = 72
DARNASSUS = 69


@pytest.fixture(autouse=True)
def _reset_guild_limiter() -> None:
    wow_guilds.guild_limiter._buckets.clear()


async def _board(client: AsyncClient, slug: str = "topdeadcenter", **params: int) -> dict:
    response = await client.get(f"/wow/guilds/{slug}/reputations", params=params)
    assert response.status_code == 200, response.text
    return response.json()


async def _seed() -> None:
    """Three members: Ironforge met by all three, Stormwind by two, Darnassus by one."""
    await character_store_service.record(make_fetch(reputations=reputations_json(
        (IRONFORGE, "Ironforge", 5, 6550, 12000), (STORMWIND, "Stormwind", 4, 100, 6000),
    )), now=NOW)
    await character_store_service.record(make_fetch("tiny-john", 2, reputations=reputations_json(
        (IRONFORGE, "Ironforge", 6, 20, 21000), (DARNASSUS, "Darnassus", 3, 0, 3000),
    )), now=NOW)
    await character_store_service.record(make_fetch("aaron-alt", 3, reputations=reputations_json(
        (IRONFORGE, "Ironforge", 5, 9000, 12000), (STORMWIND, "Stormwind", 3, 2500, 3000),
    )), now=NOW)


async def test_the_store_keeps_standings_and_names_factions_once(bound_unit_of_work: AsyncSession) -> None:
    db = bound_unit_of_work
    await _seed()

    names = dict((await db.execute(select(WowFaction.id, WowFaction.name))).all())
    standings = (await db.execute(select(WowCharacterReputation))).scalars().all()

    assert names == {IRONFORGE: "Ironforge", STORMWIND: "Stormwind", DARNASSUS: "Darnassus"}
    assert len(standings) == 6


async def test_a_failed_reputations_call_keeps_the_days_standings(bound_unit_of_work: AsyncSession) -> None:
    db = bound_unit_of_work
    await character_store_service.record(
        make_fetch(reputations=reputations_json((IRONFORGE, "Ironforge", 5, 6550, 12000))), now=NOW,
    )
    await character_store_service.record(make_fetch(reputations=None), now=NOW + timedelta(minutes=5))

    tiers = (await db.execute(select(WowCharacterReputation.tier))).scalars().all()

    assert tiers == [5]


async def test_a_new_answer_replaces_the_days_standings(bound_unit_of_work: AsyncSession) -> None:
    db = bound_unit_of_work
    await character_store_service.record(
        make_fetch(reputations=reputations_json((IRONFORGE, "Ironforge", 5, 6550, 12000))), now=NOW,
    )
    await character_store_service.record(
        make_fetch(reputations=reputations_json((STORMWIND, "Stormwind City", 4, 10, 6000))),
        now=NOW + timedelta(minutes=5),
    )

    rows = (await db.execute(select(WowCharacterReputation.faction_id, WowCharacterReputation.tier))).all()
    renamed = (await db.execute(select(WowFaction.name).where(WowFaction.id == STORMWIND))).scalar_one()

    assert [tuple(r) for r in rows] == [(STORMWIND, 4)]
    assert renamed == "Stormwind City"


async def test_a_repeated_faction_keeps_the_last_standing_and_long_names_are_cut(
    bound_unit_of_work: AsyncSession,
) -> None:
    db = bound_unit_of_work
    long_name = "A" * (FACTION_NAME_MAX_LENGTH + 20)
    await character_store_service.record(make_fetch(reputations=reputations_json(
        (IRONFORGE, "Ironforge", 4, 10, 6000), (IRONFORGE, long_name, 5, 30, 12000), (STORMWIND, "Stormwind", 9, 0, 0),
    )), now=NOW)

    rows = (await db.execute(select(WowCharacterReputation.faction_id, WowCharacterReputation.tier))).all()
    name = (await db.execute(select(WowFaction.name).where(WowFaction.id == IRONFORGE))).scalar_one()

    assert [tuple(r) for r in rows] == [(IRONFORGE, 5)]
    assert name == long_name[:FACTION_NAME_MAX_LENGTH]


async def test_factions_are_listed_most_members_first_and_the_top_one_is_the_default(client: AsyncClient) -> None:
    await _seed()

    body = await _board(client)

    assert [(f["id"], f["name"], f["members"]) for f in body["factions"]] == [
        (IRONFORGE, "Ironforge", 3), (STORMWIND, "Stormwind", 2), (DARNASSUS, "Darnassus", 1),
    ]
    assert body["faction_id"] == IRONFORGE
    assert sorted((s["slug"], s["tier"], s["value"], s["max"]) for s in body["standings"]) == [
        ("aaron-alt", 5, 9000, 12000), ("jason-kwon", 5, 6550, 12000), ("tiny-john", 6, 20, 21000),
    ]


async def test_a_chosen_faction_lists_only_the_members_who_have_met_it(client: AsyncClient) -> None:
    await _seed()

    body = await _board(client, faction=STORMWIND)

    assert body["faction_id"] == STORMWIND
    assert sorted(s["slug"] for s in body["standings"]) == ["aaron-alt", "jason-kwon"]


async def test_an_unknown_faction_falls_back_to_the_default(client: AsyncClient) -> None:
    await _seed()

    body = await _board(client, faction=999)

    assert body["faction_id"] == IRONFORGE
    assert len(body["standings"]) == 3


async def test_the_newest_day_with_standings_counts(client: AsyncClient) -> None:
    await character_store_service.record(
        make_fetch(reputations=reputations_json((IRONFORGE, "Ironforge", 4, 10, 6000))), now=NOW - timedelta(days=2),
    )
    await character_store_service.record(
        make_fetch(reputations=reputations_json((IRONFORGE, "Ironforge", 5, 30, 12000))), now=NOW - timedelta(days=1),
    )
    await character_store_service.record(make_fetch(reputations=None), now=NOW)

    body = await _board(client)

    assert [(s["slug"], s["tier"]) for s in body["standings"]] == [("jason-kwon", 5)]


async def test_only_live_members_of_this_guild_count(client: AsyncClient, db: AsyncSession) -> None:
    await _seed()
    await character_store_service.record(make_fetch("away-guy", 4, guild=OTHER_GUILD, reputations=reputations_json(
        (DARNASSUS, "Darnassus", 7, 0, 1000),
    )), now=NOW)
    tiny = (await db.execute(select(WowCharacter).where(WowCharacter.slug == "tiny-john"))).scalar_one()
    tiny.gone_at = NOW
    await db.flush()

    body = await _board(client)

    assert [(f["id"], f["members"]) for f in body["factions"]] == [(IRONFORGE, 2), (STORMWIND, 2)]
    assert sorted(s["slug"] for s in body["standings"]) == ["aaron-alt", "jason-kwon"]


async def test_nobody_with_standings_is_an_empty_board(client: AsyncClient) -> None:
    await character_store_service.record(make_fetch(), now=NOW)

    body = await _board(client)

    assert body == {"faction_id": None, "factions": [], "standings": []}


async def test_a_gone_guild_is_empty_and_an_unknown_one_is_a_404(client: AsyncClient, db: AsyncSession) -> None:
    await _seed()
    guild = (await db.execute(select(WowGuild).where(WowGuild.slug == "topdeadcenter"))).scalar_one()
    await guild_repo.mark_gone(db, guild.id, NOW)
    await db.flush()

    assert await _board(client) == {"faction_id": None, "factions": [], "standings": []}
    response = await client.get("/wow/guilds/no-such-guild/reputations")
    assert (response.status_code, response.json()["detail"]) == (404, "guild_not_found")


async def test_a_bad_faction_id_is_a_422(client: AsyncClient) -> None:
    for bad in ("0", "abc", str(2**31)):
        response = await client.get("/wow/guilds/topdeadcenter/reputations", params={"faction": bad})
        assert response.status_code == 422, bad
