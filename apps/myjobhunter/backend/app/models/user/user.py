import uuid
from datetime import datetime

from fastapi_users.db import SQLAlchemyBaseUserTableUUID
from sqlalchemy import Boolean, DateTime, Enum as SAEnum, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from platform_shared.core.permissions import Role

from app.core.encrypted_string_type import EncryptedString
from app.db.base import Base

# Re-export for downstream callers that prefer ``from app.models.user.user
# import Role`` over reaching into platform_shared directly. Mirrors MBK.
__all__ = ["User", "Role"]


class User(SQLAlchemyBaseUserTableUUID, Base):
    # Intentional divergence from MBK (which uses singular ``user``): MJH was
    # scaffolded with the plural form before the parity audit and migrating
    # the table now would require a multi-step rename across every FK,
    # index, RLS policy, and downstream system. The cost outweighs the
    # benefit. Documented in apps/myjobhunter/CLAUDE.md "Parity rule" →
    # divergences. New tables in MJH should follow the singular convention
    # to minimise further drift.
    __tablename__ = "users"

    display_name: Mapped[str] = mapped_column(String(100), default="")

    # Platform-level role (ADMIN | USER). Gates platform-wide admin
    # routes via ``platform_shared.core.permissions.require_role``. Per-
    # organization roles (when MJH ports the orgs/members system) layer
    # on top of this — they don't replace it.
    role: Mapped[Role] = mapped_column(
        SAEnum(Role, name="user_role", values_callable=lambda enum_cls: [e.value for e in enum_cls]),
        default=Role.USER,
        server_default=Role.USER.value,
        nullable=False,
    )

    # TOTP secret + recovery codes are stored encrypted at rest via the
    # ``EncryptedString`` TypeDecorator (Fernet, MJH PII key family). The
    # plaintext secret is what generates valid 6-digit codes — must never be
    # readable from a leaked database dump. Recovery codes are stored as a
    # comma-joined string and consumed one-at-a-time by the login flow.
    totp_secret: Mapped[str | None] = mapped_column(EncryptedString(255), nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    totp_recovery_codes: Mapped[str | None] = mapped_column(EncryptedString(1000), nullable=True)
    # HMAC digest algorithm used at enrollment. Grandfathered users keep 'sha1';
    # all new enrollments write 'sha256'. The verifier reads this column to
    # pick the matching pyotp digest. See migration totp260503.
    totp_algorithm: Mapped[str] = mapped_column(
        String(10), nullable=False, default="sha1", server_default="sha1"
    )

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
