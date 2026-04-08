import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class TaxAdvisorSuggestion(Base):
    __tablename__ = "tax_advisor_suggestions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tax_return_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tax_returns.id", ondelete="CASCADE"), nullable=False)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    generation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tax_advisor_generations.id", ondelete="CASCADE"), nullable=False)
    suggestion_key: Mapped[str] = mapped_column(String(100), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    severity: Mapped[str] = mapped_column(String(10), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    estimated_savings: Mapped[int | None] = mapped_column(Integer, nullable=True)
    action: Mapped[str] = mapped_column(Text, nullable=False)
    irs_reference: Mapped[str | None] = mapped_column(String(200), nullable=True)
    confidence: Mapped[str] = mapped_column(String(10), nullable=False)
    affected_properties: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    affected_form: Mapped[str | None] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    status_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status_changed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint(
            "severity IN ('high', 'medium', 'low')",
            name="chk_tas_severity",
        ),
        CheckConstraint(
            "confidence IN ('high', 'medium', 'low')",
            name="chk_tas_confidence",
        ),
        CheckConstraint(
            "status IN ('active', 'dismissed', 'resolved')",
            name="chk_tas_status",
        ),
        Index("ix_tas_return_status", "tax_return_id", "status"),
        Index("ix_tas_org_id", "organization_id"),
        Index("ix_tas_generation", "generation_id"),
    )

    generation = relationship("TaxAdvisorGeneration", back_populates="suggestions")
    tax_return = relationship("TaxReturn")
