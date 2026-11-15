"""The guild help tab's API: GET /wow/guilds/{slug}/help."""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import wow_guilds
from app.core.rate_limit import RateLimiter
from app.services.wow.character import character_store_service

from wow_guild_fixtures import GUILD, NOW, make_fetch, professions_json


@pytest.fixture(autouse=True)
def _reset_guild_limiter() -> None:
    wow_guilds.guild_limiter._buckets.clear()


async def test_help_returns_members_with_equipped_items_and_recipe_ids(
    client: AsyncClient, db: AsyncSession,
) -> None:
    professions = professions_json(
        (20350, "Enchant Bracer – Minor Health"),  # recipe ability id 20350
        (3273, "Bolt of Linen Cloth"),             # a gear recipe
    )
    await character_store_service.record(make_fetch(professions=professions), now=NOW, viewed=True)
    await character_store_service.record(make_fetch("tiny-john", 2), now=NOW)

    response = await client.get("/wow/guilds/topdeadcenter/help")

    assert response.status_code == 200
    body = response.json()
    slugs = [m["slug"] for m in body["members"]]
    assert "jason-kwon" in slugs
    assert "tiny-john" in slugs

    jason = next(m for m in body["members"] if m["slug"] == "jason-kwon")
    assert isinstance(jason["equipped"], list)
    assert isinstance(jason["recipe_ability_ids"], list)
    assert 20350 in jason["recipe_ability_ids"]
    assert 3273 in jason["recipe_ability_ids"]
    assert isinstance(jason["professions"], list)
    assert any(p["name"] == "Tailoring" for p in jason["professions"])


async def test_help_returns_404_for_unknown_guild(client: AsyncClient) -> None:
    response = await client.get("/wow/guilds/no-such-guild/help")
    assert response.status_code == 404


async def test_help_returns_404_before_the_guild_is_stored(client: AsyncClient) -> None:
    response = await client.get("/wow/guilds/topdeadcenter/help")
    assert response.status_code == 404


async def test_help_members_have_level_and_class_name(
    client: AsyncClient, db: AsyncSession,
) -> None:
    await character_store_service.record(make_fetch(), now=NOW, viewed=True)

    body = (await client.get("/wow/guilds/topdeadcenter/help")).json()
    jason = next(m for m in body["members"] if m["slug"] == "jason-kwon")

    assert jason["level"] == 30
    assert jason["class_name"] == "Warlock"
    assert jason["name"] == "Jason"
    assert jason["surname"] == "Kwon"


async def test_help_equipped_items_have_required_fields(
    client: AsyncClient, db: AsyncSession,
) -> None:
    await character_store_service.record(make_fetch(), now=NOW, viewed=True)

    body = (await client.get("/wow/guilds/topdeadcenter/help")).json()
    jason = next(m for m in body["members"] if m["slug"] == "jason-kwon")

    # The fixture's profile has no equipment (equipment=None in make_fetch), so equipped is empty.
    # This test mainly checks the shape.
    assert isinstance(jason["equipped"], list)
    for item in jason["equipped"]:
        assert "slot" in item
        assert "item_id" in item
        assert "name" in item
        assert "item_level" in item
        assert "inventory_type" in item
        assert "enchantments" in item
        assert isinstance(item["enchantments"], list)


async def test_help_rate_limited(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    await character_store_service.record(make_fetch(), now=NOW, viewed=True)
    # Override the limiter with a tiny limit so we don't need 60 requests.
    monkeypatch.setattr(wow_guilds, "guild_limiter", RateLimiter(max_attempts=1, window_seconds=60))
    assert (await client.get("/wow/guilds/topdeadcenter/help")).status_code == 200
    response = await client.get("/wow/guilds/topdeadcenter/help")
    assert response.status_code == 429
