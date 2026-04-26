"""fix_filing_status_values

Revision ID: b0f388b2ad76
Revises: j4k5l6m7n8o9
Create Date: 2026-03-22 11:12:44.839507

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b0f388b2ad76'
down_revision: Union[str, None] = 'j4k5l6m7n8o9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Widen filing_status column to fit longer IRS-standard values
    op.alter_column('tax_returns', 'filing_status', type_=sa.String(30), existing_type=sa.String(20))

    # Update existing data to new values
    op.execute(sa.text("UPDATE tax_returns SET filing_status = 'married_filing_jointly' WHERE filing_status = 'married_joint'"))
    op.execute(sa.text("UPDATE tax_returns SET filing_status = 'married_filing_separately' WHERE filing_status = 'married_separate'"))
    op.execute(sa.text("UPDATE tax_returns SET filing_status = 'qualifying_surviving_spouse' WHERE filing_status = 'qualifying_widow'"))

    # Drop and recreate check constraint with new values
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.table_constraints "
        "WHERE constraint_name = 'chk_return_filing' AND table_name = 'tax_returns'"
    ))
    if result.fetchone():
        op.drop_constraint('chk_return_filing', 'tax_returns')

    op.create_check_constraint(
        'chk_return_filing', 'tax_returns',
        "filing_status IS NULL OR filing_status IN ("
        "'single', 'married_filing_jointly', 'married_filing_separately', "
        "'head_of_household', 'qualifying_surviving_spouse'"
        ")",
    )


def downgrade() -> None:
    op.drop_constraint('chk_return_filing', 'tax_returns')
    op.create_check_constraint(
        'chk_return_filing', 'tax_returns',
        "filing_status IS NULL OR filing_status IN ("
        "'single', 'married_joint', 'married_separate', "
        "'head_of_household', 'qualifying_widow'"
        ")",
    )
    op.execute(sa.text("UPDATE tax_returns SET filing_status = 'married_joint' WHERE filing_status = 'married_filing_jointly'"))
    op.execute(sa.text("UPDATE tax_returns SET filing_status = 'married_separate' WHERE filing_status = 'married_filing_separately'"))
    op.execute(sa.text("UPDATE tax_returns SET filing_status = 'qualifying_widow' WHERE filing_status = 'qualifying_surviving_spouse'"))
    op.alter_column('tax_returns', 'filing_status', type_=sa.String(20), existing_type=sa.String(30))
