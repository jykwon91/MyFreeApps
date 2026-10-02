"""WowRaidSignup repository — ORM operations for ``wow_raid_signup``.

Standalone async functions; the caller owns the transaction.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
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
    spec: Optional[str] = None,
    requeue: bool = False,
) -> WowRaidSignup:
    """Insert or update a player's signup for an event.

    Single INSERT … ON CONFLICT (event_id, discord_user_id) DO UPDATE, so two
    near-simultaneous button clicks from the same player can't race into a
    unique-violation.  ``signed_up_at`` is preserved on update (it is the
    order number and orders the queue) unless ``requeue`` is set — the
    signup service passes it when a player joins the queue, or takes a seat
    again after tentative, bench or absence.
    ``updated_at`` is refreshed.  Returns the post-upsert row.
    """
    now = datetime.now(timezone.utc)
    update_set: dict[str, object] = {
        "display_name": display_name,
        "status": status,
        "wow_class": wow_class,
        "role": role,
        "spec": spec,
        "updated_at": now,
    }
    if requeue:
        update_set["signed_up_at"] = now
    values = {
        "event_id": event_id,
        "discord_user_id": discord_user_id,
        "display_name": display_name,
        "status": status,
        "wow_class": wow_class,
        "role": role,
        "spec": spec,
    }
    stmt = (
        pg_insert(WowRaidSignup)
        .values(**values)
        .on_conflict_do_update(
            index_elements=["event_id", "discord_user_id"],
            set_=update_set,
        )
        .returning(WowRaidSignup)
        .execution_options(populate_existing=True)
    )
    result = await db.execute(stmt)
    return result.scalar_one()


async def delete(db: AsyncSession, signup: WowRaidSignup) -> None:
    """Remove a player's signup (a leader taking them off the raid)."""
    await db.delete(signup)
    await db.flush()


async def set_display_name(db: AsyncSession, signup: WowRaidSignup, display_name: str) -> None:
    """Rename a signup without touching its status or ``updated_at`` (a name isn't a sign-up change)."""
    signup.display_name = display_name
    await db.flush()


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


async def get(
    db: AsyncSession, *, event_id: uuid.UUID, discord_user_id: str
) -> WowRaidSignup | None:
    """Return one player's signup for an event, or None."""
    result = await db.execute(
        select(WowRaidSignup).where(
            WowRaidSignup.event_id == event_id,
            WowRaidSignup.discord_user_id == discord_user_id,
        )
    )
    return result.scalar_one_or_none()


async def list_for_events(
    db: AsyncSession, event_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[WowRaidSignup]]:
    """Signups for several events in one query, grouped by event id."""
    grouped: dict[uuid.UUID, list[WowRaidSignup]] = {event_id: [] for event_id in event_ids}
    if not event_ids:
        return grouped
    result = await db.execute(
        select(WowRaidSignup)
        .where(WowRaidSignup.event_id.in_(event_ids))
        .order_by(WowRaidSignup.signed_up_at)
    )
    for signup in result.scalars().all():
        grouped[signup.event_id].append(signup)
    return grouped


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
