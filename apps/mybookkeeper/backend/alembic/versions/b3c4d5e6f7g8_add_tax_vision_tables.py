"""add tax vision tables: cost_basis_lots, estimated_tax_payments, tax_carryforwards + jurisdiction

Revision ID: b3c4d5e6f7g8
Revises: a2b3c4d5e6f7
Create Date: 2026-03-29 19:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = 'b3c4d5e6f7g8'
down_revision: Union[str, None] = 'a2b3c4d5e6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- 1. Add jurisdiction to tax_returns ---
    op.add_column("tax_returns", sa.Column("jurisdiction", sa.String(50), nullable=False, server_default="federal"))

    # Replace old unique constraint with new one including jurisdiction
    op.drop_constraint("uq_return_org_year", "tax_returns", type_="unique")
    op.create_unique_constraint(
        "uq_return_org_year_jur", "tax_returns",
        ["organization_id", "tax_year", "jurisdiction"],
    )

    # --- 2. Create cost_basis_lots ---
    op.create_table(
        "cost_basis_lots",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("extraction_id", UUID(as_uuid=True), sa.ForeignKey("extractions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("asset_name", sa.String(255), nullable=False),
        sa.Column("asset_type", sa.String(50), nullable=False),
        sa.Column("ticker", sa.String(20), nullable=True),
        sa.Column("shares", sa.Numeric(18, 8), nullable=False),
        sa.Column("cost_basis", sa.Numeric(12, 2), nullable=False),
        sa.Column("acquisition_date", sa.Date, nullable=False),
        sa.Column("sale_date", sa.Date, nullable=True),
        sa.Column("proceeds", sa.Numeric(12, 2), nullable=True),
        sa.Column("gain_loss", sa.Numeric(12, 2), nullable=True),
        sa.Column("tax_year", sa.SmallInteger, nullable=False),
        sa.Column("holding_period", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_check_constraint("chk_lot_cost_basis", "cost_basis_lots", "cost_basis >= 0")
    op.create_check_constraint("chk_lot_shares_positive", "cost_basis_lots", "shares > 0")
    op.create_check_constraint(
        "chk_lot_asset_type", "cost_basis_lots",
        "asset_type IN ('stock', 'etf', 'mutual_fund', 'crypto', 'bond', 'option', 'other')",
    )
    op.create_check_constraint(
        "chk_lot_holding_period", "cost_basis_lots",
        "holding_period IS NULL OR holding_period IN ('short_term', 'long_term')",
    )
    op.create_check_constraint("chk_lot_tax_year", "cost_basis_lots", "tax_year >= 2020 AND tax_year <= 2099")
    op.create_index("ix_lot_org_year", "cost_basis_lots", ["organization_id", "tax_year"], postgresql_where=sa.text("sale_date IS NOT NULL"))
    op.create_index("ix_lot_org_asset", "cost_basis_lots", ["organization_id", "asset_name"])

    # --- 3. Create estimated_tax_payments ---
    op.create_table(
        "estimated_tax_payments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("transaction_id", UUID(as_uuid=True), sa.ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("tax_year", sa.SmallInteger, nullable=False),
        sa.Column("quarter", sa.SmallInteger, nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("payment_date", sa.Date, nullable=False),
        sa.Column("jurisdiction", sa.String(50), nullable=False, server_default="federal"),
        sa.Column("payment_method", sa.String(50), nullable=True),
        sa.Column("confirmation_number", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_check_constraint("chk_est_payment_amount", "estimated_tax_payments", "amount > 0")
    op.create_check_constraint("chk_est_payment_quarter", "estimated_tax_payments", "quarter >= 1 AND quarter <= 4")
    op.create_check_constraint("chk_est_payment_year", "estimated_tax_payments", "tax_year >= 2020 AND tax_year <= 2099")
    op.create_unique_constraint(
        "uq_est_payment_org_year_qtr_jur", "estimated_tax_payments",
        ["organization_id", "tax_year", "quarter", "jurisdiction"],
    )
    op.create_index("ix_est_payment_org_year", "estimated_tax_payments", ["organization_id", "tax_year"])

    # --- 4. Create tax_carryforwards ---
    op.create_table(
        "tax_carryforwards",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tax_return_id", UUID(as_uuid=True), sa.ForeignKey("tax_returns.id", ondelete="SET NULL"), nullable=True),
        sa.Column("carryforward_type", sa.String(50), nullable=False),
        sa.Column("from_year", sa.SmallInteger, nullable=False),
        sa.Column("to_year", sa.SmallInteger, nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("amount_used", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("remaining", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_check_constraint("chk_carry_amount", "tax_carryforwards", "amount >= 0")
    op.create_check_constraint("chk_carry_used", "tax_carryforwards", "amount_used >= 0")
    op.create_check_constraint("chk_carry_remaining", "tax_carryforwards", "remaining >= 0")
    op.create_check_constraint(
        "chk_carry_type", "tax_carryforwards",
        "carryforward_type IN ('capital_loss', 'passive_activity_loss', 'net_operating_loss', 'charitable_contribution')",
    )
    op.create_check_constraint("chk_carry_from_year", "tax_carryforwards", "from_year >= 2020 AND from_year <= 2099")
    op.create_check_constraint("chk_carry_to_year", "tax_carryforwards", "to_year >= 2020 AND to_year <= 2099 AND to_year > from_year")
    op.create_unique_constraint(
        "uq_carry_org_type_years", "tax_carryforwards",
        ["organization_id", "carryforward_type", "from_year", "to_year"],
    )
    op.create_index("ix_carry_org_to_year", "tax_carryforwards", ["organization_id", "to_year"])


def downgrade() -> None:
    op.drop_table("tax_carryforwards")
    op.drop_table("estimated_tax_payments")
    op.drop_table("cost_basis_lots")

    # Restore old unique constraint
    op.drop_constraint("uq_return_org_year_jur", "tax_returns", type_="unique")
    op.create_unique_constraint("uq_return_org_year", "tax_returns", ["organization_id", "tax_year"])
    op.drop_column("tax_returns", "jurisdiction")
