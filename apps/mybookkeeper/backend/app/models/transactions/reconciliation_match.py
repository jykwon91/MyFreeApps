import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint, DateTime, ForeignKey, Index, Numeric, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base


class ReconciliationMatch(Base):
    __tablename__ = "reconciliation_matches"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reconciliation_source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("reconciliation_sources.id", ondelete="CASCADE"))
    reservation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("reservations.id", ondelete="CASCADE"))
    matched_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("reconciliation_source_id", "reservation_id", name="uq_recon_match"),
        CheckConstraint("matched_amount > 0", name="chk_match_amount"),
        Index("ix_recon_match_reservation", "reservation_id"),
    )

    reconciliation_source = relationship("ReconciliationSource")
    reservation = relationship("Reservation")
