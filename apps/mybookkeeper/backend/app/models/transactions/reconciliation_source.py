import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint, Computed, DateTime, ForeignKey, Index,
    Numeric, SmallInteger, String,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base


class ReconciliationSource(Base):
    __tablename__ = "reconciliation_sources"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    document_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)

    source_type: Mapped[str] = mapped_column(String(50))
    tax_year: Mapped[int] = mapped_column(SmallInteger)
    issuer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reported_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))

    matched_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, server_default="0")
    discrepancy: Mapped[Decimal] = mapped_column(Numeric(12, 2), Computed("reported_amount - matched_amount"))
    status: Mapped[str] = mapped_column(String(20), default="unmatched")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint(
            "source_type IN ('1099_misc', '1099_nec', '1099_k', 'year_end_statement')",
            name="chk_recon_type",
        ),
        CheckConstraint(
            "tax_year >= 2020 AND tax_year <= 2099",
            name="chk_recon_year",
        ),
        CheckConstraint(
            "status IN ('unmatched', 'partial', 'matched', 'confirmed')",
            name="chk_recon_status",
        ),
        Index("ix_recon_org_year", "organization_id", "tax_year"),
    )

    organization = relationship("Organization")
    user = relationship("User")
    document = relationship("Document")

    @property
    def document_file_name(self) -> str | None:
        return self.document.file_name if self.document else None

    @property
    def property_name(self) -> str | None:
        if self.document and self.document.property:
            return self.document.property.name
        return None
