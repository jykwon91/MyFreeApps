import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.spending_category_enums import TRANSACTION_SCOPES_SQL
from app.db.base import Base


class ClassificationRule(Base):
    __tablename__ = "classification_rules"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"),
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
    )

    # Match criteria
    match_type: Mapped[str] = mapped_column(String(20), nullable=False)
    match_pattern: Mapped[str] = mapped_column(String(500), nullable=False)
    match_context: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Action
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    sub_category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    property_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("properties.id", ondelete="SET NULL"), nullable=True,
    )
    activity_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("activities.id", ondelete="SET NULL"), nullable=True,
    )
    # Rental, business or personal; NULL leaves a matching row's scope as it is.
    transaction_scope: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # Metadata
    source: Mapped[str] = mapped_column(String(20), default="user_correction")
    priority: Mapped[int] = mapped_column(SmallInteger, default=0)
    times_applied: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        CheckConstraint(
            f"transaction_scope IS NULL OR transaction_scope IN {TRANSACTION_SCOPES_SQL}",
            name="chk_rule_transaction_scope",
        ),
        UniqueConstraint(
            "organization_id", "match_type", "match_pattern", "match_context",
            name="uq_rule_org_type_pattern_context",
        ),
        Index(
            "ix_rule_lookup",
            "organization_id", "match_type", "match_pattern",
            postgresql_where=(is_active == True),  # noqa: E712
        ),
    )

    organization = relationship("Organization")
    linked_property = relationship("Property")
    linked_activity = relationship("Activity")
    creator = relationship("User")
    # Split each matching payment evenly across these, in this order.
    split_properties = relationship(
        "ClassificationRuleSplitProperty",
        back_populates="rule",
        lazy="selectin",
        cascade="all, delete-orphan",
        order_by="ClassificationRuleSplitProperty.position",
    )

    @property
    def split_property_ids(self) -> list[uuid.UUID]:
        return [share.property_id for share in self.split_properties]
