import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, SmallInteger, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WelcomeManualSection(Base):
    """One ordered section of a welcome manual (e.g. "Wi-Fi", "Laundry").

    Cascade-deleted with its parent manual. Section images attach to this row
    (added in PR 2). ``body`` is nullable so a freshly-seeded stub section can
    carry a title with no content until the host fills it in.

    ``room_id`` scopes the section to one room of the property. ``NULL`` — the
    default, and the only value a manual with no rooms ever has — means the
    section is shared and appears in every room's copy of the guide.
    """

    __tablename__ = "welcome_manual_sections"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    manual_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("welcome_manuals.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    room_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("welcome_manual_rooms.id", ondelete="CASCADE"),
        index=True,
        nullable=True,
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    display_order: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0, server_default="0")

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
        Index("ix_welcome_manual_sections_manual_order", "manual_id", "display_order"),
        # "Sections visible to this room" — the shared-or-mine filter every
        # guest render and every editor tab runs.
        Index(
            "ix_welcome_manual_sections_manual_room",
            "manual_id", "room_id", "display_order",
        ),
    )
