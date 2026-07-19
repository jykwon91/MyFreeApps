"""Add lineup.landing_screenshot_url (LANDING pane still)

Revision ID: 0020
Revises: 0019
Create Date: 2026-07-19 00:00:00.000000

Adds a single nullable ``landing_screenshot_url`` column to ``lineup`` — a
LANDING poster still (WebP, last frame of the LANDING micro-clip), the
counterpart to the existing ``stand_screenshot_url`` / ``aim_screenshot_url``
columns. Same shape as those two: a bare MinIO object key, presigned at read
time in ``lineup_service._build_read`` via ``_sign_screenshot_url``.

Motivation: lineups ingested from videos already have 4 micro-clips
(stand/aim/throw/landing .mp4) but the LANDING pane has no still fallback —
only STAND and AIM had one. Adding a STAND poster is a no-op column-wise
(``stand_screenshot_url`` already exists and is reused); this migration adds
only the new LANDING counterpart.

Backfill: nothing on upgrade. Existing lineups have ``landing_screenshot_url``
NULL; a follow-up backfill (poster_extractor + recut/backfill script) extracts
the LANDING poster from the existing ``landing_clip_url`` micro-clip bytes and
persists it via ``lineup_repo.set_landing_screenshot_url``. NULL gracefully
degrades to the existing "Lands in: <zone>" text fallback / live-video pane —
best-effort and orthogonal to lineup validity, same posture as
``landing_clip_url`` (see migration 0012).

Downgrade drops the column. Already-populated rows lose their poster key;
the LANDING pane falls back to its pre-existing behaviour.
"""
import sqlalchemy as sa
from alembic import op


revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "lineup",
        sa.Column("landing_screenshot_url", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("lineup", "landing_screenshot_url")
