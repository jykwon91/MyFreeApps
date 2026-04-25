import enum
import uuid

from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, Enum as SAEnum, ForeignKey,
    Integer, Numeric, String, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base
from app.models.properties.property_classification import PropertyClassification


class PropertyType(str, enum.Enum):
    SHORT_TERM = "short_term"
    LONG_TERM = "long_term"


class Property(Base):
    __tablename__ = "properties"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255))
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    classification: Mapped[PropertyClassification] = mapped_column(
        SAEnum(PropertyClassification), default=PropertyClassification.UNCLASSIFIED, server_default="UNCLASSIFIED",
    )
    type: Mapped[PropertyType | None] = mapped_column(SAEnum(PropertyType), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    external_id: Mapped[str | None] = mapped_column(String(255))
    external_source: Mapped[str | None] = mapped_column(String(100))
    purchase_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    land_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    date_placed_in_service: Mapped[date | None] = mapped_column(Date, nullable=True)
    property_class: Mapped[str | None] = mapped_column(String(20), nullable=True)
    personal_use_days: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("external_id", "external_source", name="uq_property_external"),
        CheckConstraint(
            "property_class IS NULL OR property_class IN ('residential_27_5', 'commercial_39')",
            name="chk_prop_class",
        ),
        CheckConstraint(
            "land_value IS NULL OR (purchase_price IS NOT NULL AND land_value <= purchase_price)",
            name="chk_prop_land",
        ),
        CheckConstraint(
            "(classification = 'INVESTMENT' AND type IS NOT NULL) OR "
            "(classification IN ('PRIMARY_RESIDENCE', 'SECOND_HOME') AND type IS NULL) OR "
            "(classification = 'UNCLASSIFIED')",
            name="chk_prop_classification_type",
        ),
    )

    user = relationship("User", back_populates="properties")
    documents = relationship("Document", back_populates="property")
    tenants = relationship("Tenant", back_populates="property", cascade="all, delete-orphan")
    leases = relationship("Lease", back_populates="property", cascade="all, delete-orphan")
    activity_periods = relationship("ActivityPeriod", back_populates="property", cascade="all, delete-orphan", order_by="ActivityPeriod.active_from")
    activity = relationship("Activity", back_populates="linked_property", uselist=False)
