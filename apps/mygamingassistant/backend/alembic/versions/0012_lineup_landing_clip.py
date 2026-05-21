"""Add landing_clip_url to lineup

Revision ID: 0012
Revises: 0011
Create Date: 2026-05-21 00:00:00.000000

Adds a nullable ``landing_clip_url`` column to the ``lineup`` table so the
PR5 landing-clip pipeline and frontend LandingPane have a stable contract.

The column stores a bare MinIO object key exactly like ``clip_url``
(presigned to a 24-hour GET URL at read time in
``lineup_service._build_read``). Landing-clip upload is handled by
``app.services.ingestion.landing_clip_generator`` — this migration only
extends the schema.

Additive: all existing rows default to NULL. The app is fully functional
without the backfill — new ingests auto-populate, old rows simply show the
existing "Lands in: <zone>" text fallback in the LANDING pane. The
operator runs ``python -m app.cli backfill-landing-clips`` once
post-deploy to populate accepted ingested lineups (idempotent).

Downgrade: drops the column unconditionally. Data loss is expected and
acceptable on rollback — the LandingPane gracefully degrades to text.
"""
import sqlalchemy as sa
from alembic import op


revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "lineup",
        sa.Column("landing_clip_url", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("lineup", "landing_clip_url")
