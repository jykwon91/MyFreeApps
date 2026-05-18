"""Add clip_url to lineup

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-17 00:00:02.000000

Adds a nullable ``clip_url`` column to the ``lineup`` table so the clip
pipeline (separate task) and frontend can depend on a stable contract.

The column stores a bare MinIO object key exactly like ``stand_screenshot_url``
and ``aim_screenshot_url`` — presigning to a 24-hour GET URL happens at read
time in ``lineup_service._build_read``. Clip upload is handled by a future
pipeline task; this migration only extends the schema.

Additive: all existing rows default to NULL. No backfill needed.

Downgrade: drops the column unconditionally. Data loss is expected and
acceptable on rollback — no clip keys will exist in the column before the
clip pipeline ships.
"""
import sqlalchemy as sa
from alembic import op


revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("lineup", sa.Column("clip_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("lineup", "clip_url")
