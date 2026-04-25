import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint, Date, DateTime, ForeignKey, Index,
    Numeric, SmallInteger, String, text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class CostBasisLot(Base):
    __tablename__ = "cost_basis_lots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    extraction_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("extractions.id", ondelete="SET NULL"), nullable=True)

    asset_name: Mapped[str] = mapped_column(String(255))
    asset_type: Mapped[str] = mapped_column(String(50))
    ticker: Mapped[str | None] = mapped_column(String(20), nullable=True)

    shares: Mapped[Decimal] = mapped_column(Numeric(18, 8))
    cost_basis: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    acquisition_date: Mapped[date] = mapped_column(Date)

    sale_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    proceeds: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    gain_loss: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)

    tax_year: Mapped[int] = mapped_column(SmallInteger)
    holding_period: Mapped[str | None] = mapped_column(String(20), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint("cost_basis >= 0", name="chk_lot_cost_basis"),
        CheckConstraint("shares > 0", name="chk_lot_shares_positive"),
        CheckConstraint(
            "asset_type IN ('stock', 'etf', 'mutual_fund', 'crypto', 'bond', 'option', 'other')",
            name="chk_lot_asset_type",
        ),
        CheckConstraint(
            "holding_period IS NULL OR holding_period IN ('short_term', 'long_term')",
            name="chk_lot_holding_period",
        ),
        CheckConstraint(
            "tax_year >= 2020 AND tax_year <= 2099",
            name="chk_lot_tax_year",
        ),
        Index(
            "ix_lot_org_year", "organization_id", "tax_year",
            postgresql_where=text("sale_date IS NOT NULL"),
        ),
        Index("ix_lot_org_asset", "organization_id", "asset_name"),
    )

    organization = relationship("Organization")
    user = relationship("User")
    extraction = relationship("Extraction")
