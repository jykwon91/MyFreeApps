"""One signed-in device: the row behind a mobile refresh token."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column


def _now() -> datetime:
    return datetime.now(timezone.utc)


class RefreshSessionMixin:
    """Every column except ``user_id``, whose foreign key names the app's user table."""

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    current_secret_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    # The secret replaced by the last refresh, accepted briefly until the client
    # proves it received the new one. Without it, a response lost on a bad
    # connection would sign the user out.
    previous_secret_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    previous_valid_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    # A secret replaced because the previous one was presented again. A client that
    # really lost it can never present it, so seeing it means two parties hold this
    # session.
    abandoned_secret_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    device_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # When the user last proved who they are. Refreshing never moves it, so a
    # renewed token can't pass the strict gate's recent-login check.
    auth_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, server_default=func.now(),
    )
    last_used_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, server_default=func.now(),
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


__all__ = ["RefreshSessionMixin"]
