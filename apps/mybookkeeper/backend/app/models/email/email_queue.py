import uuid
from datetime import datetime, timezone

from sqlalchemy import String, ForeignKey, DateTime, UniqueConstraint, Integer, LargeBinary
from sqlalchemy.orm import Mapped, mapped_column, relationship, deferred
from sqlalchemy.dialects.postgresql import UUID

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
    status: Mapped[str] = mapped_column(String(20), default="pending")
    error: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (UniqueConstraint("user_id", "message_id", "attachment_id", name="uq_email_queue_user_message_attachment"),)

    user = relationship("User", back_populates="email_queue")
