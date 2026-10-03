"""Group-planner repository — planner links, the sign-ups' group places and a raid's groups state.

Standalone async functions; the caller owns the transaction, apart from
a planner save's commit (``commit_plan_save``).  Only a planner save
writes the group places: the sign-up writers (``wow_raid_signup_repo``)
never touch them.
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import SmallInteger, column, delete, select, update, values
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_event import WowRaidEvent
from app.models.wow.wow_raid_plan_link import WowRaidPlanLink
from app.models.wow.wow_raid_signup import WowRaidSignup

# A planned place: (sign-up id, group, slot).
PlaceRow = tuple[uuid.UUID, int, int]


async def upsert_link(
    db: AsyncSession,
    *,
    event_id: uuid.UUID,
    discord_user_id: str,
    token_hash: str,
    created_at: datetime,
    expires_at: datetime,
) -> None:
    """Store a leader's link to a raid's planner, replacing theirs: the old token stops working."""
    stmt = pg_insert(WowRaidPlanLink).values(
        event_id=event_id,
        discord_user_id=discord_user_id,
        token_hash=token_hash,
        created_at=created_at,
        expires_at=expires_at,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["event_id", "discord_user_id"],
        set_={
            "token_hash": stmt.excluded.token_hash,
            "created_at": stmt.excluded.created_at,
            "expires_at": stmt.excluded.expires_at,
        },
    )
    await db.execute(stmt)


async def get_link(db: AsyncSession, *, event_id: uuid.UUID, token_hash: str) -> WowRaidPlanLink | None:
    """The link with *token_hash* to *event_id*'s planner, expired or not; None for any other raid's."""
    result = await db.execute(
        select(WowRaidPlanLink).where(
            WowRaidPlanLink.event_id == event_id,
            WowRaidPlanLink.token_hash == token_hash,
        )
    )
    return result.scalar_one_or_none()


async def delete_expired_links(db: AsyncSession, *, event_id: uuid.UUID, before: datetime) -> None:
    """Delete the raid's links that expired before *before*."""
    await db.execute(
        delete(WowRaidPlanLink).where(
            WowRaidPlanLink.event_id == event_id,
            WowRaidPlanLink.expires_at < before,
        )
    )


async def replace_assignments(
    db: AsyncSession, event_id: uuid.UUID, rows: Sequence[PlaceRow]
) -> list[WowRaidSignup]:
    """Make *rows* the raid's groups — everyone else leaves theirs — and return the raid's sign-ups, fresh.

    Every place is cleared first, so the partial unique index can't trip
    mid-save (a swap moves two players through each other's slot); then one
    ``UPDATE … FROM (VALUES …)`` sets the new ones.  ``updated_at`` stays as
    it was: a plan isn't a sign-up change (``last_classes`` orders by it).
    """
    await db.execute(
        update(WowRaidSignup)
        .where(WowRaidSignup.event_id == event_id, WowRaidSignup.raid_group.is_not(None))
        .values(raid_group=None, group_slot=None, updated_at=WowRaidSignup.updated_at)
        .execution_options(synchronize_session=False)
    )
    if rows:
        plan = values(
            column("id", UUID(as_uuid=True)),
            column("raid_group", SmallInteger),
            column("group_slot", SmallInteger),
            name="plan",
        ).data(list(rows))
        await db.execute(
            update(WowRaidSignup)
            .where(WowRaidSignup.id == plan.c.id, WowRaidSignup.event_id == event_id)
            .values(raid_group=plan.c.raid_group, group_slot=plan.c.group_slot, updated_at=WowRaidSignup.updated_at)
            .execution_options(synchronize_session=False)
        )
    result = await db.execute(
        select(WowRaidSignup)
        .where(WowRaidSignup.event_id == event_id)
        .order_by(WowRaidSignup.signed_up_at)
        .execution_options(populate_existing=True)
    )
    return list(result.scalars().all())


async def set_groups_state(
    db: AsyncSession, event: WowRaidEvent, *, published_at: datetime | None, now: datetime
) -> WowRaidEvent:
    """A planner save: the next version, who sees the groups (null = hidden) and when they changed."""
    event.groups_version += 1
    event.groups_published_at = published_at
    event.groups_updated_at = now
    await db.flush()
    return event


async def commit_plan_save(db: AsyncSession) -> None:
    """Commit a planner save: its flushed places (``replace_assignments``) and groups state.

    Transaction ownership for ``PUT /wow/raids/{web_id}/plan`` lives here in
    the repo layer — the route and service must NOT commit.  It lands before
    the response, so the post's background re-render reads the saved groups.
    On failure the transaction is rolled back and the error re-raised.
    """
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise
