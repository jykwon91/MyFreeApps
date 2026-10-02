"""WowRaidMemberPref repository — ORM operations for ``wow_raid_member_pref``.

Standalone async functions; the caller owns the transaction.
"""
from __future__ import annotations

import uuid
from collections.abc import Mapping
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_member_pref import WowRaidMemberPref


async def get(
    db: AsyncSession, *, guild_id: uuid.UUID, discord_user_id: str
) -> WowRaidMemberPref | None:
    """Return the preference row for a player in a guild, or None."""
    result = await db.execute(
        select(WowRaidMemberPref).where(
            WowRaidMemberPref.guild_id == guild_id,
            WowRaidMemberPref.discord_user_id == discord_user_id,
        )
    )
    return result.scalar_one_or_none()


async def lock_or_create(
    db: AsyncSession, *, guild_id: uuid.UUID, discord_user_id: str
) -> WowRaidMemberPref:
    """The player's preference row, locked until the transaction ends (created empty if missing).

    Saves read the row, change a field, then write every field back
    (``upsert``), so one member's saves must run one after another: two taps
    on two raid posts at once would otherwise both insert (the second fails
    the unique constraint) or both write, the second dropping what the first
    saved.  ``ON CONFLICT DO NOTHING`` waits for a concurrent insert of the
    same row, and ``FOR UPDATE`` then waits for its writer and reads what it
    committed.  ``populate_existing`` refreshes an already-loaded instance.
    """
    await db.execute(
        pg_insert(WowRaidMemberPref)
        .values(guild_id=guild_id, discord_user_id=discord_user_id)
        .on_conflict_do_nothing(index_elements=["guild_id", "discord_user_id"])
    )
    result = await db.execute(
        select(WowRaidMemberPref)
        .where(
            WowRaidMemberPref.guild_id == guild_id,
            WowRaidMemberPref.discord_user_id == discord_user_id,
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    return result.scalar_one()


async def upsert(
    db: AsyncSession,
    *,
    guild_id: uuid.UUID,
    discord_user_id: str,
    default_wow_class: Optional[str] = None,
    default_role: Optional[str] = None,
    saved_specs: Optional[Mapping[str, str]] = None,
    dm_opt_out: bool = False,
) -> WowRaidMemberPref:
    """Insert or update a member's preferences.

    All fields are replaced on conflict — callers should pass the complete
    desired state each time (``saved_specs=None`` means none saved), read
    under ``lock_or_create``.
    """
    specs = dict(saved_specs or {})
    existing = await get(db, guild_id=guild_id, discord_user_id=discord_user_id)
    if existing is not None:
        changed = False
        if existing.default_wow_class != default_wow_class:
            existing.default_wow_class = default_wow_class
            changed = True
        if existing.default_role != default_role:
            existing.default_role = default_role
            changed = True
        if existing.saved_specs != specs:
            existing.saved_specs = specs
            changed = True
        if existing.dm_opt_out != dm_opt_out:
            existing.dm_opt_out = dm_opt_out
            changed = True
        if changed:
            existing.updated_at = datetime.now(timezone.utc)
            await db.flush()
        return existing

    row = WowRaidMemberPref(
        guild_id=guild_id,
        discord_user_id=discord_user_id,
        default_wow_class=default_wow_class,
        default_role=default_role,
        saved_specs=specs,
        dm_opt_out=dm_opt_out,
    )
    db.add(row)
    await db.flush()
    return row


async def set_character_names(
    db: AsyncSession, pref: WowRaidMemberPref, names: Mapping[str, object]
) -> None:
    """Replace a member's saved character names (class → name); read under ``lock_or_create``."""
    # A new dict: JSONB columns don't track changes made in place.
    pref.character_names = dict(names)
    pref.updated_at = datetime.now(timezone.utc)
    await db.flush()


async def opted_out_user_ids(
    db: AsyncSession, *, guild_id: uuid.UUID, discord_user_ids: list[str]
) -> set[str]:
    """Subset of *discord_user_ids* who turned DM reminders off in this guild."""
    if not discord_user_ids:
        return set()
    result = await db.execute(
        select(WowRaidMemberPref.discord_user_id).where(
            WowRaidMemberPref.guild_id == guild_id,
            WowRaidMemberPref.discord_user_id.in_(discord_user_ids),
            WowRaidMemberPref.dm_opt_out.is_(True),
        )
    )
    return set(result.scalars().all())
