import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, ForeignKey, Index,
    Numeric, SmallInteger, String, Text, func, text,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.core.listing_enums import (
    LISTING_ROOM_TYPES_SQL,
    LISTING_STATUSES_SQL,
)
from app.db.base import Base


class Listing(Base):
    __tablename__ = "listings"

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
    property_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("properties.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    monthly_rate: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    weekly_rate: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    nightly_rate: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)

    min_stay_days: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    max_stay_days: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)

    room_type: Mapped[str] = mapped_column(String(20), nullable=False)
    private_bath: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    parking_assigned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    furnished: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft", server_default="draft")

    # JSONB array of amenity strings. The "is array" CheckConstraint lives in the
    # Alembic migration only because `jsonb_typeof()` is PostgreSQL-specific and
    # would break SQLite-backed unit tests. Production DDL is the source of truth.
    amenities: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")

    pets_on_premises: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    large_dog_disclosure: Mapped[str | None] = mapped_column(Text, nullable=True)

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
        CheckConstraint(
            f"room_type IN {LISTING_ROOM_TYPES_SQL}",
            name="chk_listing_room_type",
        ),
        CheckConstraint(
            f"status IN {LISTING_STATUSES_SQL}",
            name="chk_listing_status",
        ),
        Index(
            "ix_listings_org_status_active",
            "organization_id", "status",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index(
            "ix_listings_org_property",
            "organization_id", "property_id",
        ),
    )
