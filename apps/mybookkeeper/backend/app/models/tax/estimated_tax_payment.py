import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint, Date, DateTime, ForeignKey, Index,
    Numeric, SmallInteger, String, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class EstimatedTaxPayment(Base):
    __tablename__ = "estimated_tax_payments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    transaction_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True)

    tax_year: Mapped[int] = mapped_column(SmallInteger)
    quarter: Mapped[int] = mapped_column(SmallInteger)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    payment_date: Mapped[date] = mapped_column(Date)
    jurisdiction: Mapped[str] = mapped_column(String(50), default="federal")
    payment_method: Mapped[str | None] = mapped_column(String(50), nullable=True)
    confirmation_number: Mapped[str | None] = mapped_column(String(100), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint("amount > 0", name="chk_est_payment_amount"),
        CheckConstraint("quarter >= 1 AND quarter <= 4", name="chk_est_payment_quarter"),
        CheckConstraint(
            "tax_year >= 2020 AND tax_year <= 2099",
            name="chk_est_payment_year",
        ),
        UniqueConstraint(
            "organization_id", "tax_year", "quarter", "jurisdiction",
            name="uq_est_payment_org_year_qtr_jur",
        ),
        Index("ix_est_payment_org_year", "organization_id", "tax_year"),
    )

    organization = relationship("Organization")
    user = relationship("User")
    transaction = relationship("Transaction")
