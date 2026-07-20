import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, SmallInteger, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.welcome_manual_constants import (
    WELCOME_MANUAL_FIELD_LABEL_MAX_LEN,
    WELCOME_MANUAL_FIELD_VALUE_MAX_LEN,
)
from app.db.base import Base


class WelcomeManualSectionField(Base):
    """A label + value pair attached to a welcome-manual section (e.g. the
    Wi-Fi network name and its password). Cascade-deleted with its section.
    Ordered within the section by ``display_order``.
    """

    __tablename__ = "welcome_manual_section_fields"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    section_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("welcome_manual_sections.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    label: Mapped[str] = mapped_column(String(WELCOME_MANUAL_FIELD_LABEL_MAX_LEN), nullable=False)
    value: Mapped[str | None] = mapped_column(String(WELCOME_MANUAL_FIELD_VALUE_MAX_LEN), nullable=True)
    display_order: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0, server_default="0")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )

    __table_args__ = (
        Index("ix_welcome_manual_section_fields_section_order", "section_id", "display_order"),
    )
