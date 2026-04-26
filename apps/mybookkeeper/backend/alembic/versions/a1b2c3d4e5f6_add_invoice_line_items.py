"""add_invoice_line_items

Revision ID: a1b2c3d4e5f6
Revises: 34644601c086
Create Date: 2026-03-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '34644601c086'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('invoices', sa.Column('line_items', JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column('invoices', 'line_items')
