import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base


class PlaidAccount(Base):
    __tablename__ = "plaid_accounts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plaid_item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("plaid_items.id", ondelete="CASCADE"))
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"))
    plaid_account_id: Mapped[str] = mapped_column(String(255), nullable=False)
    property_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("properties.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(255))
    official_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    account_type: Mapped[str] = mapped_column(String(50))
    account_subtype: Mapped[str | None] = mapped_column(String(50), nullable=True)
    mask: Mapped[str | None] = mapped_column(String(10), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("plaid_item_id", "plaid_account_id", name="uq_plaid_account_item"),
    )

    plaid_item = relationship("PlaidItem", back_populates="accounts")
    organization = relationship("Organization")
    linked_property = relationship("Property")
