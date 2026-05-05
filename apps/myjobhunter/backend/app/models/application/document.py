"""Document model — cover letters, tailored resumes, saved JDs, etc.

Soft-deleted via ``deleted_at``. Supports both text-body documents
(e.g. a cover-letter draft stored as ``body`` with no ``file_path``)
and uploaded binary files (PDF/DOCX/TXT stored in MinIO).
``application_id`` is nullable so documents can exist before they are
linked to a specific application.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Nullable — documents can be created before linking to an application.
    application_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("applications.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Human-readable title (e.g. "Cover letter for Acme SWE role").
    title: Mapped[str] = mapped_column(String(255), nullable=False)

    # Canonical document kind — enforced via CheckConstraint.
    kind: Mapped[str] = mapped_column(String(30), nullable=False)

    # Text body — populated for text-only documents (cover-letter drafts, etc.).
    body: Mapped[str | None] = mapped_column(Text, nullable=True)

    # MinIO object key — populated when a file was uploaded.
    file_path: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Display filename (original upload name, not the object key).
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # MIME type of the uploaded file.
    content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # File size in bytes (populated alongside file_path).
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    application: Mapped["Application | None"] = relationship(  # type: ignore[name-defined]
        "Application", back_populates="documents",
    )

    __table_args__ = (
        CheckConstraint(
            "kind IN ('cover_letter','tailored_resume','job_description','portfolio','other')",
            name="chk_document_kind",
        ),
        Index("ix_document_user_kind", "user_id", "kind"),
        Index("ix_document_user_app", "user_id", "application_id"),
    )
