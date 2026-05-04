"""add sync_logs.gmail_matches_total

Lets the UI distinguish 'Gmail returned 0 matches' from 'Gmail returned
N matches that were all already processed' — both currently surface as
'0 documents added' with no further detail.

Revision ID: synfun260504
Revises: p2punlock260504
Create Date: 2026-05-04 20:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "synfun260504"
down_revision: Union[str, None] = "p2punlock260504"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "sync_logs",
        sa.Column(
            "gmail_matches_total",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("sync_logs", "gmail_matches_total")
