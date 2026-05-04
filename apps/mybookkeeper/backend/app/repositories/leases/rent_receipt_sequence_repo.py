"""Repository for ``rent_receipt_sequences``.

The key operation here is an atomic increment — we use a raw INSERT ... ON
CONFLICT DO UPDATE so a single round-trip both initialises the row (if it
doesn't exist yet) and increments the counter, returning the new value.
This is the only safe pattern for a per-user sequence in a concurrent
environment.
"""
from __future__ import annotations

import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def next_number(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    year: int,
) -> int:
    """Atomically increment and return the next receipt number for the given
    (user_id, year) pair.

    Uses an INSERT ... ON CONFLICT UPDATE to handle both the first-use case
    (no row exists yet) and the regular increment case in a single statement.
    The RETURNING clause gives us the new value without a second read.
    """
    result = await db.execute(
        text(
            """
            INSERT INTO rent_receipt_sequences (user_id, year, last_number)
            VALUES (:user_id, :year, 1)
            ON CONFLICT (user_id, year)
            DO UPDATE SET last_number = rent_receipt_sequences.last_number + 1
            RETURNING last_number
            """
        ),
        {"user_id": str(user_id), "year": year},
    )
    row = result.fetchone()
    if row is None:
        raise RuntimeError("rent_receipt_sequences INSERT ... RETURNING returned no row")
    return int(row[0])


def format_receipt_number(year: int, number: int) -> str:
    """Format a receipt number as ``R-<year>-<zero-padded 4-digit number>``."""
    return f"R-{year}-{number:04d}"
