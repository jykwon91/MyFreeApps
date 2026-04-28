"""SQLAlchemy ORM model for ``video_call_notes``.

Per RENTALS_PLAN.md §5.3: notes captured during the host's video screening
call with an applicant. ``notes`` is encrypted because freeform host
observations are a defamation-risk surface (they often contain candid
character assessments). ``transcript_storage_key`` references an opaque
MinIO blob (encrypted at the bucket level).

``gut_rating`` is 1-5 (5 = best); the CheckConstraint enforces the range
when present.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.encrypted_string_type import EncryptedString
from app.db.base import Base


class VideoCallNote(Base):
    __tablename__ = "video_call_notes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    applicant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("applicants.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    scheduled_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
    )
    completed_at: Mapped[_dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    # PII — encrypted at rest. 10000 chars is generous; long observation
    # blocks are common after a 30-minute screening call.
    notes: Mapped[str | None] = mapped_column(EncryptedString(10000), nullable=True)
    gut_rating: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    transcript_storage_key: Mapped[str | None] = mapped_column(
        String(500), nullable=True,
    )

    key_version: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=1, server_default="1",
    )

    created_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: _dt.datetime.now(_dt.timezone.utc),
        server_default=func.now(),
    )
    updated_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: _dt.datetime.now(_dt.timezone.utc),
        onupdate=lambda: _dt.datetime.now(_dt.timezone.utc),
        server_default=func.now(),
    )

    __table_args__ = (
        CheckConstraint(
            "gut_rating IS NULL OR (gut_rating BETWEEN 1 AND 5)",
            name="chk_video_call_note_gut_rating",
        ),
        # Per-applicant timeline. Migration creates this with explicit
        # ``scheduled_at DESC`` via raw SQL — the ORM index here only needs
        # to declare the columns so SQLite test fixtures can mirror the table.
        Index(
            "ix_video_call_notes_applicant_scheduled",
            "applicant_id", "scheduled_at",
        ),
    )
