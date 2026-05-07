import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ApplicationEvent(Base):
    __tablename__ = "application_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    application_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("applications.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    event_type: Mapped[str] = mapped_column(String(30), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    email_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    raw_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )

    application: Mapped["Application"] = relationship("Application", back_populates="events")

    __table_args__ = (
        CheckConstraint(
            "event_type IN ('applied','email_received','interview_scheduled','interview_completed','rejected','offer_received','withdrawn','ghosted','note_added','follow_up_sent')",
            name="chk_appevent_event_type",
        ),
        CheckConstraint(
            "source IN ('manual','gmail','calendar','extension','system')",
            name="chk_appevent_source",
        ),
        Index(
            "ix_appevent_app_occurred",
            "application_id",
            "occurred_at",
            postgresql_include=["event_type"],
        ),
        Index("ix_appevent_user_occurred", "user_id", "occurred_at"),
        Index(
            "uq_appevent_user_msgid",
            "user_id",
            "email_message_id",
            unique=True,
            postgresql_where=text("email_message_id IS NOT NULL"),
        ),
    )
