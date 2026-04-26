"""add_property_address_and_net_income

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-03-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('properties', sa.Column('address', sa.String(length=500), nullable=True))
    op.execute("ALTER TYPE category ADD VALUE IF NOT EXISTS 'net_income'")


def downgrade() -> None:
    op.drop_column('properties', 'address')
    # Note: PostgreSQL does not support removing enum values; net_income remains in the type
