"""SQLAlchemy ORM model for ``vendors``.

Per RENTALS_PLAN.md §5.4:
- Vendors are businesses (handymen, plumbers, etc.) — no PII, so no
  ``EncryptedString`` columns and no ``key_version``. Phone/email/address
  are vendor business contact info, not host PII.
- Soft-delete via ``deleted_at`` is required so historical
  ``Transaction.vendor_id`` references (added in PR 4.2's combined-FK
  migration) can still resolve a vendor name after the host removes the
  vendor from their active rolodex.
- ``last_used_at`` is updated by the future PR 4.2 transaction-attach flow
  to power "Recently used" sort in the rolodex UI.
- ``preferred`` is a host-curated flag for "show this one first".
- Dual scope ``(organization_id, user_id)`` per RENTALS_PLAN.md §8.1, both
  ``ON DELETE CASCADE``.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.vendor_enums import VENDOR_CATEGORIES_SQL
from app.db.base import Base


class Vendor(Base):
    __tablename__ = "vendors"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
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

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(40), nullable=False)

    # Vendor business contact info — not host PII, plain TEXT.
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)

    hourly_rate: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 2), nullable=True,
    )
    flat_rate_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    preferred: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false"),
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    last_used_at: Mapped[_dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    deleted_at: Mapped[_dt.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    created_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: _dt.datetime.now(_dt.timezone.utc),
        server_default=func.now(),
    )
    updated_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: _dt.datetime.now(_dt.timezone.utc),
        onupdate=lambda: _dt.datetime.now(_dt.timezone.utc),
        server_default=func.now(),
    )

    __table_args__ = (
        CheckConstraint(
            f"category IN {VENDOR_CATEGORIES_SQL}",
            name="chk_vendor_category",
        ),
        # Rolodex filter — covers (org, category) for active rows.
        Index(
            "ix_vendors_org_category_active",
            "organization_id", "category",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        # "Show preferred vendors first" — partial index over preferred=true.
        Index(
            "ix_vendors_org_preferred_active",
            "organization_id", "preferred",
            postgresql_where=text("deleted_at IS NULL AND preferred = true"),
        ),
        # Newest-first sort fallback.
        Index(
            "ix_vendors_org_created_active",
            "organization_id", "created_at",
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )
