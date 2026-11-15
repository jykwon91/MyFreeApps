"""Repository for ``tutor_profile``. One row per user, keyed by ``user_id``."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tutor.tutor_profile import TutorProfile


async def get(db: AsyncSession, user_id: uuid.UUID) -> TutorProfile | None:
    return await db.get(TutorProfile, user_id)


async def upsert(
    db: AsyncSession, user_id: uuid.UUID, language_code: str, level: str,
) -> TutorProfile:
    """Create or update the user's profile in one atomic statement.

    ``user_id`` is the primary key, so concurrent first saves collapse onto one
    row instead of the loser failing with an IntegrityError. ``created_at`` is
    left untouched on the update branch.
    """
    stmt = pg_insert(TutorProfile).values(
        user_id=user_id, language_code=language_code, level=level,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=[TutorProfile.user_id],
        set_={
            "language_code": stmt.excluded.language_code,
            "level": stmt.excluded.level,
            "updated_at": datetime.now(timezone.utc),
        },
    ).returning(TutorProfile)
    result = await db.execute(stmt, execution_options={"populate_existing": True})
    return result.scalar_one()
