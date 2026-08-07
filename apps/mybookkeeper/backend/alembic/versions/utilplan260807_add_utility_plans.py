"""add utility_plans

Records the contract behind a utility account — rate, term, and the date the
term ends — so a lapsed fixed-rate plan rolling onto a holdover variable rate
becomes visible instead of silent.

Revision ID: utilplan260807
Revises: wmanualshare260721
Create Date: 2026-08-07
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "utilplan260807"
down_revision = "wmanualshare260721"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "utility_plans",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True,
            server_default=sa.text("gen_random_uuid()"), nullable=False,
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("property_id", postgresql.UUID(as_uuid=True), nullable=False),

        sa.Column("service_type", sa.String(length=20), nullable=False),
        sa.Column("provider_name", sa.String(length=255), nullable=False),
        sa.Column("account_number", sa.String(length=100), nullable=True),
        sa.Column("plan_name", sa.String(length=255), nullable=True),
        sa.Column("rate_type", sa.String(length=20), nullable=False),

        # Numeric, not integer cents: a TDU charge of 5.3509 ¢/kWh has four
        # decimal places that integer cents cannot represent.
        sa.Column("energy_charge_cents_per_kwh", sa.Numeric(9, 4), nullable=True),
        sa.Column("tdu_charge_cents_per_kwh", sa.Numeric(9, 4), nullable=True),
        sa.Column("avg_price_cents_per_kwh_at_1000", sa.Numeric(9, 4), nullable=True),
        sa.Column("monthly_base_charge_cents", sa.BigInteger(), nullable=True),

        sa.Column("term_months", sa.SmallInteger(), nullable=True),
        sa.Column("service_start_date", sa.Date(), nullable=True),
        sa.Column("term_end_date", sa.Date(), nullable=True),
        sa.Column("early_termination_fee_cents", sa.BigInteger(), nullable=True),

        sa.Column(
            "has_bill_credit", sa.Boolean(), nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("bill_credit_amount_cents", sa.BigInteger(), nullable=True),
        sa.Column("bill_credit_threshold_kwh", sa.Integer(), nullable=True),
        sa.Column("min_usage_fee_cents", sa.BigInteger(), nullable=True),
        sa.Column("min_usage_threshold_kwh", sa.Integer(), nullable=True),

        sa.Column("notes", sa.Text(), nullable=True),

        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),

        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="CASCADE",
            name="fk_utility_plans_user_id",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="CASCADE",
            name="fk_utility_plans_organization_id",
        ),
        sa.ForeignKeyConstraint(
            ["property_id"], ["properties.id"], ondelete="CASCADE",
            name="fk_utility_plans_property_id",
        ),
        sa.CheckConstraint(
            "service_type IN ('electricity', 'internet', 'natural_gas', 'water')",
            name="chk_utility_plan_service_type",
        ),
        sa.CheckConstraint(
            "rate_type IN ('fixed', 'indexed', 'regulated', 'variable')",
            name="chk_utility_plan_rate_type",
        ),
        sa.CheckConstraint(
            "length(provider_name) > 0",
            name="chk_utility_plan_provider_nonempty",
        ),
        sa.CheckConstraint(
            "service_start_date IS NULL"
            " OR term_end_date IS NULL"
            " OR term_end_date >= service_start_date",
            name="chk_utility_plan_term_order",
        ),
        sa.CheckConstraint(
            "has_bill_credit IS FALSE"
            " OR (bill_credit_amount_cents IS NOT NULL"
            " AND bill_credit_threshold_kwh IS NOT NULL)",
            name="chk_utility_plan_bill_credit_complete",
        ),
    )

    # PostgreSQL does not auto-index FKs; these carry the CASCADE deletes.
    op.create_index("ix_utility_plans_user_id", "utility_plans", ["user_id"])
    op.create_index(
        "ix_utility_plans_organization_id", "utility_plans", ["organization_id"],
    )
    op.create_index("ix_utility_plans_property_id", "utility_plans", ["property_id"])

    # Current-plan resolution: newest start per property + service.
    op.create_index(
        "ix_utility_plans_property_service_start_active",
        "utility_plans",
        ["property_id", "service_type", "service_start_date"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    # Expiring-soon sweeps, per org and across orgs.
    op.create_index(
        "ix_utility_plans_org_term_end_active",
        "utility_plans",
        ["organization_id", "term_end_date"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_utility_plans_term_end_active",
        "utility_plans",
        ["term_end_date"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_utility_plans_term_end_active", table_name="utility_plans")
    op.drop_index("ix_utility_plans_org_term_end_active", table_name="utility_plans")
    op.drop_index(
        "ix_utility_plans_property_service_start_active", table_name="utility_plans",
    )
    op.drop_index("ix_utility_plans_property_id", table_name="utility_plans")
    op.drop_index("ix_utility_plans_organization_id", table_name="utility_plans")
    op.drop_index("ix_utility_plans_user_id", table_name="utility_plans")
    op.drop_table("utility_plans")
