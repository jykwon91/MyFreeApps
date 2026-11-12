"""Who in a guild knows a recipe: GET /wow/guilds/{slug}/recipes?q=, from stored recipes only."""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import wow_guilds
from app.core import wow_guild
from app.models.wow.character import WowCharacter
from app.models.wow.guild import WowGuild
from app.repositories.wow import guild_repo, recipe_repo
from app.services.wow.character import character_store_service
from app.services.wow.guild import guild_recipe_search_service

from wow_guild_fixtures import NOW, OTHER_GUILD, make_fetch, professions_json

BOLT = (2963, "Bolt of Linen Cloth")
SHIRT = (2393, "White Linen Shirt")
ROBE = (3914, "Brown Linen Robe")
MINING = 186


@pytest.fixture(autouse=True)
def _reset_guild_limiter() -> None:
    wow_guilds.guild_limiter._buckets.clear()


async def _character(db: AsyncSession, slug: str) -> WowCharacter:
    return (await db.execute(select(WowCharacter).where(WowCharacter.slug == slug))).scalar_one()


async def _search(client: AsyncClient, q: str, slug: str = "topdeadcenter") -> dict:
    response = await client.get(f"/wow/guilds/{slug}/recipes", params={"q": q})
    assert response.status_code == 200, response.text
    return response.json()


async def test_finds_recipes_by_part_of_the_name_with_who_knows_them(client: AsyncClient, db: AsyncSession) -> None:
    await character_store_service.record(make_fetch(professions=professions_json(BOLT, SHIRT, ROBE)), now=NOW)
    await character_store_service.record(make_fetch("tiny-john", 2, professions=professions_json(BOLT)), now=NOW)

    body = await _search(client, "LINEN")

    assert (body["query"], body["truncated"]) == ("LINEN", False)
    assert [r["name"] for r in body["recipes"]] == [BOLT[1], ROBE[1], SHIRT[1]]
    bolt = body["recipes"][0]
    assert (bolt["id"], bolt["profession_id"]) == (BOLT[0], 197)
    assert [(c["slug"], c["class_name"], c["skill"], c["max_skill"]) for c in bolt["crafters"]] == [
        ("jason-kwon", "Warlock", 148, 225),
        ("tiny-john", "Warlock", 148, 225),
    ]
    assert [c["slug"] for c in body["recipes"][2]["crafters"]] == ["jason-kwon"]


async def test_crafters_are_ordered_by_skill_then_name(client: AsyncClient, db: AsyncSession) -> None:
    await character_store_service.record(make_fetch(professions=professions_json(BOLT)), now=NOW)
    low = professions_json(BOLT)
    low["primaries"][0]["tiers"][0]["skill_points"] = 60
    await character_store_service.record(make_fetch("aaron-low", 2, professions=low), now=NOW)

    crafters = (await _search(client, "bolt"))["recipes"][0]["crafters"]

    assert [(c["slug"], c["skill"]) for c in crafters] == [("jason-kwon", 148), ("aaron-low", 60)]


async def test_only_live_members_of_this_guild_count(client: AsyncClient, db: AsyncSession) -> None:
    await character_store_service.record(make_fetch(professions=professions_json(BOLT)), now=NOW)
    await character_store_service.record(make_fetch("tiny-john", 2, professions=professions_json(SHIRT)), now=NOW)
    await character_store_service.record(
        make_fetch("away-guy", 3, guild=OTHER_GUILD, professions=professions_json(ROBE)), now=NOW,
    )
    (await _character(db, "tiny-john")).gone_at = NOW
    await db.flush()

    body = await _search(client, "linen")

    assert [(r["name"], [c["slug"] for c in r["crafters"]]) for r in body["recipes"]] == [
        (BOLT[1], ["jason-kwon"]),
    ]


async def test_gathering_professions_are_never_searched(client: AsyncClient, db: AsyncSession) -> None:
    await character_store_service.record(make_fetch(professions=professions_json(BOLT)), now=NOW)
    jason = await _character(db, "jason-kwon")
    await recipe_repo.upsert_recipes(db, [(BOLT[0], 197, BOLT[1]), (1, MINING, "Linen Mining")])
    await recipe_repo.replace_character_recipes(db, jason.id, [BOLT[0], 1])

    assert [r["name"] for r in (await _search(client, "linen"))["recipes"]] == [BOLT[1]]


async def test_like_wildcards_in_the_query_are_taken_literally(client: AsyncClient, db: AsyncSession) -> None:
    await character_store_service.record(make_fetch(professions=professions_json(BOLT, (5, "100% Silk"))), now=NOW)

    assert (await _search(client, "%%"))["recipes"] == []
    assert (await _search(client, "_o"))["recipes"] == []
    assert [r["name"] for r in (await _search(client, "0%"))["recipes"]] == ["100% Silk"]


async def test_too_many_matches_are_cut_and_flagged(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(guild_recipe_search_service, "GUILD_RECIPE_RESULT_LIMIT", 2)
    await character_store_service.record(make_fetch(professions=professions_json(BOLT, SHIRT, ROBE)), now=NOW)

    body = await _search(client, "linen")

    assert body["truncated"] is True
    assert [r["name"] for r in body["recipes"]] == [BOLT[1], ROBE[1]]


async def test_a_gone_guild_finds_nothing_and_an_unknown_one_is_a_404(client: AsyncClient, db: AsyncSession) -> None:
    await character_store_service.record(make_fetch(professions=professions_json(BOLT)), now=NOW)
    guild = (await db.execute(select(WowGuild).where(WowGuild.slug == "topdeadcenter"))).scalar_one()
    await guild_repo.mark_gone(db, guild.id, NOW)

    assert (await _search(client, "bolt"))["recipes"] == []
    for slug in ("nobody-guild", "a_b"):
        response = await client.get(f"/wow/guilds/{slug}/recipes", params={"q": "bolt"})
        assert (response.status_code, response.json()["detail"]) == (404, "guild_not_found")


async def test_a_query_too_short_or_too_long_is_a_422(client: AsyncClient) -> None:
    for q in ("b", "   ", " b ", "ab\x00c", "ab\tc", "x" * (wow_guild.GUILD_RECIPE_QUERY_MAX_LENGTH + 1)):
        assert (await client.get("/wow/guilds/topdeadcenter/recipes", params={"q": q})).status_code == 422
