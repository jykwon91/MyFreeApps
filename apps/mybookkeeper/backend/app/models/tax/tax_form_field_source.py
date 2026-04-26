import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint, DateTime, ForeignKey, Index, Numeric, String,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base


class TaxFormFieldSource(Base):
    __tablename__ = "tax_form_field_sources"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    field_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tax_form_fields.id", ondelete="CASCADE"))
    source_type: Mapped[str] = mapped_column(String(50))
    source_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint(
            "source_type IN ("
            "'transaction', 'reservation', 'reconciliation_source', "
            "'tax_form_instance', 'manual'"
            ")",
            name="chk_tffs_source",
        ),
        Index("ix_tffs_field", "field_id"),
        Index("ix_tffs_source", "source_type", "source_id"),
    )

    field = relationship("TaxFormField", back_populates="sources")
