"""Platform-level invite — admin sends an email invite to register on MJH.

Single-use, 7-day token bound to a specific recipient email. On
registration, the user submits the token and the system marks the row
``accepted_at`` + ``accepted_by``. The token row is never deleted on
acceptance — it stays as an audit trail of who invited whom.

This is the platform-level analogue of MBK's ``OrganizationInvite`` —
shape mirrored, org_role/organization_id stripped because MJH has no
orgs. New columns added vs. the MBK shape:

  * ``accepted_at``     — nullable timestamp; non-null means consumed
  * ``accepted_by``     — nullable FK to users.id; the account that claimed it

These two replace MBK's ``status`` enum because the only states that
matter are: pending, accepted, or expired (computed from ``expires_at``).
"""
from __future__ import annotations

import secrets
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


def _default_token() -> str:
    # 32 bytes urlsafe = 43-char base64 — comfortably above the threshold
    # where guessing is computationally infeasible. MBK uses the same
    # generator for its OrganizationInvite tokens.
    return secrets.token_urlsafe(32)


class PlatformInvite(Base):
    __tablename__ = "platform_invites"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    token: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        unique=True,
        default=_default_token,
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
