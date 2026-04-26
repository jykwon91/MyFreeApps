import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, ForeignKey, SmallInteger, String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base


class TaxReturn(Base):
    __tablename__ = "tax_returns"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"))
    tax_year: Mapped[int] = mapped_column(SmallInteger)
    filing_status: Mapped[str] = mapped_column(String(30), default="single")
    jurisdiction: Mapped[str] = mapped_column(String(50), default="federal")
    status: Mapped[str] = mapped_column(String(20), default="draft")
    needs_recompute: Mapped[bool] = mapped_column(Boolean, default=True)
    filed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("organization_id", "tax_year", "jurisdiction", name="uq_return_org_year_jur"),
        CheckConstraint(
            "tax_year >= 2020 AND tax_year <= 2099",
            name="chk_return_year",
        ),
        CheckConstraint(
            "status IN ('draft', 'ready', 'filed')",
            name="chk_return_status",
        ),
        CheckConstraint(
            "filing_status IN ("
            "'single', 'married_filing_jointly', 'married_filing_separately', "
            "'head_of_household', 'qualifying_surviving_spouse'"
            ")",
            name="chk_return_filing",
        ),
    )

    organization = relationship("Organization")
    form_instances = relationship("TaxFormInstance", back_populates="tax_return", cascade="all, delete-orphan")
    advisor_generations = relationship("TaxAdvisorGeneration", back_populates="tax_return", cascade="all, delete-orphan")
