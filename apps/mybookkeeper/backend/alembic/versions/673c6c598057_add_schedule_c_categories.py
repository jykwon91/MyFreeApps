"""add_schedule_c_categories

Revision ID: 673c6c598057
Revises: b7095fb113a8
Create Date: 2026-03-22 10:28:06.813269

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '673c6c598057'
down_revision: Union[str, None] = 'b7095fb113a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OLD_CATEGORIES = (
    "'rental_revenue', 'cleaning_fee_revenue', "
    "'maintenance', 'contract_work', 'cleaning_expense', 'utilities', "
    "'management_fee', 'insurance', 'mortgage_interest', 'mortgage_principal', "
    "'taxes', 'channel_fee', 'advertising', 'legal_professional', 'travel', "
    "'furnishings', 'other_expense', 'uncategorized', 'security_deposit'"
)

NEW_CATEGORIES = (
    "'rental_revenue', 'cleaning_fee_revenue', 'business_income', "
    "'maintenance', 'contract_work', 'cleaning_expense', 'utilities', "
    "'management_fee', 'insurance', 'mortgage_interest', 'mortgage_principal', "
    "'taxes', 'channel_fee', 'advertising', 'legal_professional', 'travel', "
    "'furnishings', 'other_expense', 'uncategorized', 'security_deposit', "
    "'supplies', 'home_office', 'meals', 'vehicle_expenses', "
    "'health_insurance', 'education_training'"
)

OLD_TYPE_CATEGORY = (
    "(transaction_type = 'income' AND category IN ("
    "'rental_revenue', 'cleaning_fee_revenue', 'uncategorized', 'security_deposit'"
    ")) OR "
    "(transaction_type = 'expense' AND category NOT IN ("
    "'rental_revenue', 'cleaning_fee_revenue', 'security_deposit'"
    "))"
)

NEW_TYPE_CATEGORY = (
    "(transaction_type = 'income' AND category IN ("
    "'rental_revenue', 'cleaning_fee_revenue', 'business_income', "
    "'uncategorized', 'security_deposit'"
    ")) OR "
    "(transaction_type = 'expense' AND category NOT IN ("
    "'rental_revenue', 'cleaning_fee_revenue', 'business_income', 'security_deposit'"
    "))"
)


def upgrade() -> None:
    op.drop_constraint("chk_txn_category", "transactions", type_="check")
    op.create_check_constraint(
        "chk_txn_category",
        "transactions",
        f"category IN ({NEW_CATEGORIES})",
    )

    op.drop_constraint("chk_txn_type_category", "transactions", type_="check")
    op.create_check_constraint(
        "chk_txn_type_category",
        "transactions",
        NEW_TYPE_CATEGORY,
    )


def downgrade() -> None:
    op.drop_constraint("chk_txn_type_category", "transactions", type_="check")
    op.create_check_constraint(
        "chk_txn_type_category",
        "transactions",
        OLD_TYPE_CATEGORY,
    )

    op.drop_constraint("chk_txn_category", "transactions", type_="check")
    op.create_check_constraint(
        "chk_txn_category",
        "transactions",
        f"category IN ({OLD_CATEGORIES})",
    )
