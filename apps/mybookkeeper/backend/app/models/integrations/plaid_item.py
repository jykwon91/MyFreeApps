import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base


class PlaidItem(Base):
    __tablename__ = "plaid_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    plaid_item_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    access_token: Mapped[str] = mapped_column(String(2000), nullable=False)
    institution_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    institution_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cursor: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active")
    error_code: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    organization = relationship("Organization")
    user = relationship("User")
    accounts = relationship("PlaidAccount", back_populates="plaid_item", cascade="all, delete-orphan")
