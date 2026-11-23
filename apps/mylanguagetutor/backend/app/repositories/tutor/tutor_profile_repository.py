"""Repository for ``tutor_profile``. One row per user, keyed by ``user_id``."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from platform_shared.repositories.audited_writes import upsert_row
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tutor.tutor_profile import TutorProfile


async def get(db: AsyncSession, user_id: uuid.UUID) -> TutorProfile | None:
    return await db.get(TutorProfile, user_id)


async def upsert(
    db: AsyncSession, user_id: uuid.UUID, language_code: str, level: str,
) -> TutorProfile:
    """Create or update the user's profile.

    Through the ORM (``upsert_row``), so the audit log records the change.
    ``user_id`` is the primary key, so concurrent first saves collapse onto one
    row instead of the loser failing with an IntegrityError. ``created_at`` is
    left untouched on the update branch; ``updated_at`` is stamped on every
    save, as before.
    """
    profile, _ = await upsert_row(
        db, TutorProfile,
        TutorProfile.user_id == user_id,
        create={"user_id": user_id, "language_code": language_code, "level": level},
        update={
            "language_code": language_code,
            "level": level,
            "updated_at": datetime.now(timezone.utc),
        },
    )
    return profile
