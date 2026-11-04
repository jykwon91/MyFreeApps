"""The last two-factor time step a user spent, so a code can't be used twice."""
from __future__ import annotations

from sqlalchemy import BigInteger
from sqlalchemy.orm import Mapped, mapped_column


class TotpReplayGuardMixin:
    """Adds the replay marker column to an app's ``User`` model."""

    totp_last_used_step: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
