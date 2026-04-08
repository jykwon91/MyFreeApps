import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, Index, Numeric, String, Text,
    UniqueConstraint, ForeignKey,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base


class TaxFormField(Base):
    __tablename__ = "tax_form_fields"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    form_instance_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tax_form_instances.id", ondelete="CASCADE"))

    field_id: Mapped[str] = mapped_column(String(100))
    field_label: Mapped[str] = mapped_column(String(255))

    value_numeric: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    value_text: Mapped[str | None] = mapped_column(String(500), nullable=True)
    value_boolean: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    is_calculated: Mapped[bool] = mapped_column(Boolean, default=False)
    is_overridden: Mapped[bool] = mapped_column(Boolean, default=False)
    overridden_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    overridden_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    override_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    validation_status: Mapped[str] = mapped_column(String(20), default="unvalidated")
    validation_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[str | None] = mapped_column(String(20), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("form_instance_id", "field_id", name="uq_field_per_instance"),
        CheckConstraint(
            "validation_status IN ('unvalidated', 'valid', 'warning', 'error')",
            name="chk_tff_validation",
        ),
        CheckConstraint(
            "confidence IS NULL OR confidence IN ('high', 'medium', 'low')",
            name="chk_tff_confidence",
        ),
        CheckConstraint(
            "value_numeric IS NOT NULL OR value_text IS NOT NULL OR value_boolean IS NOT NULL",
            name="chk_tff_has_value",
        ),
    )

    form_instance = relationship("TaxFormInstance", back_populates="fields")
    sources = relationship("TaxFormFieldSource", back_populates="field", cascade="all, delete-orphan")
