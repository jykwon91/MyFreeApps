import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, SmallInteger, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.welcome_manual_constants import WELCOME_MANUAL_ROOM_NAME_MAX_LEN
from app.db.base import Base


class WelcomeManualRoom(Base):
    """One lettable room within a welcome manual's property.

    A host renting three rooms of one house writes ONE manual: the Wi-Fi,
    parking and trash sections are shared, and each room adds the handful of
    sections that differ (which door is yours, which parking space). Sections
    with ``room_id IS NULL`` belong to every room; a section with ``room_id``
    set appears only in that room's copy of the guide.

    Cascade-deleted with the parent manual.
    """

    __tablename__ = "welcome_manual_rooms"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    manual_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("welcome_manuals.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    name: Mapped[str] = mapped_column(
        String(WELCOME_MANUAL_ROOM_NAME_MAX_LEN), nullable=False,
    )
    display_order: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=0, server_default="0",
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
        onupdate=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )

    __table_args__ = (
        Index("ix_welcome_manual_rooms_manual_order", "manual_id", "display_order"),
    )
