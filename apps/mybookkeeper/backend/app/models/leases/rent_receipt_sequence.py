"""Per-landlord per-year receipt number sequence.

Each landlord (user_id) gets an incrementing counter per calendar year.
The counter is bumped atomically via an UPDATE ... RETURNING before the PDF
is generated, so concurrent sends never reuse a number.

Receipt numbers are formatted as ``R-<year>-<number padded to 4 digits>``,
e.g. ``R-2026-0001``.
"""
from __future__ import annotations

import uuid

from sqlalchemy import (
    ForeignKey,
    Integer,
    SmallInteger,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RentReceiptSequence(Base):
    __tablename__ = "rent_receipt_sequences"

    # Composite PK — one row per (user, year).
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    year: Mapped[int] = mapped_column(SmallInteger, primary_key=True, nullable=False)

    last_number: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    __table_args__ = (
        UniqueConstraint("user_id", "year", name="uq_rent_receipt_sequence_user_year"),
    )
