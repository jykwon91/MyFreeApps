"""add last_import_error_category to channel_listings

Revision ID: chsync260508
Revises: noaut260507
Create Date: 2026-05-08 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "chsync260508"
down_revision: Union[str, None] = "noaut260507"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "channel_listings",
        sa.Column("last_import_error_category", sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("channel_listings", "last_import_error_category")
