"""Customer model -- one row per phone number that has ever placed an order.

Customer.phone is the canonical lookup key. Customers are guest checkout --
no account, no password. On a new order, the service upserts by phone:
if a row exists, name is updated; if not, one is created.

PII note: per the vendor.py precedent in mybookkeeper, customer name + phone
are stored in plaintext. They function as the operator's contact list (the
operator needs to text "your order is ready" to the customer), not as
high-sensitivity tenant PII. If that policy changes, switch to
``EncryptedString`` and add a ``phone_hash`` column for indexed lookups.

The ``notes`` column is reserved for the "the usual" feature (PR 10) where it
will be auto-populated with a short summary of typical items ordered. PR 5
does not write to it.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    DateTime,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Customer(Base):
    __tablename__ = "customer"
    __table_args__ = (
        UniqueConstraint("phone", name="uq_customer_phone"),
        Index("ix_customer_phone", "phone"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
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
