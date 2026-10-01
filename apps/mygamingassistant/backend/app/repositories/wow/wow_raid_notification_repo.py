"""WowRaidNotification repository — ORM operations for ``wow_raid_notification``.

Standalone async functions; the caller owns the transaction.

Worker flow:
  1. schedule_for_event()  — idempotently insert rows from guild settings
  2. claim_due()           — atomically claim a batch using SKIP LOCKED
  3. mark_sent() / mark_failed() — post-dispatch bookkeeping
  4. cancel_pending_for_event() — delete unsent rows when an event is cancelled
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import CTE, delete, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_notification import (
    MAX_ATTEMPTS,
    NOTIFICATION_KINDS,
    WowRaidNotification,
)

# How long a worker may hold a claim before another worker can reclaim the row.
_STALE_CLAIM_MINUTES: int = 10


def _build_schedule_rows(
    event_id: uuid.UUID,
    starts_at: datetime,
    guild_settings: dict[str, Any],
) -> list[dict[str, Any]]:
    """Return dicts suitable for bulk-insert into wow_raid_notification.

    Pure function — no DB access.  Used by schedule_for_event and testable
    without a database session.
    """
    nudge_offsets: list[int] = guild_settings.get(
        "nudge_offsets_minutes", [2880, 1440]
    )
    consumables_minutes: int = guild_settings.get(
        "consumables_reminder_minutes", 1440
    )
    ready_check_minutes: int = guild_settings.get("ready_check_minutes", 60)

    rows: list[dict[str, Any]] = []

    # signup_nudge — one channel post per configured offset
    for offset_minutes in nudge_offsets:
        rows.append(
            {
                "event_id": event_id,
                "kind": "signup_nudge",
                "target_user_id": None,
                "due_at": starts_at - timedelta(minutes=offset_minutes),
            }
        )

    # consumables_reminder — single channel post
    rows.append(
        {
            "event_id": event_id,
            "kind": "consumables_reminder",
            "target_user_id": None,
            "due_at": starts_at - timedelta(minutes=consumables_minutes),
        }
    )

    # ready_check — single channel post
    rows.append(
        {
            "event_id": event_id,
            "kind": "ready_check",
            "target_user_id": None,
            "due_at": starts_at - timedelta(minutes=ready_check_minutes),
        }
    )

    return rows


def _drop_past_due(
    rows: list[dict[str, Any]], *, now: datetime
) -> list[dict[str, Any]]:
    """Drop rows whose ``due_at`` has already passed.

    A raid created 20h out must not fire its 48h and 24h nudges the moment
    the worker next ticks — those windows are simply missed.
    """
    return [row for row in rows if row["due_at"] > now]


async def schedule_for_event(
    db: AsyncSession,
    *,
    event_id: uuid.UUID,
    starts_at: datetime,
    guild_settings: dict[str, Any],
    now: datetime | None = None,
) -> int:
    """Insert notification rows derived from guild settings.  Idempotent.

    Rows already past due at scheduling time are skipped.  Uses INSERT …
    ON CONFLICT DO NOTHING (no explicit target) so both partial unique
    indexes on wow_raid_notification are honoured.  Returns the number of
    rows actually inserted.
    """
    rows = _drop_past_due(
        _build_schedule_rows(event_id, starts_at, guild_settings),
        now=now or datetime.now(timezone.utc),
    )
    if not rows:
        return 0

    stmt = pg_insert(WowRaidNotification).values(rows).on_conflict_do_nothing()
    result = await db.execute(stmt)
    await db.flush()
    return result.rowcount or 0


async def claim_due(
    db: AsyncSession,
    *,
    now: datetime,
    limit: int = 50,
) -> list[WowRaidNotification]:
    """Atomically claim up to *limit* due, unclaimed notifications.

    Uses a CTE with SELECT … FOR UPDATE SKIP LOCKED to avoid concurrent
    workers claiming the same rows.  A previously claimed row whose
    ``claimed_at`` is older than _STALE_CLAIM_MINUTES (and still unsent)
    is treated as abandoned and reclaimed.

    Sets ``claimed_at = now`` on claimed rows.  Returns the claimed rows.
    """
    stale_cutoff = now - timedelta(minutes=_STALE_CLAIM_MINUTES)

    # CTE: select IDs to claim with SKIP LOCKED.
    cte: CTE = (
        select(WowRaidNotification.id)
        .where(
            WowRaidNotification.sent_at.is_(None),
            WowRaidNotification.due_at <= now,
            WowRaidNotification.attempts < MAX_ATTEMPTS,
        )
        .filter(
            # Unclaimed or stale claim
            (WowRaidNotification.claimed_at.is_(None))
            | (WowRaidNotification.claimed_at < stale_cutoff)
        )
        .limit(limit)
        .with_for_update(skip_locked=True)
        .cte("claimable")
    )

    stmt = (
        update(WowRaidNotification)
        .where(WowRaidNotification.id.in_(select(cte.c.id)))
        .values(claimed_at=now)
        .returning(WowRaidNotification)
    )
    result = await db.execute(stmt)
    await db.flush()
    return list(result.scalars().all())


async def mark_sent(
    db: AsyncSession, notification: WowRaidNotification
) -> WowRaidNotification:
    """Mark a notification as successfully sent."""
    notification.sent_at = datetime.now(timezone.utc)
    notification.claimed_at = None
    await db.flush()
    return notification


async def mark_failed(
    db: AsyncSession,
    notification: WowRaidNotification,
    *,
    error: str,
) -> WowRaidNotification:
    """Increment attempt count and store the error.

    When attempts reaches MAX_ATTEMPTS the row is given up on: sent_at is
    set to the current time so claim_due no longer picks it up, and
    last_error records why.
    """
    notification.attempts += 1
    notification.last_error = error
    notification.claimed_at = None
    if notification.attempts >= MAX_ATTEMPTS:
        # Give up — mark as sent so the row leaves the pending queue.
        notification.sent_at = datetime.now(timezone.utc)
    await db.flush()
    return notification


async def cancel_pending_for_event(
    db: AsyncSession, event_id: uuid.UUID
) -> int:
    """Delete all unsent notification rows for *event_id*.

    Called when an event is cancelled — in-flight claims (claimed_at IS NOT
    NULL but sent_at IS NULL) are also deleted; the worker must handle a
    missing row gracefully when it calls mark_sent/mark_failed.

    Returns the count of deleted rows.
    """
    result = await db.execute(
        delete(WowRaidNotification)
        .where(
            WowRaidNotification.event_id == event_id,
            WowRaidNotification.sent_at.is_(None),
        )
    )
    await db.flush()
    return result.rowcount or 0
