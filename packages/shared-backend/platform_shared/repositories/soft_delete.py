"""Shared soft-delete helper.

The single public function ``soft_delete`` encapsulates the idempotent
"set ``deleted_at`` to now" mutation that is repeated across every
app-level repository that supports soft-deletion.

Contract
--------
* The field is set only when it is currently ``None``.  If it is already
  populated the row is left unchanged and the function returns ``False``.
* The caller is responsible for flushing and committing the session; this
  function intentionally does neither so callers can batch mutations in a
  single transaction.
* Tenant-scope filtering (``user_id`` / ``org_id`` WHERE clauses) stays in
  the per-repository function — that is app-specific logic that must not
  leak into shared infrastructure.
* Any extra fields that must change alongside ``deleted_at`` (e.g.
  ``status = "duplicate"``) stay in the per-repository function; only the
  timestamp flip is delegated here.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession


async def soft_delete(
    db: AsyncSession,
    instance: Any,
    *,
    deleted_at: datetime | None = None,
    deleted_at_field: str = "deleted_at",
) -> bool:
    """Set ``instance.<deleted_at_field>`` to now if not already set.

    Parameters
    ----------
    db:
        The active async session.  The session is NOT flushed or committed
        by this function — callers control transaction boundaries.
    instance:
        Any ORM model instance that has a ``deleted_at`` column (or
        whichever field name is given via ``deleted_at_field``).
    deleted_at:
        Timestamp to stamp the row with.  Defaults to
        ``datetime.now(timezone.utc)`` when ``None``.  Pass an explicit
        value when a service layer generates a single ``now`` to keep all
        rows in the same logical operation consistent.
    deleted_at_field:
        Name of the timestamp column to set.  Defaults to ``"deleted_at"``.

    Returns
    -------
    bool
        ``True`` if the row was newly soft-deleted, ``False`` if it was
        already deleted (idempotent — no mutation performed).
    """
    current: datetime | None = getattr(instance, deleted_at_field)
    if current is not None:
        return False

    stamp = deleted_at if deleted_at is not None else datetime.now(timezone.utc)
    setattr(instance, deleted_at_field, stamp)
    return True
