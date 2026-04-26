import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint, DateTime, ForeignKey, Index,
    Numeric, SmallInteger, String, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class TaxCarryforward(Base):
    __tablename__ = "tax_carryforwards"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"))
    tax_return_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tax_returns.id", ondelete="SET NULL"), nullable=True)

    carryforward_type: Mapped[str] = mapped_column(String(50))
    from_year: Mapped[int] = mapped_column(SmallInteger)
    to_year: Mapped[int] = mapped_column(SmallInteger)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    amount_used: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    remaining: Mapped[Decimal] = mapped_column(Numeric(12, 2))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint("amount >= 0", name="chk_carry_amount"),
        CheckConstraint("amount_used >= 0", name="chk_carry_used"),
        CheckConstraint("remaining >= 0", name="chk_carry_remaining"),
        CheckConstraint(
            "carryforward_type IN ('capital_loss', 'passive_activity_loss', 'net_operating_loss', 'charitable_contribution')",
            name="chk_carry_type",
        ),
        CheckConstraint(
            "from_year >= 2020 AND from_year <= 2099",
            name="chk_carry_from_year",
        ),
        CheckConstraint(
            "to_year >= 2020 AND to_year <= 2099 AND to_year > from_year",
            name="chk_carry_to_year",
        ),
        UniqueConstraint(
            "organization_id", "carryforward_type", "from_year", "to_year",
            name="uq_carry_org_type_years",
        ),
        Index("ix_carry_org_to_year", "organization_id", "to_year"),
    )

    organization = relationship("Organization")
    tax_return = relationship("TaxReturn")
