import uuid
from datetime import datetime

from fastapi_users.db import SQLAlchemyBaseUserTableUUID
from sqlalchemy import Boolean, DateTime, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.encrypted_string_type import EncryptedString
from app.db.base import Base


class User(SQLAlchemyBaseUserTableUUID, Base):
    __tablename__ = "users"

    display_name: Mapped[str] = mapped_column(String(100), default="")

    # TOTP secret + recovery codes are stored encrypted at rest via the
    # ``EncryptedString`` TypeDecorator (Fernet, MJH PII key family). The
    # plaintext secret is what generates valid 6-digit codes — must never be
    # readable from a leaked database dump. Recovery codes are stored as a
    # comma-joined string and consumed one-at-a-time by the login flow.
    totp_secret: Mapped[str | None] = mapped_column(EncryptedString(255), nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    totp_recovery_codes: Mapped[str | None] = mapped_column(EncryptedString(1000), nullable=True)

    # Account-level login lockout state (PR C3 — managed by
    # platform_shared.services.account_lockout). See
    # alembic/versions/a1b2c3d4e5f6_add_account_lockout_and_auth_events.py.
    failed_login_count: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=0, server_default="0",
    )
    locked_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    last_failed_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
