"""Platform-level invite — admin sends an email invite to register on MJH.

Single-use, 7-day token bound to a specific recipient email. On
registration, the user submits the token and the system marks the row
``accepted_at`` + ``accepted_by``. The token row is never deleted on
acceptance — it stays as an audit trail of who invited whom.

Security shape (PR fix/myjobhunter-invite-security-hardening, 2026-05-05):
the ``token_hash`` column stores ``sha256(raw_token)`` only — the raw
token never persists. The raw token reaches the recipient via email
once, then exists only in their inbox. A read-only DB compromise
yields hashes, not usable grants.

Columns vs. MBK's ``OrganizationInvite``: org_role/organization_id are
stripped because MJH has no orgs. New columns:

  * ``accepted_at``     — nullable timestamp; non-null means consumed
  * ``accepted_by``     — nullable FK to users.id; the account that claimed it

These two replace MBK's ``status`` enum because the only states that
matter are: pending, accepted, or expired (computed from ``expires_at``).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


# 7-day expiry for every fresh invite. Centralized here so the service +
# repo + tests all read the same constant.
INVITE_EXPIRY_DAYS = 7


def _default_expires_at() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=INVITE_EXPIRY_DAYS)


class PlatformInvite(Base):
    __tablename__ = "platform_invites"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    # sha256 hex digest of the raw token. Service layer owns generation +
    # hashing — see app/services/platform/invite_token.py. The model
    # deliberately has NO default so callers can't accidentally insert an
    # empty row and lose the link between row and recipient.
    token_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        unique=True,
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_default_expires_at,
    )
    accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    accepted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
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
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        CheckConstraint(
            "accepted_at IS NULL OR accepted_at >= created_at",
            name="chk_platform_invites_accepted_after_created",
        ),
        Index(
            "ix_platform_invites_email_pending",
            "email",
            postgresql_where="accepted_at IS NULL",
        ),
    )
