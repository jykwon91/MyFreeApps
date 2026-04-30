import uuid
from datetime import datetime

from fastapi_users.db import SQLAlchemyBaseUserTableUUID
from sqlalchemy import Boolean, DateTime, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(SQLAlchemyBaseUserTableUUID, Base):
    __tablename__ = "users"

    display_name: Mapped[str] = mapped_column(String(100), default="")
    totp_secret_encrypted: Mapped[str | None] = mapped_column(String(500), nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    totp_recovery_codes: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    # Account-level login lockout state (managed by
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
