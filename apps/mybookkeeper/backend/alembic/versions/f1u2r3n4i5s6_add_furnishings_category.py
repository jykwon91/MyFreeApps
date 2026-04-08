"""add furnishings category

Revision ID: f1u2r3n4i5s6
Revises: t4u5v6w7x8y9
Create Date: 2026-03-21
"""
from alembic import op

revision = "f1u2r3n4i5s6"
down_revision = "t4u5v6w7x8y9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("chk_txn_category", "transactions", type_="check")
    op.create_check_constraint(
        "chk_txn_category",
        "transactions",
        "category IN ("
        "'rental_revenue', 'cleaning_fee_revenue', "
        "'maintenance', 'contract_work', 'cleaning_expense', 'utilities', "
        "'management_fee', 'insurance', 'mortgage_interest', 'mortgage_principal', "
        "'taxes', 'channel_fee', 'advertising', 'legal_professional', 'travel', "
        "'furnishings', 'other_expense', 'uncategorized'"
        ")",
    )


def downgrade() -> None:
    op.drop_constraint("chk_txn_category", "transactions", type_="check")
    op.create_check_constraint(
        "chk_txn_category",
        "transactions",
        "category IN ("
        "'rental_revenue', 'cleaning_fee_revenue', "
        "'maintenance', 'contract_work', 'cleaning_expense', 'utilities', "
        "'management_fee', 'insurance', 'mortgage_interest', 'mortgage_principal', "
        "'taxes', 'channel_fee', 'advertising', 'legal_professional', 'travel', "
        "'other_expense', 'uncategorized'"
        ")",
    )
