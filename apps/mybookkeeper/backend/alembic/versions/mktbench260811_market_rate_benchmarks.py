"""add market_rate_benchmarks — what the market charges, to compare plans against

``utility_plans`` records what is being paid. Nothing records what *could* be
paid, so the only overpay the app can currently detect is a lapsed term. A plan
signed at a good price two years ago and still comfortably inside its term looks
completely healthy on the list while being the most expensive line in the
portfolio.

This table holds one operator-recorded market observation per (organization,
service type). The comparison needs no more than that: the plan's advertised
figure against the market's, with a materiality threshold so ordinary noise
between two hand-recorded numbers does not raise a badge.

Operator-maintained rather than scraped on purpose — the authoritative source
differs per market and per service, and a confidently wrong automatic rate is
worse than no rate at all. ``source`` and ``observed_on`` keep a stale or
mis-sourced number visible rather than silently driving the flag.

Revision ID: mktbench260811
Revises: utilcap260811
Create Date: 2026-08-11
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "mktbench260811"
down_revision = "utilcap260811"
branch_labels = None
depends_on = None

# Mirrors app.core.utility_plan_constants.SERVICE_TYPES. Spelled out rather
# than imported so the migration keeps describing the schema as it was at this
# revision even after the constant later gains a value.
_SERVICE_TYPES = ("electricity", "internet", "natural_gas", "water")
_SERVICE_TYPE_IN = ", ".join(f"'{v}'" for v in _SERVICE_TYPES)

# Mirrors app.core.market_benchmark_constants.FLAT_RATE_SERVICE_TYPES — the
# services quoted as a monthly amount rather than per unit consumed.
_FLAT_SERVICE_TYPES = ("internet",)
_FLAT_SERVICE_TYPE_IN = ", ".join(f"'{v}'" for v in _FLAT_SERVICE_TYPES)


def upgrade() -> None:
    op.create_table(
        "market_rate_benchmarks",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        # Provenance only — the row is scoped to the organization, so this is
        # never a query filter. SET NULL rather than CASCADE: removing the
        # member who looked the rate up must not delete the org's benchmark.
        sa.Column(
            "recorded_by_user_id", postgresql.UUID(as_uuid=True), nullable=True,
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("service_type", sa.String(length=20), nullable=False),
        # Metered shape (electricity, gas): four decimals, same as the plan's
        # own rate columns, because integer cents cannot hold 11.6000.
        sa.Column("rate_cents_per_kwh", sa.Numeric(9, 4), nullable=True),
        # Flat shape (internet).
        sa.Column("monthly_cents", sa.BigInteger(), nullable=True),
        sa.Column("source", sa.String(length=255), nullable=True),
        sa.Column("observed_on", sa.Date(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["recorded_by_user_id"], ["users.id"], ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            f"service_type IN ({_SERVICE_TYPE_IN})",
            name="chk_market_benchmark_service_type",
        ),
        # Exactly one shape: neither set compares against nothing, both set
        # cannot say which comparison the row means.
        sa.CheckConstraint(
            "(rate_cents_per_kwh IS NULL) <> (monthly_cents IS NULL)",
            name="chk_market_benchmark_one_shape",
        ),
        # ...and it must be the shape that service type is priced in. An
        # electricity benchmark stored as monthly_cents would compare a per-kWh
        # rate against a dollar amount and read as ~99% below market — a
        # permanently wrong all-clear rather than a visible error.
        sa.CheckConstraint(
            f"(service_type IN ({_FLAT_SERVICE_TYPE_IN}))"
            " = (monthly_cents IS NOT NULL)",
            name="chk_market_benchmark_shape_matches_service",
        ),
        sa.CheckConstraint(
            "(rate_cents_per_kwh IS NULL OR rate_cents_per_kwh > 0)"
            " AND (monthly_cents IS NULL OR monthly_cents > 0)",
            name="chk_market_benchmark_positive",
        ),
    )
    op.create_index(
        "ix_market_rate_benchmarks_recorded_by_user_id",
        "market_rate_benchmarks",
        ["recorded_by_user_id"],
    )
    op.create_index(
        "ix_market_rate_benchmarks_organization_id",
        "market_rate_benchmarks",
        ["organization_id"],
    )
    # One benchmark per service per org — a superseded market observation has
    # no value once a newer one exists, and keeping several would leave the
    # comparison ambiguous about which to apply.
    op.create_index(
        "uq_market_benchmark_org_service",
        "market_rate_benchmarks",
        ["organization_id", "service_type"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_market_benchmark_org_service", table_name="market_rate_benchmarks")
    op.drop_index(
        "ix_market_rate_benchmarks_organization_id", table_name="market_rate_benchmarks",
    )
    op.drop_index(
        "ix_market_rate_benchmarks_recorded_by_user_id",
        table_name="market_rate_benchmarks",
    )
    op.drop_table("market_rate_benchmarks")
