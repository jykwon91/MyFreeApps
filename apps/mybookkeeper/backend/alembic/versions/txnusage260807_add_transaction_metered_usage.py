"""add metered usage to transactions

A utility bill's dollar amount cannot be compared across months, or against a
contracted c/kWh rate, without the quantity it was charged on. Recording the
metered consumption is what turns a headline EFL rate into a verifiable blended
one — the 13.9 c/kWh headline on the Peerless St plans is a real 15.93 c/kWh
once actual usage is divided into actual spend.

The service period is stored separately from transaction_date because utility
periods routinely straddle two calendar months, so aggregating consumption by
the statement date misattributes it.

Revision ID: txnusage260807
Revises: utilplan260807
Create Date: 2026-08-07
"""
from alembic import op
import sqlalchemy as sa

# Spelled out rather than imported from app.core.utility_usage_constants on
# purpose: a migration is a historical record. If the unit vocabulary grows
# later that is a new migration, and this one must keep producing the
# constraint it originally produced.
_USAGE_UNIT_IN = "'ccf', 'gallon', 'kgal', 'kwh', 'mcf', 'therm'"

revision = "txnusage260807"
down_revision = "utilplan260807"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("usage_quantity", sa.Numeric(12, 3), nullable=True))
    op.add_column("transactions", sa.Column("usage_unit", sa.String(10), nullable=True))
    op.add_column("transactions", sa.Column("service_period_start", sa.Date(), nullable=True))
    op.add_column("transactions", sa.Column("service_period_end", sa.Date(), nullable=True))

    op.create_check_constraint(
        "chk_txn_usage_unit",
        "transactions",
        f"usage_unit IS NULL OR usage_unit IN ({_USAGE_UNIT_IN})",
    )
    # A quantity with no unit cannot be compared to anything, and a unit with no
    # quantity carries no information — reject either half alone.
    op.create_check_constraint(
        "chk_txn_usage_paired",
        "transactions",
        "(usage_quantity IS NULL) = (usage_unit IS NULL)",
    )
    # >= 0, not > 0: a vacant month legitimately bills 0 kWh against the base
    # charge, and rejecting it would drop valid data.
    op.create_check_constraint(
        "chk_txn_usage_non_negative",
        "transactions",
        "usage_quantity IS NULL OR usage_quantity >= 0",
    )
    # Half a period cannot bucket anything, so the boundaries pair the same way
    # the quantity and its unit do.
    op.create_check_constraint(
        "chk_txn_service_period_paired",
        "transactions",
        "(service_period_start IS NULL) = (service_period_end IS NULL)",
    )
    op.create_check_constraint(
        "chk_txn_service_period_order",
        "transactions",
        "service_period_start IS NULL OR service_period_end >= service_period_start",
    )


def downgrade() -> None:
    op.drop_constraint("chk_txn_service_period_order", "transactions", type_="check")
    op.drop_constraint("chk_txn_service_period_paired", "transactions", type_="check")
    op.drop_constraint("chk_txn_usage_non_negative", "transactions", type_="check")
    op.drop_constraint("chk_txn_usage_paired", "transactions", type_="check")
    op.drop_constraint("chk_txn_usage_unit", "transactions", type_="check")

    op.drop_column("transactions", "service_period_end")
    op.drop_column("transactions", "service_period_start")
    op.drop_column("transactions", "usage_unit")
    op.drop_column("transactions", "usage_quantity")
