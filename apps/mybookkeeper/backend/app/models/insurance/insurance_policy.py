"""Insurance policy record scoped to a listing.

One policy per listing (e.g. "Landlord Insurance — 123 Main St"). Multiple
attachments per policy (see ``insurance_policy_attachment.py``).

Soft-deleted because insurance records are financial/legal documents and
retention is recommended even after operational deletion.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
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

from app.core.encrypted_string_type import EncryptedString
from app.core.insurance_enums import PREMIUM_FREQUENCIES_SQL
from app.db.base import Base


class InsurancePolicy(Base):
    __tablename__ = "insurance_policies"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    listing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("listings.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    policy_name: Mapped[str] = mapped_column(String(255), nullable=False)
    carrier: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # PII-adjacent — policy numbers can identify individuals with insurers.
    policy_number: Mapped[str | None] = mapped_column(
        EncryptedString(255), nullable=True,
    )
    key_version: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=1, server_default="1",
    )

    effective_date: Mapped[_dt.date | None] = mapped_column(Date, nullable=True)
    expiration_date: Mapped[_dt.date | None] = mapped_column(Date, nullable=True)

    # Stored as cents to avoid floating-point precision issues.
    coverage_amount_cents: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True,
    )

    # What the policy costs, as billed. Meaningless without ``premium_frequency``
    # — the CHECK below keeps the pair together — because carriers quote the same
    # policy annually or monthly depending on the payment plan.
    premium_cents: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    premium_frequency: Mapped[str | None] = mapped_column(String(12), nullable=True)

    # The all-other-perils deductible, in dollars. Zero is a real value here
    # (first-dollar coverage exists), so it is allowed where a zero premium is
    # not.
    deductible_cents: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    # Texas wind/hail is routinely written as a percentage of dwelling coverage
    # rather than a flat amount, and on a Gulf-coast policy it is the largest
    # number on the declarations page. Stored separately because it does not
    # replace the flat deductible — a policy normally carries both, and folding
    # a 2% wind deductible into a dollar field would silently invent a figure
    # that only holds at today's coverage amount.
    wind_hail_deductible_pct: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 2), nullable=True,
    )

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

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
            "length(policy_name) > 0",
            name="chk_insurance_policy_name_nonempty",
        ),
        CheckConstraint(
            f"premium_frequency IS NULL"
            f" OR premium_frequency IN {PREMIUM_FREQUENCIES_SQL}",
            name="chk_insurance_policy_premium_frequency",
        ),
        # Amount and period travel together or not at all. An amount without a
        # period cannot be annualised, and a period without an amount describes
        # nothing — both halves would read as "recorded" while being unusable.
        CheckConstraint(
            "(premium_cents IS NULL) = (premium_frequency IS NULL)",
            name="chk_insurance_policy_premium_pair",
        ),
        # A zero premium means "not recorded", which is what NULL is for; a zero
        # deductible is a real product, so only the premium is barred from zero.
        CheckConstraint(
            "(premium_cents IS NULL OR premium_cents > 0)"
            " AND (deductible_cents IS NULL OR deductible_cents >= 0)",
            name="chk_insurance_policy_amounts_valid",
        ),
        CheckConstraint(
            "wind_hail_deductible_pct IS NULL"
            " OR (wind_hail_deductible_pct > 0 AND wind_hail_deductible_pct <= 100)",
            name="chk_insurance_policy_wind_hail_pct_range",
        ),
        # List page: newest active first per org.
        Index(
            "ix_insurance_policies_org_created_active",
            "organization_id", "created_at",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        # Expiration filter (expiring soon toggle).
        Index(
            "ix_insurance_policies_org_expiration_active",
            "organization_id", "expiration_date",
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )
