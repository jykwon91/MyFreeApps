"""One member's preference saves at the same moment — both land.

Taps on one raid post are serialised by the raid's row lock, but one member
tapping two raid posts at once (or a tap during ``/raid prefs``) is not, so
each save locks the member's preference row (``lock_or_create``) and reads
it only then.  Without that, the second save failed the unique insert (no
row yet) or wrote back what it read before the first committed.

The race tests run two real transactions on separate connections (not the
per-test SAVEPOINT): they commit, and clean up by deleting their guild.
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
from app.services.wow.raid_catalog import WowSpecInfo, spec_info

_USER = "400000000000000001"

Save = Callable[[AsyncSession, WowRaidGuild], Awaitable[object]]


def _spec(class_key: str, spec_key: str) -> WowSpecInfo:
    spec = spec_info(class_key, spec_key)
    assert spec is not None
    return spec


def _remember(class_key: str, spec_key: str) -> Save:
    """A sign-up tap saving *class_key*'s spec."""

    async def save(db: AsyncSession, guild: WowRaidGuild) -> object:
        return await raid_member_prefs_service.remember_spec(
            db, guild=guild, discord_user_id=_USER, spec=_spec(class_key, spec_key)
        )

    return save


def _raid_prefs(class_key: str, spec_key: str, *, dm_reminders: bool) -> Save:
    """``/raid prefs class:<class_key> spec:<spec_key> dm_reminders:<dm_reminders>``."""

    async def save(db: AsyncSession, guild: WowRaidGuild) -> object:
        return await raid_member_prefs_service.update_prefs(
            db, guild=guild, discord_user_id=_USER, wow_class=class_key, spec=spec_key, dm_reminders=dm_reminders
        )

    return save


@asynccontextmanager
async def _guild(db_engine: AsyncEngine) -> AsyncIterator[tuple[async_sessionmaker[AsyncSession], WowRaidGuild]]:
    maker = async_sessionmaker(db_engine, expire_on_commit=False)
    guild_discord_id = f"prefs-{uuid.uuid4().hex[:12]}"
    try:
        async with maker() as db, db.begin():
            guild = await wow_raid_guild_repo.upsert_config(db, discord_guild_id=guild_discord_id)
        yield maker, guild
    finally:
        async with maker() as db, db.begin():
            await db.execute(delete(WowRaidGuild).where(WowRaidGuild.discord_guild_id == guild_discord_id))


async def _save_in_own_transaction(maker: async_sessionmaker[AsyncSession], guild: WowRaidGuild, save: Save) -> None:
    async with maker() as db, db.begin():
        await save(db, guild)


async def _at_once(maker: async_sessionmaker[AsyncSession], guild: WowRaidGuild, first: Save, second: Save) -> None:
    """*first* saves and holds its transaction open while *second* starts; then both commit."""
    async with maker() as db, db.begin():
        await first(db, guild)
        racing = asyncio.create_task(_save_in_own_transaction(maker, guild, second))
        await _until_a_save_waits(maker)
        assert not racing.done()
    await racing


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


async def _pref(maker: async_sessionmaker[AsyncSession], guild: WowRaidGuild) -> WowRaidMemberPref | None:
    async with maker() as db:
        return await wow_raid_member_pref_repo.get(db, guild_id=guild.id, discord_user_id=_USER)


async def test_two_first_saves_at_once_both_land(db_engine: AsyncEngine) -> None:
    async with _guild(db_engine) as (maker, guild):
        await _at_once(maker, guild, _remember("warrior", "fury"), _remember("mage", "frost"))

        pref = await _pref(maker, guild)
        assert pref is not None
        assert pref.saved_specs == {"warrior": "fury", "mage": "frost"}
        assert (pref.default_wow_class, pref.default_role) == ("mage", "dps")


async def test_two_saves_at_once_keep_each_others_spec(db_engine: AsyncEngine) -> None:
    async with _guild(db_engine) as (maker, guild):
        await _save_in_own_transaction(maker, guild, _remember("warrior", "fury"))

        await _at_once(maker, guild, _remember("mage", "frost"), _remember("priest", "holy"))

        pref = await _pref(maker, guild)
        assert pref is not None
        assert pref.saved_specs == {"warrior": "fury", "mage": "frost", "priest": "holy"}
        assert (pref.default_wow_class, pref.default_role) == ("priest", "healer")


async def test_a_sign_up_during_raid_prefs_keeps_both(db_engine: AsyncEngine) -> None:
    async with _guild(db_engine) as (maker, guild):
        await _save_in_own_transaction(maker, guild, _remember("mage", "frost"))

        await _at_once(maker, guild, _raid_prefs("priest", "holy", dm_reminders=False), _remember("warrior", "fury"))

        pref = await _pref(maker, guild)
        assert pref is not None
        assert pref.saved_specs == {"mage": "frost", "priest": "holy", "warrior": "fury"}
        assert pref.dm_opt_out is True


@pytest.mark.parametrize(
    ("wow_class", "spec", "error"),
    [
        ("necromancer", None, "I don't know that class. Pick one from the list."),
        (None, "bladedancer", "I don't know that spec. Pick one from the list."),
    ],
)
async def test_a_refused_raid_prefs_saves_nothing(
    db: AsyncSession, wow_class: str | None, spec: str | None, error: str
) -> None:
    guild = await wow_raid_guild_repo.upsert_config(db, discord_guild_id=f"prefs-{uuid.uuid4().hex[:12]}")

    result = await raid_member_prefs_service.update_prefs(
        db, guild=guild, discord_user_id=_USER, wow_class=wow_class, spec=spec, dm_reminders=False
    )

    assert (result.pref, result.error) == (None, error)
    assert await wow_raid_member_pref_repo.get(db, guild_id=guild.id, discord_user_id=_USER) is None
