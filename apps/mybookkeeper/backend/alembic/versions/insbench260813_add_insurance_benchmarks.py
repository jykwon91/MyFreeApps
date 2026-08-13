"""add insurance_benchmarks

``insurance_policies`` now records what a policy costs, but a premium in
isolation cannot answer "am I overpaying" — that needs something to compare
against. This table holds it: the typical annual premium the operator observed
for a comparable property, and the dwelling coverage that premium buys.

Both numbers are stored, not just the premium, because a premium alone is not
comparable. "$3,506 a year" means nothing until you know what it insures. With
the coverage recorded, both sides reduce to annual premium per $1,000 of
dwelling coverage, which is what lets a county average assembled from mixed
housing stock be measured against one specific policy.

One row per organization. The utility sibling (``market_rate_benchmarks``) is
keyed by service type because electricity and internet are priced in different
units; insurance policies here carry no comparable type discriminator, so the
benchmark describes the operator's market as a whole.

Operator-entered rather than fetched: no public feed of homeowners premiums
exists, so ``source`` and ``observed_on`` carry the provenance that makes a
stale or mis-sourced figure visible instead of silently driving a badge.

Revision ID: insbench260813
Revises: inspremium260812
Create Date: 2026-08-13
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "insbench260813"
down_revision = "inspremium260812"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "insurance_benchmarks",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        # Provenance only — never a query filter. See the model docstring.
        sa.Column(
            "recorded_by_user_id", postgresql.UUID(as_uuid=True), nullable=True,
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("annual_premium_cents", sa.BigInteger(), nullable=False),
        sa.Column("coverage_amount_cents", sa.BigInteger(), nullable=False),
        sa.Column("region_label", sa.String(length=120), nullable=True),
        sa.Column("source", sa.String(length=255), nullable=True),
        sa.Column("observed_on", sa.Date(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        # A zero premium is not a free market rate, and a zero coverage would
        # make the per-$1,000 normalisation divide by zero. Refused here rather
        # than guarded in the service.
        sa.CheckConstraint(
            "annual_premium_cents > 0",
            name="chk_insurance_benchmark_premium_positive",
        ),
        sa.CheckConstraint(
            "coverage_amount_cents > 0",
            name="chk_insurance_benchmark_coverage_positive",
        ),
        sa.ForeignKeyConstraint(
            ["recorded_by_user_id"], ["users.id"], ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_insurance_benchmarks_recorded_by_user_id",
        "insurance_benchmarks",
        ["recorded_by_user_id"],
    )
    op.create_index(
        "ix_insurance_benchmarks_organization_id",
        "insurance_benchmarks",
        ["organization_id"],
    )
    # One benchmark per org: an outdated observation has no value once a newer
    # one exists, and two rows would leave the comparison ambiguous.
    op.create_index(
        "uq_insurance_benchmark_org",
        "insurance_benchmarks",
        ["organization_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_insurance_benchmark_org", table_name="insurance_benchmarks")
    op.drop_index(
        "ix_insurance_benchmarks_organization_id", table_name="insurance_benchmarks",
    )
    op.drop_index(
        "ix_insurance_benchmarks_recorded_by_user_id",
        table_name="insurance_benchmarks",
    )
    op.drop_table("insurance_benchmarks")
