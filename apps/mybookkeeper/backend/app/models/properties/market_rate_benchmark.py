"""ORM model for ``market_rate_benchmarks`` — what the market currently charges.

One row per (organization, service type): the going rate the operator last
observed, where they saw it, and the day they saw it. ``utility_plans`` records
what is being paid; this records what could be paid, and the gap between them is
the only thing a "you may be overpaying" flag needs.

Scoped to the **organization alone**, unlike almost every other table in this
app. What the market charges is a fact about the market, not about the member
who looked it up, so a rate recorded by one member must be the same rate every
other member is measured against. ``recorded_by_user_id`` is kept purely as
provenance and is never a query filter — filtering on it would contradict the
unique index below, and the second member of an organization would silently see
"no market rate recorded" while their write collided with a row they could not
read.

Deliberately operator-maintained rather than scraped. The authoritative source
differs per market (Power to Choose in deregulated Texas, a municipal tariff
sheet elsewhere, a competitor quote for internet), and a wrong automatic number
is worse than an absent one — it would flag confidently against a rate that does
not apply to this address. ``source`` and ``observed_on`` exist so a stale or
mis-sourced benchmark is visible instead of silently driving the badge.

Two mutually exclusive shapes, because the services being compared are not
priced the same way:

``rate_cents_per_kwh``
    Metered service (electricity, gas). Compared against a plan's
    ``avg_price_cents_per_kwh_at_1000`` — the all-in advertised average, which
    is the figure competitors publish and therefore the only one comparable
    without knowing this property's usage.

``monthly_cents``
    Flat service (internet). Compared against the plan's monthly base plus
    equipment fee, since a modem rental is part of what the bill actually costs.

The CHECK enforces exactly one, so a row can never be ambiguous about which
comparison it participates in.
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
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.market_benchmark_constants import FLAT_RATE_SERVICE_TYPES
from app.core.utility_plan_constants import SERVICE_TYPES
from app.db.base import Base

_SERVICE_TYPE_IN = ", ".join(f"'{v}'" for v in sorted(SERVICE_TYPES))
_FLAT_SERVICE_TYPE_IN = ", ".join(f"'{v}'" for v in sorted(FLAT_RATE_SERVICE_TYPES))


class MarketRateBenchmark(Base):
    __tablename__ = "market_rate_benchmarks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    # Provenance, NOT a tenant key — read the class docstring before filtering
    # on it. Nullable with ``SET NULL`` so removing the member who recorded a
    # rate leaves the organization's benchmark standing; the row describes the
    # market, and the market does not belong to whoever happened to look it up.
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

    service_type: Mapped[str] = mapped_column(String(20), nullable=False)

    # Metered shape. Numeric for the same reason the plan's rates are: a rate
    # carries four decimal places that integer cents cannot hold.
    rate_cents_per_kwh: Mapped[Decimal | None] = mapped_column(
        Numeric(9, 4), nullable=True,
    )
    # Flat shape.
    monthly_cents: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    # Where the number came from, in the operator's own words — "Power to
    # Choose, 77021, 12-month fixed, 4★+". Free text on purpose: the useful
    # provenance is the filters that produced the figure, which no enum could
    # anticipate. Without it a benchmark is an unfalsifiable number.
    source: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # The day it was observed, not the day the row was written — a benchmark
    # entered from last month's notes should age from when it was true.
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
        CheckConstraint(
            f"service_type IN ({_SERVICE_TYPE_IN})",
            name="chk_market_benchmark_service_type",
        ),
        # Exactly one shape. Neither set is a row that compares against nothing;
        # both set is a row that cannot say which comparison it means.
        CheckConstraint(
            "(rate_cents_per_kwh IS NULL) <> (monthly_cents IS NULL)",
            name="chk_market_benchmark_one_shape",
        ),
        # ...and it must be the shape that service type is priced in. Without
        # this, an electricity benchmark recorded as ``monthly_cents`` compares
        # a per-kWh rate against a dollar amount: 15.06 against 6000 reads as
        # 99.7% *below* market, so the plan is reported as fine forever. The
        # row would be internally consistent and completely wrong.
        CheckConstraint(
            f"(service_type IN ({_FLAT_SERVICE_TYPE_IN}))"
            " = (monthly_cents IS NOT NULL)",
            name="chk_market_benchmark_shape_matches_service",
        ),
        CheckConstraint(
            "(rate_cents_per_kwh IS NULL OR rate_cents_per_kwh > 0)"
            " AND (monthly_cents IS NULL OR monthly_cents > 0)",
            name="chk_market_benchmark_positive",
        ),
        # One benchmark per service per org. Unlike ``utility_plans``, history
        # is not the point here — an outdated market observation has no value
        # once a newer one exists, and keeping several would leave the
        # comparison ambiguous about which to use.
        Index(
            "uq_market_benchmark_org_service",
            "organization_id", "service_type",
            unique=True,
        ),
    )
