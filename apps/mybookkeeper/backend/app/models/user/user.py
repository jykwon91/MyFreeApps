import enum
from datetime import datetime

from fastapi_users.db import SQLAlchemyBaseUserTableUUID
from sqlalchemy import Boolean, DateTime, SmallInteger, String, Text, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Role(str, enum.Enum):
    ADMIN = "admin"
    USER = "user"


class User(SQLAlchemyBaseUserTableUUID, Base):
    __tablename__ = "users"

    name: Mapped[str | None] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(SAEnum(Role), default=Role.USER)

    totp_secret: Mapped[str | None] = mapped_column(String(255), nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    totp_recovery_codes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # HMAC digest algorithm used at enrollment. Grandfathered users keep 'sha1';
    # all new enrollments write 'sha256'. The verifier reads this column to
    # pick the matching pyotp digest. See migration totp260503.
    totp_algorithm: Mapped[str] = mapped_column(
        String(10), nullable=False, default="sha1", server_default="sha1"
    )

    failed_login_count: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0, server_default="0")
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_failed_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    properties = relationship("Property", back_populates="user", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="user", cascade="all, delete-orphan")
    integrations = relationship("Integration", back_populates="user", cascade="all, delete-orphan")
    processed_emails = relationship("ProcessedEmail", back_populates="user", cascade="all, delete-orphan")
    usage_logs = relationship("UsageLog", back_populates="user", cascade="all, delete-orphan")
    sync_logs = relationship("SyncLog", back_populates="user", cascade="all, delete-orphan")
    email_queue = relationship("EmailQueue", back_populates="user", cascade="all, delete-orphan")
    tenants = relationship("Tenant", back_populates="user", cascade="all, delete-orphan")
