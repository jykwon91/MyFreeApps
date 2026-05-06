"""inquiries: add current_country + current_region columns (city/state split)

Splits the public inquiry form's free-text "Current city / state" field
into a canonical (country, region) pair while keeping the existing
``current_city`` column for the city portion. New form submissions populate
the new columns. Legacy rows stay NULL.

Revision ID: inqregion260506
Revises: slugpidx260504
Create Date: 2026-05-06 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "inqregion260506"
down_revision: Union[str, None] = "slugpidx260504"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "inquiries",
        sa.Column("current_country", sa.String(length=2), nullable=True),
    )
    op.add_column(
        "inquiries",
        sa.Column("current_region", sa.String(length=100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("inquiries", "current_region")
    op.drop_column("inquiries", "current_country")
