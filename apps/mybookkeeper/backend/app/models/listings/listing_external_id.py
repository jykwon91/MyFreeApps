import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint, DateTime, ForeignKey, Index, String, UniqueConstraint, func, text,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID

from app.core.listing_enums import LISTING_EXTERNAL_SOURCES_SQL
from app.db.base import Base


class ListingExternalId(Base):
    __tablename__ = "listing_external_ids"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("listings.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    source: Mapped[str] = mapped_column(String(20), nullable=False)
    external_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    external_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )

    __table_args__ = (
        CheckConstraint(
            f"source IN {LISTING_EXTERNAL_SOURCES_SQL}",
            name="chk_listing_external_id_source",
        ),
        UniqueConstraint("listing_id", "source", name="uq_listing_external_id_listing_source"),
        Index(
            "uq_listing_external_id_source_external",
            "source", "external_id",
            unique=True,
            postgresql_where=text("external_id IS NOT NULL"),
        ),
    )
