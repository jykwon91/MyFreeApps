"""Two saves to one member's preferences at the same moment, on real transactions.

Each race runs in a guild of its own on separate connections (not the
per-test SAVEPOINT): the saves commit, and the guild is deleted afterwards
with everything under it.  ``at_once`` holds the first save's transaction
open until the second waits on the preference row's lock.
"""
from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

import pytest
from sqlalchemy import delete, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.models.wow.wow_raid_guild import WowRaidGuild
from app.models.wow.wow_raid_member_pref import WowRaidMemberPref
from app.repositories.wow import wow_raid_guild_repo, wow_raid_member_pref_repo
from app.services.wow import raid_member_prefs_service
from app.services.wow.raid_catalog import spec_info

USER = "400000000000000001"

Save = Callable[[AsyncSession, WowRaidGuild], Awaitable[object]]


def remember(class_key: str, spec_key: str) -> Save:
    """A sign-up tap saving *class_key*'s spec."""
    spec = spec_info(class_key, spec_key)
    assert spec is not None

    async def save(db: AsyncSession, guild: WowRaidGuild) -> object:
        return await raid_member_prefs_service.remember_spec(db, guild=guild, discord_user_id=USER, spec=spec)

    return save


@asynccontextmanager
async def race_guild(db_engine: AsyncEngine) -> AsyncIterator[tuple[async_sessionmaker[AsyncSession], WowRaidGuild]]:
    maker = async_sessionmaker(db_engine, expire_on_commit=False)
    guild_discord_id = f"prefs-{uuid.uuid4().hex[:12]}"
    try:
        async with maker() as db, db.begin():
            guild = await wow_raid_guild_repo.upsert_config(db, discord_guild_id=guild_discord_id)
        yield maker, guild
    finally:
        async with maker() as db, db.begin():
            await db.execute(delete(WowRaidGuild).where(WowRaidGuild.discord_guild_id == guild_discord_id))


async def save_in_own_transaction(maker: async_sessionmaker[AsyncSession], guild: WowRaidGuild, save: Save) -> None:
    async with maker() as db, db.begin():
        await save(db, guild)


async def at_once(maker: async_sessionmaker[AsyncSession], guild: WowRaidGuild, first: Save, second: Save) -> None:
    """*first* saves and holds its transaction open while *second* starts; then both commit."""
    async with maker() as db, db.begin():
        await first(db, guild)
        racing = asyncio.create_task(save_in_own_transaction(maker, guild, second))
        await _until_a_save_waits(maker)
        assert not racing.done()
    await racing


async def saved_pref(maker: async_sessionmaker[AsyncSession], guild: WowRaidGuild) -> WowRaidMemberPref | None:
    async with maker() as db:
        return await wow_raid_member_pref_repo.get(db, guild_id=guild.id, discord_user_id=USER)


async def _until_a_save_waits(maker: async_sessionmaker[AsyncSession]) -> None:
    """Return once another connection waits on a lock over the prefs table (fail after ~5s)."""
    for _ in range(100):
        # A new transaction each look: Postgres reads pg_stat_activity once per transaction.
        async with maker() as db:
            waiting = await db.scalar(
                text(
                    "SELECT count(*) FROM pg_stat_activity "
                    "WHERE wait_event_type = 'Lock' AND query ILIKE '%wow_raid_member_pref%'"
                )
            )
        if waiting:
            return
        await asyncio.sleep(0.05)
    pytest.fail("the second save never waited for the first")
