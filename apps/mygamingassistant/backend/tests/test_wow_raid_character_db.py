"""Character names in the database: the column checks, ``/raid prefs character:`` and saves that race.

A name is saved for a class on the member's preferences, under the same
row lock as every other preference save, so a name and a spec saved at the
same moment both land.  The race tests run real transactions
(``raid_prefs_race_harness.py``).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.models.wow.wow_raid_guild import WowRaidGuild
from app.repositories.wow import (
    wow_raid_event_repo,
    wow_raid_guild_repo,
    wow_raid_member_pref_repo,
    wow_raid_signup_repo,
)
from app.services.discord import raid_member_copy
from app.services.wow import raid_member_prefs_service
from app.services.wow.raid_member_prefs_service import NamedCharacter, PrefsUpdate

from raid_prefs_race_harness import USER, Save, at_once, race_guild, remember, save_in_own_transaction, saved_pref


def _name(wow_class: str, name: str | None) -> Save:
    """My sign-up's form saving *name* for *wow_class*."""

    async def save(db: AsyncSession, guild: WowRaidGuild) -> object:
        return await raid_member_prefs_service.set_character_name(
            db, guild=guild, discord_user_id=USER, wow_class=wow_class, name=name
        )

    return save


async def _guild(db: AsyncSession) -> WowRaidGuild:
    return await wow_raid_guild_repo.upsert_config(db, discord_guild_id=f"names-{uuid.uuid4().hex[:12]}")


async def _jaina(db: AsyncSession) -> WowRaidGuild:
    """A member who signed up as a Frost Mage and named their mage Jaina."""
    guild = await _guild(db)
    await remember("mage", "frost")(db, guild)
    await _name("mage", "Jaina")(db, guild)
    return guild


async def _raid_prefs(db: AsyncSession, guild: WowRaidGuild, **options: Any) -> PrefsUpdate:
    """``/raid prefs`` with *options* (``character="thrall"``); the others left out."""
    given: dict[str, Any] = {"wow_class": None, "spec": None, "dm_reminders": None, **options}
    return await raid_member_prefs_service.update_prefs(db, guild=guild, discord_user_id=USER, **given)


# ---------------------------------------------------------------------------
# The column checks
# ---------------------------------------------------------------------------


async def _sign_up_as(db: AsyncSession, name: str) -> None:
    guild = await _guild(db)
    event = await wow_raid_event_repo.create(
        db,
        guild_id=guild.id,
        raid_key="onyxia",
        starts_at=datetime.now(timezone.utc) + timedelta(days=1),
        size_cap=40,
        channel_id="200",
        created_by_user_id="300",
    )
    await wow_raid_signup_repo.upsert_signup(
        db,
        event_id=event.id,
        discord_user_id=USER,
        display_name="Thrall",
        status="confirmed",
        wow_class="mage",
        role="dps",
        spec="frost",
        character_name=name,
        set_character=True,
    )


async def test_a_sign_up_shows_no_one_letter_name(db: AsyncSession) -> None:
    with pytest.raises(IntegrityError):
        await _sign_up_as(db, "J")


async def test_a_sign_up_shows_no_13_letter_name(db: AsyncSession) -> None:
    # varchar(12) refuses it before the check does; asyncpg's error arrives as a plain DBAPIError.
    with pytest.raises(DBAPIError):
        await _sign_up_as(db, "Jainaproudmor")


@pytest.mark.parametrize("names", [["Jaina"], "Jaina"])
async def test_saved_names_are_an_object(db: AsyncSession, names: object) -> None:
    guild = await _guild(db)
    pref = await wow_raid_member_pref_repo.lock_or_create(db, guild_id=guild.id, discord_user_id=USER)

    pref.character_names = names  # type: ignore[assignment]
    with pytest.raises(IntegrityError):
        await db.flush()


async def test_saving_a_name_says_whether_it_changed(db: AsyncSession) -> None:
    guild = await _jaina(db)

    assert await _name("mage", "Jaina")(db, guild) is False
    assert await _name("mage", None)(db, guild) is True
    assert await _name("mage", None)(db, guild) is False


