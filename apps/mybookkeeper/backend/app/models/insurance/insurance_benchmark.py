"""ORM model for ``insurance_benchmarks`` — what property insurance costs here.

One row per organization: the typical annual premium the operator last observed
for a comparable property, and the dwelling coverage that premium buys.
``insurance_policies`` records what is being paid; this records what the market
charges, and the gap between them is the only thing a "you may be overpaying"
flag needs.

**Two numbers, not one.** A premium on its own is not comparable — "$3,506 a
year" says nothing until you know what it insures. Storing the coverage the
benchmark assumes lets both sides of the comparison be reduced to the same unit
(annual premium per $1,000 of dwelling coverage), which is what makes a county
average assembled from mixed housing stock usable against one specific policy.
It also mirrors how a policy row itself is shaped, so the same arithmetic runs
over both.

Scoped to the **organization alone**, like ``market_rate_benchmarks`` and unlike
almost every other table here. What the market charges is a fact about the
market, not about the member who looked it up. ``recorded_by_user_id`` is
provenance only and is never a query filter — filtering on it would contradict
the unique index below, and the second member of an organization would see "no
benchmark recorded" while their write collided with a row they could not read.

**One row per organization, with no type dimension.** The utility equivalent is
keyed by service type because electricity and internet are priced in different
units. Insurance policies here carry no comparable type discriminator, and
inventing one would mean guessing which bucket each policy belongs in — so the
benchmark describes the operator's market as a whole. If policy types are ever
modelled, this is the constraint to revisit.

Deliberately operator-maintained rather than fetched. No public feed of
homeowners premiums exists: HelpInsure's rate wizard is a session-based form
with no API, and the Texas Department of Insurance publishes its county averages
only through a Tableau visualisation. A wrong automatic number would be worse
than an absent one — it would flag confidently against a market that is not
this one. ``source`` and ``observed_on`` exist so a stale or mis-sourced
benchmark is visible instead of silently driving the badge.
"""
from __future__ import annotations

import datetime as _dt
import uuid

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class InsuranceBenchmark(Base):
    __tablename__ = "insurance_benchmarks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    # Provenance, NOT a tenant key — read the class docstring before filtering
    # on it. Nullable with ``SET NULL`` so removing the member who recorded the
    # figure leaves the organization's benchmark standing.
    recorded_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    # The typical annual premium, always annualised. Unlike a policy — which
    # stores what the carrier bills and derives the year — a published benchmark
    # is already an annual figure, so there is no billing period to preserve.
    annual_premium_cents: Mapped[int] = mapped_column(BigInteger, nullable=False)
    # The dwelling coverage that premium buys. Without it the premium cannot be
    # normalised, so it is NOT NULL: a benchmark that cannot participate in the
    # comparison has no reason to exist.
    coverage_amount_cents: Mapped[int] = mapped_column(BigInteger, nullable=False)

    # Which market this describes, in the operator's own words — "Harris County,
    # TX". Free text on purpose: the useful granularity varies (county, ZIP,
    # metro) and no enum could anticipate it. Nullable because a single-market
    # operator gains nothing from restating it.
    region_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # Where the number came from — "TDI 2025 county averages, Harris". Without
    # it a benchmark is an unfalsifiable number.
    source: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # The day the figure was observed, not the day the row was written, so a
    # benchmark entered from an older publication ages from when it was true.
    observed_on: Mapped[_dt.date] = mapped_column(Date, nullable=False)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

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
        # Both must be strictly positive. A zero premium is not a free market
        # rate, and a zero coverage would make the normalisation divide by zero
        # — the DB refuses the row rather than leaving the service to guard it.
        CheckConstraint(
            "annual_premium_cents > 0",
            name="chk_insurance_benchmark_premium_positive",
        ),
        CheckConstraint(
            "coverage_amount_cents > 0",
            name="chk_insurance_benchmark_coverage_positive",
        ),
        # One benchmark per org. History is not the point: an outdated market
        # observation has no value once a newer one exists, and keeping several
        # would leave the comparison ambiguous about which to use.
        Index(
            "uq_insurance_benchmark_org",
            "organization_id",
            unique=True,
        ),
    )
