"""Shared AuthEvent model.

Audit row for security-relevant authentication events (login, register,
password reset, TOTP, OAuth connect/disconnect, account deletion, data export).
Schema is consumed by every app that imports this model into its
``app.models`` package — the table is provisioned by each app's own Alembic
migrations.

Notes
-----
- ``user_id`` deliberately has NO foreign key to ``users.id`` so event rows
  survive account deletion. The ``ACCOUNT_DELETED`` event is written BEFORE
  the cascade delete runs.
- ``event_metadata`` is mapped to the SQL column ``metadata`` (renamed to
  avoid collision with SQLAlchemy's ``DeclarativeBase.metadata`` attribute).
- Anonymous failed-login rows are written with ``user_id=NULL`` and only
  ``metadata.email_domain`` — never the full email. The scrubbing happens
  at the service layer (see ``platform_shared.services.auth_event_service``).
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from platform_shared.db.base import Base


class AuthEvent(Base):
    __tablename__ = "auth_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    # Nullable — some events (failed login for unknown email) don't tie to a user
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True,
    )
    event_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)  # IPv6 max
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    event_metadata: Mapped[dict] = mapped_column(
        "metadata", JSONB, nullable=False, default=dict, server_default="{}",
    )
    succeeded: Mapped[bool] = mapped_column(Boolean, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    __table_args__ = (
        Index("ix_auth_events_user_event_time", "user_id", "event_type", "created_at"),
        Index("ix_auth_events_ip_time", "ip_address", "created_at"),
    )
