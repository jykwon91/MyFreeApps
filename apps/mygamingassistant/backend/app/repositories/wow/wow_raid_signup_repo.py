"""WowRaidSignup repository — ORM operations for ``wow_raid_signup``.

Standalone async functions; the caller owns the transaction.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_signup import WowRaidSignup


async def upsert_signup(
    db: AsyncSession,
    *,
    event_id: uuid.UUID,
    discord_user_id: str,
    display_name: str,
    status: str,
    wow_class: Optional[str] = None,
    role: Optional[str] = None,
) -> WowRaidSignup:
    """Insert or update a player's signup for an event.

    On conflict (same event + user): updates all mutable fields and refreshes
    ``updated_at``.  Returns the row in its post-upsert state.
    """
    result = await db.execute(
        select(WowRaidSignup).where(
            WowRaidSignup.event_id == event_id,
            WowRaidSignup.discord_user_id == discord_user_id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        existing.display_name = display_name
        existing.status = status
        existing.wow_class = wow_class
        existing.role = role
        existing.updated_at = datetime.now(timezone.utc)
        await db.flush()
        return existing

    row = WowRaidSignup(
        event_id=event_id,
        discord_user_id=discord_user_id,
        display_name=display_name,
        status=status,
        wow_class=wow_class,
        role=role,
    )
    db.add(row)
    await db.flush()
    return row


async def list_for_event(
    db: AsyncSession, event_id: uuid.UUID
) -> list[WowRaidSignup]:
    """Return all signups for an event, ordered by ``signed_up_at`` ASC."""
    result = await db.execute(
        select(WowRaidSignup)
        .where(WowRaidSignup.event_id == event_id)
        .order_by(WowRaidSignup.signed_up_at)
    )
    return list(result.scalars().all())


async def counts_by_role_status(
    db: AsyncSession, event_id: uuid.UUID
) -> dict[tuple[str | None, str], int]:
    """Return a mapping of (role, status) → count for all signups on an event.

    ``role`` can be None when a player hasn't chosen a role yet.  Callers
    can sum over statuses or roles as needed (e.g. total confirmed per role).
    """
    result = await db.execute(
        select(
            WowRaidSignup.role,
            WowRaidSignup.status,
            func.count().label("n"),
        )
        .where(WowRaidSignup.event_id == event_id)
        .group_by(WowRaidSignup.role, WowRaidSignup.status)
    )
    return {(row.role, row.status): row.n for row in result}
