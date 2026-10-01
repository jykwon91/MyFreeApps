"""WowRaidNotification repository — ORM operations for ``wow_raid_notification``.

Standalone async functions; the caller owns the transaction.

Worker flow:
  1. schedule_for_event()  — idempotently insert rows from guild settings
  2. claim_due()           — atomically claim a batch using SKIP LOCKED
  3. mark_sent() / mark_failed() / mark_skipped() / mark_undeliverable() /
     defer() — post-dispatch bookkeeping (re-load the row with
     get_for_update() first: a cancel may have deleted it mid-flight)
  4. cancel_pending_for_event() — delete unsent rows when an event is cancelled
  5. schedule_user_rows() / schedule_channel_row() — worker fan-out
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import CTE, delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wow.wow_raid_notification import (
    MAX_ATTEMPTS,
    WowRaidNotification,
)

# How long a worker may hold a claim before another worker can reclaim the row.
_STALE_CLAIM_MINUTES: int = 10

# Retry backoff after a failed attempt: 1, 2, 4, 8 … minutes, capped.
_BACKOFF_BASE_MINUTES: int = 1
_BACKOFF_CAP_MINUTES: int = 30

# ``last_error`` marker for a DM Discord refused with 50007 (DMs closed).
# The dm_fallback post finds the players to mention by this exact value.
DM_BLOCKED_ERROR: str = "discord_cannot_dm:50007"
_SKIPPED_PREFIX: str = "skipped:"


def backoff_delay(attempts: int) -> timedelta:
    """Delay before the retry that follows failed attempt number ``attempts``."""
    exponent = max(attempts - 1, 0)
    minutes = min(_BACKOFF_BASE_MINUTES * (2**exponent), _BACKOFF_CAP_MINUTES)
    return timedelta(minutes=minutes)


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
            # Not held back by a retry backoff / fallback wait.
            (WowRaidNotification.next_attempt_at.is_(None))
            | (WowRaidNotification.next_attempt_at <= now)
        )
        .filter(
            # Unclaimed or stale claim
            (WowRaidNotification.claimed_at.is_(None))
            | (WowRaidNotification.claimed_at < stale_cutoff)
        )
        .order_by(WowRaidNotification.due_at)
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
    now: datetime | None = None,
) -> WowRaidNotification:
    """Increment attempt count, store the error and back off before the retry.

    When attempts reaches MAX_ATTEMPTS the row is given up on: sent_at is
    set to the current time so claim_due no longer picks it up, and
    last_error records why.
    """
    moment = now or datetime.now(timezone.utc)
    notification.attempts += 1
    notification.last_error = error
    notification.claimed_at = None
    notification.next_attempt_at = moment + backoff_delay(notification.attempts)
    if notification.attempts >= MAX_ATTEMPTS:
        # Give up — mark as sent so the row leaves the pending queue.
        notification.sent_at = datetime.now(timezone.utc)
    await db.flush()
    return notification


async def mark_skipped(
    db: AsyncSession, notification: WowRaidNotification, *, reason: str
) -> WowRaidNotification:
    """Close a row without sending (event cancelled, raid started, too late…)."""
    notification.sent_at = datetime.now(timezone.utc)
    notification.claimed_at = None
    notification.last_error = f"{_SKIPPED_PREFIX} {reason}"
    await db.flush()
    return notification


async def mark_undeliverable(
    db: AsyncSession, notification: WowRaidNotification, *, error: str
) -> WowRaidNotification:
    """Close a row Discord permanently refused (e.g. 50007) — no retry."""
    notification.attempts += 1
    notification.sent_at = datetime.now(timezone.utc)
    notification.claimed_at = None
    notification.last_error = error
    await db.flush()
    return notification


async def defer(
    db: AsyncSession, notification: WowRaidNotification, *, until: datetime
) -> WowRaidNotification:
    """Release the claim and hold the row back until *until* (no attempt used)."""
    notification.claimed_at = None
    notification.next_attempt_at = until
    await db.flush()
    return notification


async def get_for_update(
    db: AsyncSession, notification_id: uuid.UUID
) -> WowRaidNotification | None:
    """Re-load a claimed row with a row lock; None if a cancel deleted it."""
    result = await db.execute(
        select(WowRaidNotification)
        .where(WowRaidNotification.id == notification_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


async def schedule_user_rows(
    db: AsyncSession,
    *,
    event_id: uuid.UUID,
    kind: str,
    due_at: datetime,
    user_ids: list[str],
) -> int:
    """Insert one per-user row per id.  Idempotent (``uq_wowraidnotif_user_notif``).

    The caller passes the *trigger's* ``due_at`` so a retried fan-out hits
    the unique index instead of scheduling a second DM.
    """
    if not user_ids:
        return 0
    rows = [
        {"event_id": event_id, "kind": kind, "target_user_id": user_id, "due_at": due_at}
        for user_id in dict.fromkeys(user_ids)
    ]
    result = await db.execute(
        pg_insert(WowRaidNotification).values(rows).on_conflict_do_nothing()
    )
    await db.flush()
    return result.rowcount or 0


async def schedule_channel_row(
    db: AsyncSession, *, event_id: uuid.UUID, kind: str, due_at: datetime
) -> int:
    """Insert one channel-post row.  Idempotent (``uq_wowraidnotif_channel_post``)."""
    result = await db.execute(
        pg_insert(WowRaidNotification)
        .values(event_id=event_id, kind=kind, target_user_id=None, due_at=due_at)
        .on_conflict_do_nothing()
    )
    await db.flush()
    return result.rowcount or 0


async def count_pending_user_rows(
    db: AsyncSession, *, event_id: uuid.UUID, kind: str, due_at: datetime
) -> int:
    """Per-user rows of one fan-out (*kind*, *due_at*) that are not finished yet."""
    result = await db.execute(
        select(func.count())
        .select_from(WowRaidNotification)
        .where(
            WowRaidNotification.event_id == event_id,
            WowRaidNotification.kind == kind,
            WowRaidNotification.target_user_id.is_not(None),
            WowRaidNotification.due_at == due_at,
            WowRaidNotification.sent_at.is_(None),
        )
    )
    return int(result.scalar_one())


async def dm_blocked_user_ids(
    db: AsyncSession, *, event_id: uuid.UUID, kind: str, due_at: datetime
) -> list[str]:
    """Players whose DM in one fan-out (*kind*, *due_at*) failed with 50007.

    Scoped to *due_at* so a raid whose time was edited (new fan-out) doesn't
    re-mention players from the earlier round.
    """
    result = await db.execute(
        select(WowRaidNotification.target_user_id)
        .where(
            WowRaidNotification.event_id == event_id,
            WowRaidNotification.kind == kind,
            WowRaidNotification.target_user_id.is_not(None),
            WowRaidNotification.due_at == due_at,
            WowRaidNotification.last_error == DM_BLOCKED_ERROR,
        )
        .order_by(WowRaidNotification.created_at, WowRaidNotification.target_user_id)
    )
    return [user_id for user_id in result.scalars().all() if user_id is not None]


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
