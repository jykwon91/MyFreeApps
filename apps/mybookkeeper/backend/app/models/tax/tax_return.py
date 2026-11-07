import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, ForeignKey, SmallInteger, String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.core.tax_return_enums import (
    FILING_STATUSES_SQL, JURISDICTION_MAX_LENGTH, MAX_TAX_RETURN_YEAR, MIN_TAX_RETURN_YEAR,
)
from app.db.base import Base


class TaxReturn(Base):
    __tablename__ = "tax_returns"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"))
    tax_year: Mapped[int] = mapped_column(SmallInteger)
    filing_status: Mapped[str] = mapped_column(String(30), default="single")
    jurisdiction: Mapped[str] = mapped_column(String(JURISDICTION_MAX_LENGTH), default="federal")
    status: Mapped[str] = mapped_column(String(20), default="draft")
    needs_recompute: Mapped[bool] = mapped_column(Boolean, default=True)
    filed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("organization_id", "tax_year", "jurisdiction", name="uq_return_org_year_jur"),
        CheckConstraint(
            f"tax_year >= {MIN_TAX_RETURN_YEAR} AND tax_year <= {MAX_TAX_RETURN_YEAR}",
            name="chk_return_year",
        ),
        CheckConstraint(
            "status IN ('draft', 'ready', 'filed')",
            name="chk_return_status",
        ),
        CheckConstraint(
            f"filing_status IN {FILING_STATUSES_SQL}",
            name="chk_return_filing",
        ),
    )

    organization = relationship("Organization")
    form_instances = relationship("TaxFormInstance", back_populates="tax_return", cascade="all, delete-orphan")
    advisor_generations = relationship("TaxAdvisorGeneration", back_populates="tax_return", cascade="all, delete-orphan")
