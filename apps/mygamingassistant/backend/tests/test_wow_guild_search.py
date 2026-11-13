"""Find a stored guild by name: GET /wow/guilds?q=, for the guild menu page."""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import wow_guilds
from app.core.rate_limit import RateLimiter
from app.repositories.wow import guild_repo
from app.services.wow.guild import guild_search_service

from wow_guild_fixtures import NOW


@pytest.fixture(autouse=True)
def _reset_guild_limiter() -> None:
    wow_guilds.guild_limiter._buckets.clear()


async def _guild(
    db: AsyncSession, blizzard_id: int, name: str, *, members: int | None = None, faction: str = "ALLIANCE",
) -> None:
    slug = name.lower().replace(" ", "-")
    guild_id = await guild_repo.upsert(
        db, blizzard_guild_id=blizzard_id, slug=slug, name=name, faction=faction, at=NOW, viewed=True,
    )
    if members is not None:
        await guild_repo.record_roster(db, guild_id, members, NOW)
    await db.flush()


async def _search(client: AsyncClient, q: str) -> dict:
    response = await client.get("/wow/guilds", params={"q": q})
    assert response.status_code == 200, response.text
    return response.json()


async def test_finds_guilds_by_part_of_the_name_biggest_first(client: AsyncClient, db: AsyncSession) -> None:
    await _guild(db, 1, "Top Dead Center", members=40)
    await _guild(db, 2, "Dead Men Walking", members=120, faction="HORDE")
    await _guild(db, 3, "Deadmines Regulars")  # no roster yet: after the counted ones
    await _guild(db, 4, "Alive And Well", members=500)

    body = await _search(client, "DEAD")

    assert (body["query"], body["truncated"]) == ("DEAD", False)
    assert [(g["slug"], g["name"], g["faction"], g["member_count"]) for g in body["guilds"]] == [
        ("dead-men-walking", "Dead Men Walking", "horde", 120),
        ("top-dead-center", "Top Dead Center", "alliance", 40),
        ("deadmines-regulars", "Deadmines Regulars", "alliance", None),
    ]


async def test_same_size_guilds_go_by_name(client: AsyncClient, db: AsyncSession) -> None:
    await _guild(db, 1, "Zed Guild", members=10)
    await _guild(db, 2, "alpha guild", members=10)

    assert [g["name"] for g in (await _search(client, "guild"))["guilds"]] == ["alpha guild", "Zed Guild"]


async def test_leaves_out_gone_guilds(client: AsyncClient, db: AsyncSession) -> None:
    await _guild(db, 1, "Old Guard")
    await guild_repo.mark_gone(db, (await guild_repo.get_by_slug(db, "old-guard")).id, NOW)
    await db.flush()

    assert (await _search(client, "guard"))["guilds"] == []


async def test_like_wildcards_are_literal(client: AsyncClient, db: AsyncSession) -> None:
    await _guild(db, 1, "Top Dead Center")

    assert (await _search(client, "%%"))["guilds"] == []
    assert (await _search(client, "p_d"))["guilds"] == []


async def test_says_when_more_matched_than_were_sent(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(guild_search_service, "GUILD_SEARCH_RESULT_LIMIT", 2)
    for i, size in enumerate((30, 20, 10), start=1):
        await _guild(db, i, f"Raid Team {i}", members=size)

    body = await _search(client, "raid")

    assert body["truncated"] is True
    assert [g["name"] for g in body["guilds"]] == ["Raid Team 1", "Raid Team 2"]


@pytest.mark.parametrize(
    ("q", "detail"),
    [(" a ", wow_guilds.GUILD_QUERY_TOO_SHORT), ("ab\x00c", wow_guilds.GUILD_QUERY_INVALID)],
)
async def test_refuses_a_query_too_short_once_trimmed_or_with_control_characters(
    client: AsyncClient, q: str, detail: str,
) -> None:
    response = await client.get("/wow/guilds", params={"q": q})

    assert response.status_code == 422
    assert response.json()["detail"] == detail


@pytest.mark.parametrize("q", ["a", "x" * 61])
async def test_refuses_a_query_outside_the_length_limits(client: AsyncClient, q: str) -> None:
    assert (await client.get("/wow/guilds", params={"q": q})).status_code == 422


async def test_a_guild_page_still_answers_beside_the_search(client: AsyncClient, db: AsyncSession) -> None:
    await _guild(db, 1, "Top Dead Center")

    assert (await client.get("/wow/guilds/top-dead-center")).status_code == 200


async def test_the_search_shares_the_guild_pages_per_ip_limit(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(wow_guilds, "guild_limiter", RateLimiter(max_attempts=1, window_seconds=60))
    assert (await client.get("/wow/guilds", params={"q": "dead"})).status_code == 200
    assert (await client.get("/wow/guilds/nobody-guild")).status_code == 429
