"""add premium + deductible shape to insurance_policies

``insurance_policies`` recorded what a policy *covers* and when it lapses, but
never what it costs. Coverage without premium answers "am I insured" and cannot
answer "am I overpaying" — the same gap ``utility_plans`` had before a rate
column existed, and the reason no comparison against the market was possible.

Premium is stored with its billing period rather than pre-annualised. Carriers
quote the identical policy at $1,240/year or $112/month depending on the payment
plan, and normalising on the way in would throw away what the declarations page
actually says, leaving the stored figure impossible to reconcile against the
document it came from.

Deductible is split in two because Texas splits it in two: a flat all-perils
amount, plus wind/hail written as a percentage of dwelling coverage. On a Gulf
coast policy the percentage is the larger exposure, and it cannot be folded into
the dollar column without inventing a figure that stops being true the moment
the coverage amount changes.

Revision ID: inspremium260812
Revises: mktbench260811
Create Date: 2026-08-12
"""
from alembic import op
import sqlalchemy as sa

revision = "inspremium260812"
down_revision = "mktbench260811"
branch_labels = None
depends_on = None

# Mirrors app.core.insurance_enums.PREMIUM_FREQUENCIES. Spelled out rather than
# imported so the migration keeps describing the schema as it was at this
# revision even after the constant later gains a value.
_PREMIUM_FREQUENCIES = ("annual", "monthly", "quarterly", "semiannual")
_PREMIUM_FREQUENCY_IN = ", ".join(f"'{v}'" for v in _PREMIUM_FREQUENCIES)


def upgrade() -> None:
    op.add_column(
        "insurance_policies",
        sa.Column("premium_cents", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "insurance_policies",
        sa.Column("premium_frequency", sa.String(length=12), nullable=True),
    )
    op.add_column(
        "insurance_policies",
        sa.Column("deductible_cents", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "insurance_policies",
        sa.Column("wind_hail_deductible_pct", sa.Numeric(5, 2), nullable=True),
    )

    op.create_check_constraint(
        "chk_insurance_policy_premium_frequency",
        "insurance_policies",
        f"premium_frequency IS NULL"
        f" OR premium_frequency IN ({_PREMIUM_FREQUENCY_IN})",
    )
    # Amount and period travel together or not at all — an amount without a
    # period cannot be annualised, and a period without an amount describes
    # nothing.
    op.create_check_constraint(
        "chk_insurance_policy_premium_pair",
        "insurance_policies",
        "(premium_cents IS NULL) = (premium_frequency IS NULL)",
    )
    # Zero premium means "not recorded", which is what NULL is for. Zero
    # deductible is a real product, so only the premium is barred from zero.
    op.create_check_constraint(
        "chk_insurance_policy_amounts_valid",
        "insurance_policies",
        "(premium_cents IS NULL OR premium_cents > 0)"
        " AND (deductible_cents IS NULL OR deductible_cents >= 0)",
    )
    op.create_check_constraint(
        "chk_insurance_policy_wind_hail_pct_range",
        "insurance_policies",
        "wind_hail_deductible_pct IS NULL"
        " OR (wind_hail_deductible_pct > 0 AND wind_hail_deductible_pct <= 100)",
    )


def downgrade() -> None:
    op.drop_constraint(
        "chk_insurance_policy_wind_hail_pct_range",
        "insurance_policies",
        type_="check",
    )
    op.drop_constraint(
        "chk_insurance_policy_amounts_valid", "insurance_policies", type_="check",
    )
    op.drop_constraint(
        "chk_insurance_policy_premium_pair", "insurance_policies", type_="check",
    )
    op.drop_constraint(
        "chk_insurance_policy_premium_frequency", "insurance_policies", type_="check",
    )
    op.drop_column("insurance_policies", "wind_hail_deductible_pct")
    op.drop_column("insurance_policies", "deductible_cents")
    op.drop_column("insurance_policies", "premium_frequency")
    op.drop_column("insurance_policies", "premium_cents")
