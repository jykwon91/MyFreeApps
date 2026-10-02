"""Migration 0038 against Postgres — a raid's Discord event and thread: the columns, the check, the defaults."""
from __future__ import annotations

import importlib.util
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_guild import WowRaidGuild
from app.repositories.wow import wow_raid_event_repo, wow_raid_guild_repo
from app.services.wow import raid_event_service

_MIGRATION = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "0038_wow_raid_discord_extras.py"
_STARTS = datetime.now(timezone.utc) + timedelta(days=10)


async def _guild(db: AsyncSession, **defaults: bool | None) -> WowRaidGuild:
    return await wow_raid_guild_repo.upsert_config(
        db, discord_guild_id="810000000000000038", raid_channel_id="c1", timezone="America/New_York", **defaults
    )


async def _draft(db: AsyncSession, guild: WowRaidGuild) -> WowRaidEvent:
    return await raid_event_service.create_draft(
        db,
        guild=guild,
        raid_key="onyxia",
        starts_at=_STARTS,
        size_cap=40,
        notes=None,
        created_by_user_id="u0",
        created_by_display_name="Thrall",
    )


def test_0038_follows_0037() -> None:
    spec = importlib.util.spec_from_file_location("migration_0038", _MIGRATION)
    assert spec is not None and spec.loader is not None
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    assert (migration.revision, migration.down_revision) == ("0038", "0037")


async def test_rows_from_before_0038_have_both_extras_off(db: AsyncSession) -> None:
    """The toggles are NOT NULL with a server default of false, so a raid or server already there reads off."""
    columns = await db.execute(
        text(
            "SELECT table_name, column_name, is_nullable, column_default FROM information_schema.columns "
            "WHERE (table_name = 'wow_raid_event' AND column_name IN ('discord_event_enabled', 'thread_enabled')) "
            "OR (table_name = 'wow_raid_guild' AND column_name IN ('default_discord_event', 'default_thread'))"
        )
    )
    found = {(row.table_name, row.column_name): (row.is_nullable, row.column_default) for row in columns}

    assert found == {
        ("wow_raid_event", "discord_event_enabled"): ("NO", "false"),
        ("wow_raid_event", "thread_enabled"): ("NO", "false"),
        ("wow_raid_guild", "default_discord_event"): ("NO", "false"),
        ("wow_raid_guild", "default_thread"): ("NO", "false"),
    }


@pytest.mark.parametrize("minutes", [14, 361])
async def test_a_length_outside_15_minutes_to_6_hours_is_refused(db: AsyncSession, minutes: int) -> None:
    event = await _draft(db, await _guild(db))

    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            await wow_raid_event_repo.set_extras_options(
                db, event, discord_event=False, thread=False, length_minutes=minutes
            )


@pytest.mark.parametrize("minutes", [15, 360, None])
async def test_a_length_inside_the_range_is_kept(db: AsyncSession, minutes: int | None) -> None:
    event = await _draft(db, await _guild(db))

    await wow_raid_event_repo.set_extras_options(db, event, discord_event=True, thread=False, length_minutes=minutes)
    await db.refresh(event)

    assert (event.discord_event_enabled, event.thread_enabled, event.length_minutes) == (True, False, minutes)


async def test_a_new_raid_takes_the_servers_defaults(db: AsyncSession) -> None:
    off = await _draft(db, await _guild(db))
    assert (off.discord_event_enabled, off.thread_enabled) == (False, False)

    guild = await _guild(db, default_discord_event=True, default_thread=True)
    on = await _draft(db, guild)
    assert (on.discord_event_enabled, on.thread_enabled) == (True, True)
    assert on.length_minutes is None and on.discord_event_id is None and on.thread_id is None


async def test_setup_without_the_options_keeps_the_defaults(db: AsyncSession) -> None:
    guild = await _guild(db, default_discord_event=True, default_thread=True)

    await _guild(db, default_discord_event=None, default_thread=None)
    await db.refresh(guild)
    assert (guild.default_discord_event, guild.default_thread) == (True, True)

    await _guild(db, default_discord_event=False)
    await db.refresh(guild)
    assert (guild.default_discord_event, guild.default_thread) == (False, True)
