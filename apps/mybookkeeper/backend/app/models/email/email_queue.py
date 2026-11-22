import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, String, ForeignKey, DateTime, Index, UniqueConstraint, Integer, LargeBinary
from sqlalchemy.orm import Mapped, mapped_column, relationship, deferred
from sqlalchemy.dialects.postgresql import UUID

from app.core.email_queue_enums import EMAIL_QUEUE_STATUSES_SQL
from app.db.base import Base


class EmailQueue(Base):
    __tablename__ = "email_queue"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    message_id: Mapped[str] = mapped_column(String(255))
    attachment_id: Mapped[str] = mapped_column(String(500), server_default="legacy")
    attachment_filename: Mapped[str | None] = mapped_column(String(500), nullable=True)
    attachment_content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    email_subject: Mapped[str | None] = mapped_column(String(500), nullable=True)
    sync_log_id: Mapped[int] = mapped_column(Integer, ForeignKey("sync_logs.id", ondelete="CASCADE"))
    raw_content: Mapped[bytes | None] = deferred(mapped_column(LargeBinary, nullable=True))
    # One of EMAIL_QUEUE_STATUSES (app/core/email_queue_enums.py).
    status: Mapped[str] = mapped_column(String(20), default="pending")
    error: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    # Extraction attempts so far, counted when the row is claimed. A retryable
    # failure (Claude busy, timed out, or an unreadable reply) puts the row back
    # to ``fetched`` with ``next_attempt_at`` set, until
    # EMAIL_EXTRACTION_MAX_ATTEMPTS runs out.
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # When a drain took the row for extraction. Its result is written only while
    # the row is still ``extracting`` with this claim time, and a claim older than
    # EXTRACTION_CLAIM_LIFETIME_SECONDS was left by a drain that died.
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("user_id", "message_id", "attachment_id", name="uq_email_queue_user_message_attachment"),
        Index("ix_email_queue_org_status_created", "organization_id", "status", "created_at"),
        Index("ix_email_queue_org_created", "organization_id", "created_at"),
        Index("ix_email_queue_sync_log_status", "sync_log_id", "status"),
        CheckConstraint(f"status IN {EMAIL_QUEUE_STATUSES_SQL}", name="chk_email_queue_status"),
    )

    user = relationship("User", back_populates="email_queue")
