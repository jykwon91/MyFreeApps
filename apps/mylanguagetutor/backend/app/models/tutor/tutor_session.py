"""tutor_session -- one practice conversation in one language + scenario.

Tenant-scoped by ``user_id`` (FK ``ON DELETE CASCADE``) so account deletion
wipes it. ``language_code`` / ``scenario_slug`` / ``level`` / ``status`` are
``String(N)`` + ``CheckConstraint`` whose allowed values come from the Python
registries in ``app/domain`` (via ``app/core/tutor_enums.py``).

No ORM relationship to ``User`` on purpose: the shared account-deletion service
does ``db.delete(user)`` and relies on the database cascade.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.tutor_enums import (
    LANGUAGE_CODES_SQL,
    LEVEL_CODES_SQL,
    SCENARIO_SLUGS_SQL,
    SESSION_STATUS_CODES_SQL,
)
from app.db.base import Base
from app.domain.session_status import SessionStatus


class TutorSession(Base):
    __tablename__ = "tutor_session"
    __table_args__ = (
        CheckConstraint(
            f"language_code IN {LANGUAGE_CODES_SQL}",
            name="ck_tutor_session_language_code",
        ),
        CheckConstraint(
            f"scenario_slug IN {SCENARIO_SLUGS_SQL}",
            name="ck_tutor_session_scenario_slug",
        ),
        CheckConstraint(f"level IN {LEVEL_CODES_SQL}", name="ck_tutor_session_level"),
        CheckConstraint(
            f"status IN {SESSION_STATUS_CODES_SQL}", name="ck_tutor_session_status",
        ),
        Index("ix_tutor_session_user_id", "user_id"),
        # Backs GET /sessions (current user's, newest first).
        Index("ix_tutor_session_user_created", "user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    language_code: Mapped[str] = mapped_column(String(8), nullable=False)
    scenario_slug: Mapped[str] = mapped_column(String(40), nullable=False)
    level: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default=SessionStatus.ACTIVE.value,
        server_default=SessionStatus.ACTIVE.value,
    )
    turn_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0",
    )
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
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
