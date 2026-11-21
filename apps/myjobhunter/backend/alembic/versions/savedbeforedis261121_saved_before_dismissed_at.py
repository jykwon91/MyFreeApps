"""Add ``discovered_jobs.saved_before_dismissed_at``.

Dismissing a Saved posting cleared ``saved_at`` (the state CHECK forbids both
set), so Undo / Restore dropped it into the inbox and the save was lost. The
new nullable column remembers when the posting was saved so undo can put it
back. Additive and nullable: existing rows and old code keep working.

Revision ID: savedbeforedis261121
Revises: appliedat261119
Create Date: 2026-11-21
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "savedbeforedis261121"
down_revision: Union[str, None] = "appliedat261119"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "discovered_jobs",
        sa.Column("saved_before_dismissed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("discovered_jobs", "saved_before_dismissed_at")