# ---------------------------------------------------------------------------
# /raid prefs character:
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("options", "named", "names"),
    [
        ({"wow_class": "shaman"}, NamedCharacter("shaman", "Thrallbot"), {"mage": "Jaina", "shaman": "Thrallbot"}),
        ({"spec": "priest.holy"}, NamedCharacter("priest", "Thrallbot"), {"mage": "Jaina", "priest": "Thrallbot"}),
        ({}, NamedCharacter("mage", "Thrallbot"), {"mage": "Thrallbot"}),
    ],
    ids=["class", "spec", "remembered-class"],
)
async def test_raid_prefs_names_the_class_it_leaves_remembered(
    db: AsyncSession, options: dict[str, str], named: NamedCharacter, names: dict[str, str]
) -> None:
    guild = await _jaina(db)

    result = await _raid_prefs(db, guild, character="thrallbot", **options)

    assert (result.error, result.named) == (None, named)
    assert result.pref is not None
    assert (result.pref.default_wow_class, result.pref.character_names) == (named.wow_class, names)


@pytest.mark.parametrize("typed", ["-", " "])
async def test_raid_prefs_clears_the_name(db: AsyncSession, typed: str) -> None:
    guild = await _jaina(db)

    result = await _raid_prefs(db, guild, character=typed)

    assert (result.error, result.named) == (None, NamedCharacter("mage", None))
    assert result.pref is not None
    assert result.pref.character_names == {}


async def test_raid_prefs_saves_a_name_and_dm_reminders_together(db: AsyncSession) -> None:
    guild = await _jaina(db)

    result = await _raid_prefs(db, guild, character="proudmoore", dm_reminders=False)

    assert result.pref is not None
    assert (result.pref.character_names, result.pref.dm_opt_out) == ({"mage": "Proudmoore"}, True)


@pytest.mark.parametrize(
    ("options", "error"),
    [
        ({"character": "thrallbot"}, raid_member_copy.CHAR_PREFS_NEEDS_CLASS),
        ({"character": "thrallbot", "dm_reminders": False}, raid_member_copy.CHAR_PREFS_NEEDS_CLASS),
        ({"wow_class": "shaman", "character": "Thrall 2"}, raid_member_copy.CHAR_LETTERS),
        (
            {"spec": "priest.holy", "character": "T", "dm_reminders": False},
            "Character names are 2-12 letters, and that one has 1. Try again.",
        ),
    ],
)
async def test_a_refused_name_saves_nothing(db: AsyncSession, options: dict[str, Any], error: str) -> None:
    guild = await _guild(db)

    result = await _raid_prefs(db, guild, **options)

    assert (result.pref, result.error) == (None, error)
    assert await wow_raid_member_pref_repo.get(db, guild_id=guild.id, discord_user_id=USER) is None


async def test_a_refused_name_keeps_what_was_saved(db: AsyncSession) -> None:
    guild = await _jaina(db)

    result = await _raid_prefs(db, guild, character="Jaina!", dm_reminders=False)

    assert result.error == raid_member_copy.CHAR_LETTERS
    pref = await raid_member_prefs_service.get(db, guild=guild, discord_user_id=USER)
    assert pref is not None
    assert (pref.character_names, pref.dm_opt_out) == ({"mage": "Jaina"}, False)


# ---------------------------------------------------------------------------
# Saves at the same moment
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("first", "second"),
    [(_name("mage", "Jaina"), remember("priest", "holy")), (remember("priest", "holy"), _name("mage", "Jaina"))],
    ids=["name-first", "spec-first"],
)
async def test_a_name_and_a_spec_saved_at_once_both_land(db_engine: AsyncEngine, first: Save, second: Save) -> None:
    async with race_guild(db_engine) as (maker, guild):
        await save_in_own_transaction(maker, guild, remember("mage", "frost"))

        await at_once(maker, guild, first, second)

        pref = await saved_pref(maker, guild)
        assert pref is not None
        assert (pref.saved_specs, pref.character_names) == ({"mage": "frost", "priest": "holy"}, {"mage": "Jaina"})


async def test_two_names_saved_at_once_both_land(db_engine: AsyncEngine) -> None:
    async with race_guild(db_engine) as (maker, guild):
        await at_once(maker, guild, _name("mage", "Jaina"), _name("shaman", "Thrall"))

        pref = await saved_pref(maker, guild)
        assert pref is not None
        assert pref.character_names == {"mage": "Jaina", "shaman": "Thrall"}
