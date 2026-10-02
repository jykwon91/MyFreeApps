"""Forget my specs in the database: what it clears, what it keeps, and a sign-up tap racing it.

``raid_member_prefs_service.forget_specs`` clears the remembered class and
every saved spec under the preference row's lock, keeping the DM setting
and the character names; with nothing saved it writes nothing.  The race
tests run real transactions (``raid_prefs_race_harness.py``).
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.models.wow.wow_raid_guild import WowRaidGuild
from app.repositories.wow import wow_raid_guild_repo, wow_raid_member_pref_repo
from app.services.wow import raid_member_prefs_service

from raid_prefs_race_harness import USER, Save, at_once, race_guild, remember, save_in_own_transaction, saved_pref


async def _forget(db: AsyncSession, guild: WowRaidGuild) -> object:
    """[Yes, forget them]."""
    return await raid_member_prefs_service.forget_specs(db, guild=guild, discord_user_id=USER)


async def _guild(db: AsyncSession) -> WowRaidGuild:
    return await wow_raid_guild_repo.upsert_config(db, discord_guild_id=f"forget-{uuid.uuid4().hex[:12]}")


async def test_forgetting_keeps_character_names_and_dm_reminders(db: AsyncSession) -> None:
    guild = await _guild(db)
    await raid_member_prefs_service.update_prefs(
        db, guild=guild, discord_user_id=USER, wow_class=None, spec="mage.frost", dm_reminders=False, character="jaina"
    )
    await remember("priest", "holy")(db, guild)

    assert await _forget(db, guild) is True

    pref = await raid_member_prefs_service.get(db, guild=guild, discord_user_id=USER)
    assert pref is not None
    assert (pref.default_wow_class, pref.default_role, pref.saved_specs) == (None, None, {})
    assert (pref.character_names, pref.dm_opt_out) == ({"mage": "Jaina"}, True)
    # Again: nothing left to forget.
    assert await _forget(db, guild) is False


async def test_with_nothing_saved_forgetting_writes_nothing(db: AsyncSession) -> None:
    guild = await _guild(db)

    assert await _forget(db, guild) is False
    assert await wow_raid_member_pref_repo.get(db, guild_id=guild.id, discord_user_id=USER) is None

    # Only a DM setting saved: nothing to forget either.
    await raid_member_prefs_service.update_prefs(
        db, guild=guild, discord_user_id=USER, wow_class=None, spec=None, dm_reminders=False
    )
    assert await _forget(db, guild) is False


@pytest.mark.parametrize(
    ("first", "second", "specs"),
    [(_forget, remember("priest", "holy"), {"priest": "holy"}), (remember("priest", "holy"), _forget, {})],
    ids=["forget-first", "sign-up-first"],
)
async def test_forgetting_while_a_sign_up_saves_a_spec(
    db_engine: AsyncEngine, first: Save, second: Save, specs: dict[str, str]
) -> None:
    async with race_guild(db_engine) as (maker, guild):
        await save_in_own_transaction(maker, guild, remember("mage", "frost"))

        await at_once(maker, guild, first, second)

        # The second save starts from what the first committed.
        pref = await saved_pref(maker, guild)
        assert pref is not None
        assert pref.saved_specs == specs
