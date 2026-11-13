"""Refresh now on the guild page: POST /wow/guilds/{slug}/refresh and the claim behind it.

A claim is one atomic UPDATE of ``roster_checked_at``, so the cooldown counts the
scheduler's runs, failed tries and other clicks alike; the refresh itself runs
after the response.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import wow_guilds
from app.core.wow_guild import GUILD_REFRESH_COOLDOWN, GUILD_REFRESH_RATE_LIMIT
from app.models.wow.guild import WowGuild
from app.repositories.wow import guild_repo
from app.services.wow.character import character_store_service
from app.services.wow.guild import guild_refresh_service
from app.services.wow.guild.guild_refresh_claim import GuildRefreshClaim

from wow_guild_fixtures import GUILD, OTHER_GUILD, make_fetch

COOLDOWN_SECONDS = int(GUILD_REFRESH_COOLDOWN.total_seconds())
# The route stamps the real clock, so the route tests store their roster times relative to it.
ROUTE_NOW = datetime.now(timezone.utc)
SERVICE_NOW = datetime(2026, 11, 12, 18, 0, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def _reset_limiters() -> None:
    wow_guilds.guild_limiter._buckets.clear()
    wow_guilds.guild_refresh_limiter._buckets.clear()


@pytest.fixture
def ran(monkeypatch: pytest.MonkeyPatch) -> list[GuildRefreshClaim]:
    """The claims the route handed to the background refresh (which is not run here)."""
    claims: list[GuildRefreshClaim] = []

    async def record(claim: GuildRefreshClaim) -> None:
        claims.append(claim)

    monkeypatch.setattr(guild_refresh_service, "run", record)
    return claims


async def _guild(db: AsyncSession) -> WowGuild:
    return (await db.execute(select(WowGuild).where(WowGuild.blizzard_guild_id == GUILD["id"]))).scalar_one()


async def _stored_guild(db: AsyncSession, *, checked_at: datetime | None) -> WowGuild:
    await character_store_service.record(make_fetch(), now=SERVICE_NOW, viewed=True)
    guild = await _guild(db)
    if checked_at is not None:
        await guild_repo.record_roster(db, guild.id, 3, checked_at)
    return guild


# --- the claim ------------------------------------------------------------------


async def test_a_guild_nobody_has_asked_for_can_be_claimed(bound_unit_of_work: AsyncSession) -> None:
    db = bound_unit_of_work
    guild = await _stored_guild(db, checked_at=None)

    claim = await guild_refresh_service.claim("topdeadcenter", now=SERVICE_NOW)

    assert claim is not None and claim.started and claim.at == SERVICE_NOW
    assert claim.retry_after_seconds == COOLDOWN_SECONDS
    await db.refresh(guild)
    assert guild.roster_checked_at == SERVICE_NOW


async def test_a_second_claim_inside_the_cooldown_is_refused_with_the_time_left(
    bound_unit_of_work: AsyncSession,
) -> None:
    await _stored_guild(bound_unit_of_work, checked_at=None)
    assert (await guild_refresh_service.claim("topdeadcenter", now=SERVICE_NOW)) is not None

    refused = await guild_refresh_service.claim("topdeadcenter", now=SERVICE_NOW + timedelta(seconds=90))

    assert refused is not None and not refused.started
    assert refused.retry_after_seconds == COOLDOWN_SECONDS - 90
    again = await guild_refresh_service.claim("topdeadcenter", now=SERVICE_NOW + GUILD_REFRESH_COOLDOWN)
    assert again is not None and again.started


async def test_the_schedulers_last_run_counts_toward_the_cooldown(bound_unit_of_work: AsyncSession) -> None:
    await _stored_guild(bound_unit_of_work, checked_at=SERVICE_NOW - timedelta(minutes=2))

    refused = await guild_refresh_service.claim("topdeadcenter", now=SERVICE_NOW)

    assert refused is not None and not refused.started
    assert refused.retry_after_seconds == COOLDOWN_SECONDS - 120


async def test_a_guild_we_do_not_have_or_that_is_gone_cannot_be_claimed(bound_unit_of_work: AsyncSession) -> None:
    db = bound_unit_of_work
    assert await guild_refresh_service.claim("topdeadcenter", now=SERVICE_NOW) is None
    guild = await _stored_guild(db, checked_at=None)
    await guild_repo.mark_gone(db, guild.id, SERVICE_NOW)

    assert await guild_refresh_service.claim("topdeadcenter", now=SERVICE_NOW) is None


# --- the route ------------------------------------------------------------------


async def test_the_route_starts_a_refresh_and_answers_before_it_runs(
    client: AsyncClient, db: AsyncSession, ran: list[GuildRefreshClaim],
) -> None:
    await _stored_guild(db, checked_at=ROUTE_NOW - timedelta(hours=1))

    response = await client.post("/wow/guilds/TopDeadCenter/refresh")

    assert response.status_code == 202
    assert response.json() == {"status": "started", "retry_after_seconds": COOLDOWN_SECONDS}
    assert [claim.guild.slug for claim in ran] == ["topdeadcenter"]


async def test_the_route_inside_the_cooldown_runs_nothing_and_says_when_to_come_back(
    client: AsyncClient, db: AsyncSession, ran: list[GuildRefreshClaim],
) -> None:
    await _stored_guild(db, checked_at=datetime.now(timezone.utc) - timedelta(seconds=30))

    response = await client.post("/wow/guilds/topdeadcenter/refresh")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "cooldown" and 0 < body["retry_after_seconds"] <= COOLDOWN_SECONDS
    assert ran == []


async def test_two_clicks_start_one_refresh(
    client: AsyncClient, db: AsyncSession, ran: list[GuildRefreshClaim],
) -> None:
    await _stored_guild(db, checked_at=ROUTE_NOW - timedelta(hours=1))

    statuses = [(await client.post("/wow/guilds/topdeadcenter/refresh")).json()["status"] for _ in range(2)]

    assert statuses == ["started", "cooldown"]
    assert len(ran) == 1


@pytest.mark.parametrize("slug", ["nobody-here", "x" * 61])
async def test_the_route_404s_a_guild_we_do_not_have(
    slug: str, client: AsyncClient, ran: list[GuildRefreshClaim],
) -> None:
    response = await client.post(f"/wow/guilds/{slug}/refresh")

    assert response.status_code == 404 and response.json()["detail"] == "guild_not_found"
    assert ran == []


async def test_the_route_is_limited_per_ip(
    client: AsyncClient, db: AsyncSession, ran: list[GuildRefreshClaim],
) -> None:
    await _stored_guild(db, checked_at=None)

    codes = [
        (await client.post("/wow/guilds/topdeadcenter/refresh")).status_code
        for _ in range(GUILD_REFRESH_RATE_LIMIT + 1)
    ]

    assert codes[-1] == 429
    assert 429 not in codes[:-1]


async def test_the_guild_page_says_when_it_can_be_refreshed_again_and_when_a_refresh_failed(
    client: AsyncClient, db: AsyncSession,
) -> None:
    guild = await _stored_guild(db, checked_at=SERVICE_NOW - timedelta(minutes=1))

    body = (await client.get("/wow/guilds/topdeadcenter")).json()

    assert body["refresh_available_at"] == (SERVICE_NOW - timedelta(minutes=1) + GUILD_REFRESH_COOLDOWN).isoformat().replace("+00:00", "Z")
    assert body["refresh_failed_at"] is None
    await guild_repo.record_error(db, guild.id, "boom", SERVICE_NOW)
    failed = (await client.get("/wow/guilds/topdeadcenter")).json()
    assert failed["refresh_failed"] is True and failed["refresh_failed_at"] is not None


async def test_only_the_operators_guild_can_be_refreshed(
    client: AsyncClient, db: AsyncSession, ran: list[GuildRefreshClaim],
) -> None:
    await character_store_service.record(make_fetch("away-guy", 3, guild=OTHER_GUILD), now=SERVICE_NOW, viewed=True)

    refused = await client.post("/wow/guilds/other-guild/refresh")

    assert refused.status_code == 404 and refused.json()["detail"] == "guild_not_found"
    assert ran == []
    assert await guild_refresh_service.claim("other-guild", now=SERVICE_NOW) is None
    # The page says which guild has the button.
    assert (await client.get("/wow/guilds/other-guild")).json()["can_refresh"] is False
    await _stored_guild(db, checked_at=None)
    assert (await client.get("/wow/guilds/topdeadcenter")).json()["can_refresh"] is True
