"""tutor_profile -- the learner's onboarding choices (target language + level).

One row per user (``user_id`` is the primary key; FK ``ON DELETE CASCADE``).
Its existence is what "onboarded" means: the frontend skips the onboarding
screens once it is set. Kept out of the shared ``users`` table on purpose --
``users`` is the platform (Tier 1) shape every app shares.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.tutor_enums import LANGUAGE_CODES_SQL, LEVEL_CODES_SQL
from app.db.base import Base


class TutorProfile(Base):
    __tablename__ = "tutor_profile"
    __table_args__ = (
        CheckConstraint(
            f"language_code IN {LANGUAGE_CODES_SQL}",
            name="ck_tutor_profile_language_code",
        ),
        CheckConstraint(f"level IN {LEVEL_CODES_SQL}", name="ck_tutor_profile_level"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    language_code: Mapped[str] = mapped_column(String(8), nullable=False)
    level: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )
