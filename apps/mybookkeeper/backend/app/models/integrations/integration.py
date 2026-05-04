import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, SmallInteger, String, Text, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.db.base import Base
from app.core.security import decrypt_token, encrypt_token


class Integration(Base):
    __tablename__ = "integrations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    provider: Mapped[str] = mapped_column(String(100))
    access_token_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    refresh_token_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    key_version: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1)
    token_expiry: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    # Reauth-state columns — flipped by the Gmail client seam when Google rejects
    # the stored refresh token. Cleared on a successful OAuth re-flow.
    needs_reauth: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    last_reauth_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_reauth_failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (UniqueConstraint("user_id", "provider", name="uq_integration_user_provider"),)

    user = relationship("User", back_populates="integrations")

    @hybrid_property
    def access_token(self) -> str | None:
        if not self.access_token_encrypted:
            return None
        return decrypt_token(self.access_token_encrypted)

    @access_token.setter  # type: ignore[no-redef]
    def access_token(self, value: str | None) -> None:
        self.access_token_encrypted = encrypt_token(value) if value else None

    @hybrid_property
    def refresh_token(self) -> str | None:
        if not self.refresh_token_encrypted:
            return None
        return decrypt_token(self.refresh_token_encrypted)

    @refresh_token.setter  # type: ignore[no-redef]
    def refresh_token(self, value: str | None) -> None:
        self.refresh_token_encrypted = encrypt_token(value) if value else None
