import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, SmallInteger, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WelcomeManualSectionImage(Base):
    """An image attached to a welcome-manual section (e.g. a photo of the
    trash bins or the washing machine dial). Cascade-deleted with its section;
    the MinIO object is cleaned up best-effort by the service on delete.
    """

    __tablename__ = "welcome_manual_section_images"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    section_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("welcome_manual_sections.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    storage_key: Mapped[str] = mapped_column(String(255), nullable=False)
    caption: Mapped[str | None] = mapped_column(String(500), nullable=True)
    display_order: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0, server_default="0")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )

    __table_args__ = (
        Index("ix_welcome_manual_section_images_section_order", "section_id", "display_order"),
    )
