import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WelcomeManual(Base):
    """A guest welcome manual — a host-authored guide (Wi-Fi, trash, laundry,
    parking, check-out) that gets emailed to guests as a PDF.

    Standalone + org-scoped. ``property_id`` is an OPTIONAL tag linking the
    manual to a physical property; it is ``SET NULL`` on property delete so
    the manual's content outlives any single property row.
    """

    __tablename__ = "welcome_manuals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    property_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("properties.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    # Greeting shown at the top of the emailed PDF / email body. Optional.
    intro_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
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
        # List view — active manuals for an org, newest first.
        Index(
            "ix_welcome_manuals_org_active",
            "organization_id",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        # "Manuals tagged to this property" lookup.
        Index(
            "ix_welcome_manuals_org_property",
            "organization_id", "property_id",
        ),
    )
