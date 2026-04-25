import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, SmallInteger, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TaxYearProfile(Base):
    __tablename__ = "tax_year_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    tax_year: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    filing_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    dependents_count: Mapped[int] = mapped_column(Integer, default=0)
    property_use_days: Mapped[dict[str, int]] = mapped_column(JSONB, default=dict)
    home_office_sqft: Mapped[int | None] = mapped_column(Integer, nullable=True)
    home_total_sqft: Mapped[int | None] = mapped_column(Integer, nullable=True)
    business_mileage: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("organization_id", "tax_year", name="uq_tax_year_profile_org_year"),
    )
