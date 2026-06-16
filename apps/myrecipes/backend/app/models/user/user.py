import uuid
from datetime import datetime

from fastapi_users.db import SQLAlchemyBaseUserTableUUID
from sqlalchemy import Boolean, DateTime, Enum as SAEnum, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from platform_shared.core.permissions import Role

from app.core.encrypted_string_type import EncryptedString
from app.db.base import Base

__all__ = ["User", "Role"]


class User(SQLAlchemyBaseUserTableUUID, Base):
    # Plural table name — multi-user convention. The canonical app
    # (MyBookkeeper) and the other multi-user app (MyJobHunter) both use
    # "users", and the shared register test factory
    # (platform_shared.testing.factories.make_api_user_factory) issues raw SQL
    # against "users". Single-user scaffolded apps use the singular "user";
    # myrecipes was converted to multi-user and must match the plural form.
    __tablename__ = "users"

    display_name: Mapped[str] = mapped_column(String(100), default="")

    role: Mapped[Role] = mapped_column(
        SAEnum(Role, name="user_role", values_callable=lambda enum_cls: [e.value for e in enum_cls]),
        default=Role.USER,
        server_default=Role.USER.value,
        nullable=False,
    )

    totp_secret: Mapped[str | None] = mapped_column(EncryptedString(255), nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    totp_recovery_codes: Mapped[str | None] = mapped_column(EncryptedString(1000), nullable=True)
    totp_algorithm: Mapped[str] = mapped_column(
        String(10), nullable=False, default="sha1", server_default="sha1"
    )

    failed_login_count: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=0, server_default="0",
    )
    locked_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    last_failed_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    @property
    def name(self) -> str | None:
        """Compatibility shim for shared admin schemas."""
        value = self.display_name or ""
        return value or None
