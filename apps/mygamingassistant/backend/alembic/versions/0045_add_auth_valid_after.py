"""Add users.auth_valid_after, the cutoff for tokens issued before a password change

Revision ID: 0045
Revises: 0044
Create Date: 2026-11-03 00:00:00.000000

NULL means no cutoff, so nobody is signed out by this migration. Don't backfill it.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0045"
down_revision: Union[str, None] = "0044"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user", sa.Column("auth_valid_after", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("user", "auth_valid_after")
