"""Bound how long a statement waits for a row lock."""
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def set_local_lock_timeout(db: AsyncSession, timeout_ms: int) -> None:
    """``SET LOCAL lock_timeout`` for the current transaction (PostgreSQL only;
    SQLite has no row locks to wait on)."""
    if db.get_bind().dialect.name != "postgresql":
        return
    await db.execute(text(f"SET LOCAL lock_timeout = {int(timeout_ms)}"))
