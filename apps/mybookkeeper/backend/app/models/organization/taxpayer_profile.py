import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class TaxpayerProfile(Base):
    __tablename__ = "taxpayer_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False,
    )
    filer_type: Mapped[str] = mapped_column(String(10), nullable=False)

    encrypted_ssn: Mapped[str | None] = mapped_column(String(500), nullable=True)
    encrypted_first_name: Mapped[str | None] = mapped_column(String(500), nullable=True)
    encrypted_last_name: Mapped[str | None] = mapped_column(String(500), nullable=True)
    encrypted_middle_initial: Mapped[str | None] = mapped_column(String(500), nullable=True)
    encrypted_date_of_birth: Mapped[str | None] = mapped_column(String(500), nullable=True)
    encrypted_street_address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    encrypted_apartment_unit: Mapped[str | None] = mapped_column(String(500), nullable=True)
    encrypted_city: Mapped[str | None] = mapped_column(String(500), nullable=True)
    encrypted_state: Mapped[str | None] = mapped_column(String(500), nullable=True)
    encrypted_zip_code: Mapped[str | None] = mapped_column(String(500), nullable=True)
    encrypted_phone: Mapped[str | None] = mapped_column(String(500), nullable=True)
    encrypted_occupation: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Cleartext last four digits for display — never full SSN
    ssn_last_four: Mapped[str | None] = mapped_column(String(4), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "filer_type", name="uq_taxpayer_profile_org_filer"),
        CheckConstraint("filer_type IN ('primary', 'spouse')", name="ck_taxpayer_profile_filer_type"),
    )

    organization = relationship("Organization", back_populates="taxpayer_profiles")
