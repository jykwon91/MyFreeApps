"""Add user.totp_last_used_step, so a two-factor code works only once

Revision ID: 0046
Revises: 0045
Create Date: 2026-11-03 00:00:00.000000

NULL means no code has been spent, so every enrolled authenticator keeps working.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0046"
down_revision: Union[str, None] = "0045"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user", sa.Column("totp_last_used_step", sa.BigInteger(), nullable=True))


def downgrade() -> None:
    op.drop_column("user", "totp_last_used_step")
