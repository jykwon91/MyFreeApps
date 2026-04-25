import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint, Computed, Date, DateTime, ForeignKey, Index,
    Integer, Numeric, String, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base


class Reservation(Base):
    __tablename__ = "reservations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"))
    property_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("properties.id", ondelete="SET NULL"), nullable=True)
    transaction_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True)

    res_code: Mapped[str] = mapped_column(String(100))
    platform: Mapped[str | None] = mapped_column(String(100), nullable=True)

    check_in: Mapped[date] = mapped_column(Date)
    check_out: Mapped[date] = mapped_column(Date)
    nights: Mapped[int] = mapped_column(Integer, Computed("check_out - check_in"))

    gross_booking: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    net_booking_revenue: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    commission: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    cleaning_fee: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    insurance_fee: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    net_client_earnings: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    funds_due_to_client: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)

    guest_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    statement_period_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    statement_period_end: Mapped[date | None] = mapped_column(Date, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint("check_out > check_in", name="chk_res_dates"),
        CheckConstraint(
            "platform IS NULL OR platform IN ('airbnb', 'vrbo', 'booking.com', 'direct')",
            name="chk_res_platform",
        ),
        CheckConstraint(
            "platform IS NULL OR gross_booking IS NOT NULL",
            name="chk_res_gross_when_platform",
        ),
        UniqueConstraint("organization_id", "res_code", name="uq_res_org_code"),
        Index("ix_res_property_dates", "organization_id", "property_id", "check_in"),
        Index("ix_res_org_checkin", "organization_id", "check_in"),
        Index("ix_res_platform", "organization_id", "platform"),
        Index("ix_res_transaction", "transaction_id"),
    )

    organization = relationship("Organization")
    property = relationship("Property")
    transaction = relationship("Transaction")
