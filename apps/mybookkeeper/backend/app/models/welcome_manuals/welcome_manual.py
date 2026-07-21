import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.encrypted_string_type import EncryptedString
from app.db.base import Base


class WelcomeManual(Base):
    """A guest welcome manual — a host-authored guide (Wi-Fi, trash, laundry,
    parking, check-out) that gets emailed to guests as a PDF.

    Standalone + org-scoped. ``property_id`` is an OPTIONAL tag linking the
    manual to a physical property; it is ``SET NULL`` on property delete so
    the manual's content outlives any single property row.
    """

    __tablename__ = "welcome_manuals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    property_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("properties.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    # Greeting shown at the top of the emailed PDF / email body. Optional.
    intro_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Public guest share link (PR: PIN-protected share). ``share_token`` is an
    # opaque, unguessable URL segment (``secrets.token_urlsafe``) — Postgres
    # UNIQUE treats NULLs as distinct, so a plain ``unique=True`` is correct
    # even though most manuals never enable sharing. ``share_pin`` is the
    # short guest-facing access code gating ALL manual content (Wi-Fi,
    # check-in, etc.) — stored reversibly via ``EncryptedString`` (NOT a
    # one-way hash) because the host must be able to view/copy the current
    # PIN in their editor to re-share it. Both are cleared together on revoke.
    # The UNIQUE constraint is declared in ``__table_args__`` (not ``unique=True``
    # on the column) so its name matches the migration's
    # ``uq_welcome_manuals_share_token`` — otherwise SQLAlchemy auto-names it
    # ``welcome_manuals_share_token_key`` and ``alembic --autogenerate`` reports
    # spurious constraint churn on every future run.
    share_token: Mapped[str | None] = mapped_column(String(48), nullable=True)
    share_pin: Mapped[str | None] = mapped_column(EncryptedString(10), nullable=True)
    key_version: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=1, server_default="1",
    )

    # Guest-PIN brute-force lockout — mirrors the platform account-lockout
    # primitive (``users.failed_login_count`` / ``users.locked_until``) but
    # keyed on the MANUAL (its share token), NOT the client IP. A per-IP key
    # is bypassable because Caddy appends a guest-supplied ``X-Forwarded-For``,
    # so an attacker rotating that header would get a fresh budget per value.
    # The counter is incremented ONLY on a wrong PIN and reset to 0 on any
    # successful unlock, so a guest legitimately reopening the guide (v1
    # re-prompts on every refresh) can never lock themselves out with the
    # correct code. Once ``failed_unlock_count`` reaches
    # ``SHARE_UNLOCK_MAX_ATTEMPTS`` the row is locked until
    # ``unlock_locked_until`` — during which even a correct PIN is rejected,
    # so there is no timing/oracle side-channel.
    failed_unlock_count: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=0, server_default="0",
    )
    unlock_locked_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )

    __table_args__ = (
        # Name aligned to the migration (see share_token comment above).
        UniqueConstraint("share_token", name="uq_welcome_manuals_share_token"),
        # List view — active manuals for an org, newest first.
        Index(
            "ix_welcome_manuals_org_active",
            "organization_id",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        # "Manuals tagged to this property" lookup.
        Index(
            "ix_welcome_manuals_org_property",
            "organization_id", "property_id",
        ),
    )
