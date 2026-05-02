"""ListingBlackoutAttachment — files attached by the host to a blackout row.

Host operators can annotate any blackout (iCal-imported or manual) with
screenshots, confirmations, or documents from the channel. These rows are
completely independent of the iCal poller — the poller only updates
``listing_blackouts``, never this table.

Storage: objects live in MinIO under the ``blackout-attachments/<blackout_id>/``
key prefix. The ``storage_key`` column is the full MinIO object key.

Cascade: when a blackout is deleted (by the iCal poller's cancellation sweep
or by the operator) the attachments and their MinIO objects must be cleaned up.
The FK ``ON DELETE CASCADE`` handles the DB side; the storage side is handled
best-effort by the service layer on explicit deletes. For poller-triggered
deletes, orphaned objects are accepted and swept in a future maintenance job —
this matches the existing listing-photo pattern.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ListingBlackoutAttachment(Base):
    __tablename__ = "listing_blackout_attachments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    listing_blackout_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("listing_blackouts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    storage_key: Mapped[str] = mapped_column(Text, nullable=False)
    filename: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str] = mapped_column(Text, nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    uploaded_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )

    __table_args__ = (
        Index(
            "ix_listing_blackout_attachments_blackout_id",
            "listing_blackout_id",
        ),
    )
