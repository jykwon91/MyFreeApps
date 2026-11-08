"""Add wow_server_status_sample — WoW Forever server status history

Revision ID: 0050
Revises: 0049
Create Date: 2026-11-07 00:00:00.000000

WHY. The server status page shows uptime timelines, recent outages and "up
for X" per ruleset. A scheduled job (``record_wow_server_status``) asks
Blizzard every few minutes and stores a row when a ruleset's status changes,
plus an hourly checkpoint so a quiet stretch reads "up" and not "no data".
Rows older than 90 days are purged daily. See
``app/models/wow/server_status_sample.py``. Starts empty.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0050"
down_revision: Union[str, None] = "0049"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Frozen copies of app/core/wow_server_status.py's lists, as SQL.
_REGIONS = "('us', 'eu', 'kr', 'tw')"
_STATUSES = "('up', 'down')"


def upgrade() -> None:
    op.create_table(
        "wow_server_status_sample",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("region", sa.String(length=4), nullable=False),
        sa.Column("ruleset", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=8), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(f"region IN {_REGIONS}", name="ck_wowserverstatussample_region"),
        sa.CheckConstraint(f"status IN {_STATUSES}", name="ck_wowserverstatussample_status"),
    )
    op.create_index(
        "ix_wowserverstatussample_region_ruleset_observed",
        "wow_server_status_sample",
        ["region", "ruleset", "observed_at"],
    )
    op.create_index("ix_wowserverstatussample_observed_at", "wow_server_status_sample", ["observed_at"])


def downgrade() -> None:
    op.drop_index("ix_wowserverstatussample_observed_at", table_name="wow_server_status_sample")
    op.drop_index("ix_wowserverstatussample_region_ruleset_observed", table_name="wow_server_status_sample")
    op.drop_table("wow_server_status_sample")
