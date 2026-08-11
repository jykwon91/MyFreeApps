"""ORM model for ``utility_plans`` — the contract behind a utility account.

Sibling of ``utility_account_link``, which answers "which property does this
provider account bill for?". This table answers the question that costs money:
"what am I paying, under what terms, and when does the term end?"

Rows are history, not state. A property accumulates one row per plan it has
ever been on; the *current* plan for a (property, service_type) is the
non-deleted row with the latest ``service_start_date``. There is deliberately
no ``is_current`` column and no unique constraint forcing one row per
(property, service_type) — the previous plan's rate is what a rate comparison
is measured against, so discarding it would defeat the point. Deriving
"current" instead of storing it keeps the two from drifting apart
(``utility_plan_service.current_plan_ids``).

Rate columns are ``Numeric``, not integer cents: a TDU charge of 5.3509 ¢/kWh
carries four decimal places and integer cents cannot hold it. Flat money
amounts (base charge, ETF, credits) stay ``BigInteger`` cents to match the rest
of the schema.

``account_number`` is stored in PLAINTEXT, matching ``utility_account_link``
deliberately. That table must keep it plaintext — its lookup is an equality
match and Fernet ciphertext is non-deterministic — so the same value is already
recoverable from the same database. Encrypting only this copy would add
ceremony without protecting anything, while making the two representations of
one real-world identifier inconsistent. It is normalized (upper, spaces /
dashes / dots stripped) identically to that table so the two can be joined.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.utility_plan_constants import RATE_TYPES, SERVICE_TYPES
from app.db.base import Base

_SERVICE_TYPE_IN = ", ".join(f"'{v}'" for v in sorted(SERVICE_TYPES))
_RATE_TYPE_IN = ", ".join(f"'{v}'" for v in sorted(RATE_TYPES))


class UtilityPlan(Base):
    __tablename__ = "utility_plans"

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
    # CASCADE: a deleted property's utility contracts are meaningless without it.
    property_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("properties.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    # The document these numbers were read off — an EFL, a bill, a contract.
    # SET NULL rather than CASCADE: the rate stays true after its evidence is
    # deleted, it just becomes unsourced. Null is the honest state for a plan
    # typed in by hand, which is every row that predates document upload.
    source_document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )

    service_type: Mapped[str] = mapped_column(String(20), nullable=False)
    provider_name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Plaintext + normalized to match utility_account_link.account_number.
    account_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    plan_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rate_type: Mapped[str] = mapped_column(String(20), nullable=False)

    # ---- Price components -------------------------------------------------
    # Supplier's own charge. Null for regulated service where the operator only
    # ever sees a single blended number.
    energy_charge_cents_per_kwh: Mapped[Decimal | None] = mapped_column(
        Numeric(9, 4), nullable=True,
    )
    # Wires charge from the delivery utility (TDU/TDSP). Passed through
    # unchanged whichever supplier is chosen, so it is NOT part of what
    # shopping can improve — recorded separately for exactly that reason.
    tdu_charge_cents_per_kwh: Mapped[Decimal | None] = mapped_column(
        Numeric(9, 4), nullable=True,
    )
    # The all-in average at 1,000 kWh that providers advertise. Stored as
    # given rather than recomputed: it is the number on the EFL, and it is the
    # only figure directly comparable to a competitor's headline rate.
    avg_price_cents_per_kwh_at_1000: Mapped[Decimal | None] = mapped_column(
        Numeric(9, 4), nullable=True,
    )
    monthly_base_charge_cents: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True,
    )

    # ---- Term -------------------------------------------------------------
    term_months: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    service_start_date: Mapped[_dt.date | None] = mapped_column(Date, nullable=True)
    # The renewal cliff. Null means open-ended (month-to-month or regulated).
    term_end_date: Mapped[_dt.date | None] = mapped_column(Date, nullable=True)
    early_termination_fee_cents: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True,
    )

    # ---- Usage-shaped pricing traps ---------------------------------------
    # A bill-credit plan advertises a low ¢/kWh that only materializes at or
    # above a usage threshold, so its real cost depends on the property's usage
    # distribution rather than on the headline rate. Recording the shape is
    # what lets a comparison be honest about months below the threshold.
    has_bill_credit: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false"),
    )
    bill_credit_amount_cents: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True,
    )
    bill_credit_threshold_kwh: Mapped[int | None] = mapped_column(
        Integer, nullable=True,
    )
    # The mirror image: a penalty applied below a usage floor.
    min_usage_fee_cents: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    min_usage_threshold_kwh: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # ---- Internet-shaped pricing ------------------------------------------
    # An internet plan's renewal cliff is a price step, not a lapse: service
    # continues at the standard rate when the promo ends. ``term_end_date``
    # already carries the date; this carries what the bill becomes after it,
    # which is the half that makes the alert worth acting on.
    post_promo_monthly_cents: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True,
    )
    # Modem / router rental, routinely quoted outside the advertised price.
    # Separated for the same reason as ``tdu_charge_cents_per_kwh``: it is a
    # real cost that switching providers does not necessarily remove.
    equipment_fee_monthly_cents: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True,
    )
    # What the money buys. Comparing two internet plans on price alone is the
    # same error as comparing two electricity bills without their kWh.
    download_mbps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    upload_mbps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Null means uncapped (the usual case on fiber), not unknown-and-zero.
    data_cap_gb: Mapped[int | None] = mapped_column(Integer, nullable=True)

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
            f"service_type IN ({_SERVICE_TYPE_IN})",
            name="chk_utility_plan_service_type",
        ),
        CheckConstraint(
            f"rate_type IN ({_RATE_TYPE_IN})",
            name="chk_utility_plan_rate_type",
        ),
        CheckConstraint(
            "length(provider_name) > 0",
            name="chk_utility_plan_provider_nonempty",
        ),
        # A term cannot end before it starts. Cheap to enforce, and a reversed
        # pair would silently make the plan look permanently expired.
        CheckConstraint(
            "service_start_date IS NULL"
            " OR term_end_date IS NULL"
            " OR term_end_date >= service_start_date",
            name="chk_utility_plan_term_order",
        ),
        # A bill credit is meaningless without both its amount and the
        # threshold that unlocks it; storing one without the other would make
        # any cost comparison quietly wrong.
        CheckConstraint(
            "has_bill_credit IS FALSE"
            " OR (bill_credit_amount_cents IS NOT NULL"
            " AND bill_credit_threshold_kwh IS NOT NULL)",
            name="chk_utility_plan_bill_credit_complete",
        ),
        # A post-promo price with no date it takes effect on is unusable —
        # it would render as a price step the UI cannot place on a calendar.
        CheckConstraint(
            "post_promo_monthly_cents IS NULL OR term_end_date IS NOT NULL",
            name="chk_utility_plan_post_promo_needs_term_end",
        ),
        CheckConstraint(
            "(post_promo_monthly_cents IS NULL OR post_promo_monthly_cents >= 0)"
            " AND (equipment_fee_monthly_cents IS NULL"
            " OR equipment_fee_monthly_cents >= 0)",
            name="chk_utility_plan_internet_amounts_nonneg",
        ),
        # Zero is not a meaningful speed or cap — it means "not recorded",
        # which is what NULL already says. Rejecting 0 keeps them distinct.
        CheckConstraint(
            "(download_mbps IS NULL OR download_mbps > 0)"
            " AND (upload_mbps IS NULL OR upload_mbps > 0)"
            " AND (data_cap_gb IS NULL OR data_cap_gb > 0)",
            name="chk_utility_plan_speeds_positive",
        ),
        # Current-plan resolution: newest start per property + service.
        Index(
            "ix_utility_plans_property_service_start_active",
            "property_id", "service_type", "service_start_date",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        # Expiring-soon sweep, per org and across orgs (worker).
        Index(
            "ix_utility_plans_org_term_end_active",
            "organization_id", "term_end_date",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index(
            "ix_utility_plans_term_end_active",
            "term_end_date",
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )
