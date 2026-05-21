"""Add stand_clip_url + aim_clip_url to lineup

Revision ID: 0014
Revises: 0013
Create Date: 2026-05-21 04:00:00.000000

Adds two nullable columns to ``lineup`` so the PR6 stand/aim micro-clip
pipeline and the frontend StandPane / AimPane have a stable contract:

  * ``stand_clip_url`` — 1s looped clip anchored on the same chapter timestamp
    the classifier chose for ``stand_screenshot_url``. The STAND pane upgrades
    from the still to this clip when set; the still remains the poster /
    pre-load fallback so a slow MinIO presign doesn't blank the pane.
  * ``aim_clip_url`` — 1s looped clip anchored on the same chapter timestamp
    the classifier chose for ``aim_screenshot_url``. The AIM pane upgrades
    similarly; the aim anchor dot continues to overlay because the clip's
    first frame IS the aim still (same timestamp), so the existing normalized
    anchor coords stay accurate.

Both columns store a BARE MinIO object key (like the existing
``stand_screenshot_url`` / ``aim_screenshot_url`` / ``clip_url`` /
``landing_clip_url``). Presigning happens at read time in
``lineup_service._build_read``. Upload is handled by
``app.services.ingestion.micro_clip_generator`` — this migration only extends
the schema.

Additive: existing rows default to NULL. The app is fully functional without
the backfill — new ingests auto-populate, old rows keep showing the existing
stand/aim stills. The operator runs ``python -m app.cli backfill-micro-clips``
once post-deploy to populate accepted ingested lineups (idempotent).

Downgrade: drops both columns unconditionally. Data loss is expected and
acceptable on rollback — the STAND/AIM panes gracefully degrade to stills.
"""
import sqlalchemy as sa
from alembic import op


revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "lineup",
        sa.Column("stand_clip_url", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "lineup",
        sa.Column("aim_clip_url", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("lineup", "aim_clip_url")
    op.drop_column("lineup", "stand_clip_url")
