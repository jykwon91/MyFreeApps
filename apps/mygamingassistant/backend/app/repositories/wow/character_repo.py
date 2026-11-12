"""WowCharacter repository — stored WoW Forever characters.

Standalone functions like the other MGA repositories. The caller owns the
transaction; these only flush.
"""
from __future__ import annotations

import zlib
from datetime import datetime
from typing import Any

from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import undefer

from app.models.wow.character import WowCharacter

# Advisory-lock namespace (first int of the two-int form) for writing one character.
_LOCK_NAMESPACE = zlib.crc32(b"mga.wow_character") & 0x7FFFFFFF

# The fields a fetch writes. ``save_fetched`` refuses any other.
FETCHED_FIELDS = frozenset({
    "blizzard_character_id", "slug", "name", "surname", "class_id", "sheet", "sheet_version",
    "fetched_at", "checked_at", "last_error", "last_error_at", "gone_at",
})


async def lock_character(db: AsyncSession, blizzard_character_id: int) -> None:
    """Wait for, then hold until commit, the write lock of one character.

    Two lookups of the same new character at once would otherwise both insert it.
    """
    key = zlib.crc32(str(blizzard_character_id).encode()) & 0x7FFFFFFF
    await db.execute(text("SELECT pg_advisory_xact_lock(:ns, :key)"), {"ns": _LOCK_NAMESPACE, "key": key})


async def get_by_blizzard_id(db: AsyncSession, blizzard_character_id: int) -> WowCharacter | None:
    result = await db.execute(
        select(WowCharacter)
        .options(undefer(WowCharacter.sheet))
        .where(WowCharacter.blizzard_character_id == blizzard_character_id)
    )
    return result.scalar_one_or_none()


async def get_live_by_slug(db: AsyncSession, slug: str) -> WowCharacter | None:
    result = await db.execute(
        select(WowCharacter)
        .options(undefer(WowCharacter.sheet))
        .where(WowCharacter.slug == slug, WowCharacter.gone_at.is_(None))
    )
    return result.scalar_one_or_none()


async def save_fetched(db: AsyncSession, row: WowCharacter | None, values: dict[str, Any]) -> WowCharacter:
    """Insert the character (``row`` None) or overwrite ``row`` with a fetch's values."""
    unknown = set(values) - FETCHED_FIELDS
    if unknown:
        raise ValueError(f"character_repo.save_fetched: unknown fields {sorted(unknown)}")
    if row is None:
        row = WowCharacter(**values)
        db.add(row)
    else:
        for field, value in values.items():
            setattr(row, field, value)
    await db.flush()
    return row


async def mark_gone(db: AsyncSession, row: WowCharacter, at: datetime) -> None:
    row.gone_at = at
    row.checked_at = at
    await db.flush()


async def mark_live_slug_gone(db: AsyncSession, slug: str, at: datetime) -> bool:
    """Blizzard has no character by this name: mark the stored one gone. False when none is stored."""
    result = await db.execute(
        update(WowCharacter)
        .where(WowCharacter.slug == slug, WowCharacter.gone_at.is_(None))
        .values(gone_at=at, checked_at=at)
    )
    return bool(result.rowcount)


async def record_error(db: AsyncSession, slug: str, message: str, at: datetime) -> bool:
    """A failed fetch of a stored live character. False when none is stored."""
    result = await db.execute(
        update(WowCharacter)
        .where(WowCharacter.slug == slug, WowCharacter.gone_at.is_(None))
        .values(checked_at=at, last_error=message, last_error_at=at)
    )
    return bool(result.rowcount)
