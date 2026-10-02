"""WowRaidSignup repository — ORM operations for ``wow_raid_signup``.

Standalone async functions; the caller owns the transaction.
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
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
    character_name: Optional[str] = None,
    set_character: bool = False,
    clear_note: bool = False,
) -> WowRaidSignup:
    """Insert or update a player's signup for an event.

    Single INSERT … ON CONFLICT (event_id, discord_user_id) DO UPDATE, so two
    near-simultaneous button clicks from the same player can't race into a
    unique-violation.  ``signed_up_at`` is preserved on update (it is the
    order number and orders the queue) unless ``requeue`` is set — the
    signup service passes it when a player joins the queue, or takes a seat
    again after tentative, bench or absence.
    A new row always takes ``character_name``; an existing one keeps its
    own unless ``set_character`` is set (the player switched class).
    An existing row keeps its ``note`` unless ``clear_note`` is set (the
    player's status changed).  ``updated_at`` is refreshed.  Returns the
    post-upsert row.
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
    if set_character:
        update_set["character_name"] = character_name
    if clear_note:
        update_set["note"] = None
    values = {
        "event_id": event_id,
        "discord_user_id": discord_user_id,
        "display_name": display_name,
        "status": status,
        "wow_class": wow_class,
        "role": role,
        "spec": spec,
        "character_name": character_name,
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
    """Rename a signup; its status and place in the order (``signed_up_at``) stay as they are."""
    signup.display_name = display_name
    await db.flush()


async def set_character_name(db: AsyncSession, signup: WowRaidSignup, name: str | None) -> None:
    """Change the character name a signup shows (None shows the Discord name)."""
    signup.character_name = name
    await db.flush()


async def set_note(db: AsyncSession, signup: WowRaidSignup, note: str | None) -> None:
    """Change the note the member left the raid leader (None removes it)."""
    signup.note = note
    await db.flush()


async def set_status(
    db: AsyncSession, signup: WowRaidSignup, status: str, *, signed_up_at: datetime | None = None
) -> None:
    """Move a signup to *status* and clear its note (it was about the old status).

    Its place in the order (``signed_up_at``) changes only when given: a
    leader's swap seats a player at the benched seat holder's number.
    """
    signup.status = status
    signup.note = None
    signup.updated_at = datetime.now(timezone.utc)
    if signed_up_at is not None:
        signup.signed_up_at = signed_up_at
    await db.flush()


async def promote(db: AsyncSession, signups: Sequence[WowRaidSignup]) -> None:
    """The queue moving up: each of *signups* gets a seat, keeping their note and place in the order."""
    now = datetime.now(timezone.utc)
    for signup in signups:
        signup.status = "confirmed"
        signup.updated_at = now
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


async def last_classes(db: AsyncSession, *, guild_id: uuid.UUID, user_ids: Sequence[str]) -> dict[str, str]:
    """Each of *user_ids*' class on their latest sign-up with one, across the server's raids.

    Someone who never picked a class there is missing from the answer.
    """
    if not user_ids:
        return {}
    result = await db.execute(
        select(WowRaidSignup.discord_user_id, WowRaidSignup.wow_class)
        .join(WowRaidEvent, WowRaidEvent.id == WowRaidSignup.event_id)
        .where(
            WowRaidEvent.guild_id == guild_id,
            WowRaidSignup.wow_class.is_not(None),
            WowRaidSignup.discord_user_id.in_(user_ids),
        )
        .distinct(WowRaidSignup.discord_user_id)
        .order_by(WowRaidSignup.discord_user_id, WowRaidSignup.updated_at.desc())
    )
    return {user_id: wow_class for user_id, wow_class in result.all()}


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
