"""wow_price_feed: record "Refresh now" clicks for the scheduler to carry out

Revision ID: 0060
Revises: 0059
Create Date: 2026-11-20 00:00:00.000000

WHY. "Refresh now" used to download and parse Blizzard's auction data inside the
API process; the kernel OOM-killed the API doing it. The API now only records the
click and the scheduler process does the refresh, so the click has to be stored:

* ``refresh_requested_at`` — the ``checked_at`` stamp the click claimed; NULL once
  the scheduler has dealt with it.
* ``refresh_previous_checked_at`` — the stamp it replaced, so a refresh that
  stored nothing can hand the cooldown back.

Additive and nullable: existing rows start with no pending click.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0060"
down_revision: Union[str, None] = "0059"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("wow_price_feed", sa.Column("refresh_requested_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "wow_price_feed", sa.Column("refresh_previous_checked_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("wow_price_feed", "refresh_previous_checked_at")
    op.drop_column("wow_price_feed", "refresh_requested_at")
