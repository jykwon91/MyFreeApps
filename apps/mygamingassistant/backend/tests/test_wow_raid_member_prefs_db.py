"""One member's preference saves at the same moment — both land.

Taps on one raid post are serialised by the raid's row lock, but one member
tapping two raid posts at once (or a tap during ``/raid prefs``) is not, so
each save locks the member's preference row (``lock_or_create``) and reads
it only then.  Without that, the second save failed the unique insert (no
row yet) or wrote back what it read before the first committed.

The race tests run two real transactions on separate connections
(``raid_prefs_race_harness.py``).
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.models.wow.wow_raid_guild import WowRaidGuild
from app.repositories.wow import wow_raid_guild_repo, wow_raid_member_pref_repo
from app.services.wow import raid_member_prefs_service

from raid_prefs_race_harness import USER, Save, at_once, race_guild, remember, save_in_own_transaction, saved_pref


def _raid_prefs(class_key: str, spec_key: str, *, dm_reminders: bool) -> Save:
    """``/raid prefs class:<class_key> spec:<spec_key> dm_reminders:<dm_reminders>``."""

    async def save(db: AsyncSession, guild: WowRaidGuild) -> object:
        return await raid_member_prefs_service.update_prefs(
            db, guild=guild, discord_user_id=USER, wow_class=class_key, spec=spec_key, dm_reminders=dm_reminders
        )

    return save


async def test_two_first_saves_at_once_both_land(db_engine: AsyncEngine) -> None:
    async with race_guild(db_engine) as (maker, guild):
        await at_once(maker, guild, remember("warrior", "fury"), remember("mage", "frost"))

        pref = await saved_pref(maker, guild)
        assert pref is not None
        assert pref.saved_specs == {"warrior": "fury", "mage": "frost"}
        assert (pref.default_wow_class, pref.default_role) == ("mage", "dps")


async def test_two_saves_at_once_keep_each_others_spec(db_engine: AsyncEngine) -> None:
    async with race_guild(db_engine) as (maker, guild):
        await save_in_own_transaction(maker, guild, remember("warrior", "fury"))

        await at_once(maker, guild, remember("mage", "frost"), remember("priest", "holy"))

        pref = await saved_pref(maker, guild)
        assert pref is not None
        assert pref.saved_specs == {"warrior": "fury", "mage": "frost", "priest": "holy"}
        assert (pref.default_wow_class, pref.default_role) == ("priest", "healer")


async def test_a_sign_up_during_raid_prefs_keeps_both(db_engine: AsyncEngine) -> None:
    async with race_guild(db_engine) as (maker, guild):
        await save_in_own_transaction(maker, guild, remember("mage", "frost"))

        await at_once(maker, guild, _raid_prefs("priest", "holy", dm_reminders=False), remember("warrior", "fury"))

        pref = await saved_pref(maker, guild)
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
        db, guild=guild, discord_user_id=USER, wow_class=wow_class, spec=spec, dm_reminders=False
    )

    assert (result.pref, result.error) == (None, error)
    assert await wow_raid_member_pref_repo.get(db, guild_id=guild.id, discord_user_id=USER) is None
