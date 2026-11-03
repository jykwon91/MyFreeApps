"""Signing a user out of every token issued before a credential change.

JWTs can't be revoked individually, so each user carries a cutoff:
``auth_valid_after``. Tokens issued before it stop working. NULL means no
cutoff, so existing users keep their sessions when this first deploys.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime
from sqlalchemy.orm import Mapped, mapped_column


class SessionInvalidationMixin:
    """Adds the cutoff column to an app's ``User`` model."""

    auth_valid_after: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )


def session_cutoff_now() -> datetime:
    """The value to store when every existing token should stop working."""
    return datetime.now(timezone.utc)


def is_issued_before_cutoff(issued_at: int, cutoff: datetime) -> bool:
    """Whether a token's whole-second ``iat`` predates ``cutoff``.

    Compares whole seconds so the token issued right after a change, in the same
    second, still works. A token from earlier in that second survives too, which
    is the cost of ``iat`` having no finer resolution.
    """
    return issued_at < int(cutoff.timestamp())


__all__ = ["SessionInvalidationMixin", "is_issued_before_cutoff", "session_cutoff_now"]
