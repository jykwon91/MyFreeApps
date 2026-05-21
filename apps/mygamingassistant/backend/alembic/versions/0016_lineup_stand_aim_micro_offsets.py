"""Add stand/aim micro-clip offsets to lineup (pane-editor STAND/AIM shift)

Revision ID: 0016
Revises: 0015
Create Date: 2026-05-21 23:30:00.000000

Adds two nullable Float columns to ``lineup`` so the STAND/AIM "shift window"
editor knows where the served 1s micro-clip starts inside the shared wider
source clip (``clip_url_original``):

  * ``stand_clip_offset_s`` — seconds from the wider source's start where
    the served STAND 1s clip begins.
  * ``aim_clip_offset_s`` — same for AIM.

The window width is fixed at 1.0s (see ``micro_clip_generator._MICRO_CLIP_SECONDS``)
so a single offset per pane is sufficient — no ``*_end_s`` pair like the
throw/landing trim columns.

The wider source is REUSED from ``clip_url_original`` (the same column that
backs the throw-pane trim editor's wider source). No new ``*_url_original``
columns are added for stand/aim — both panes share the chapter's wider
source bytes. See ``apps/mygamingassistant/CLAUDE.md`` + STATE.md decision
2026-05-21 for the storage rationale (~0 GB additional MinIO vs ~4 GB if
each pane kept its own wider source).

Backfill: nothing. Legacy rows can't have the offsets reconstructed without
re-running the classifier (anchor_ts is not persisted), so legacy
``stand_clip_offset_s`` / ``aim_clip_offset_s`` stay NULL. The shift overlay
treats NULL as "open the slider at offset=0 of the wider source" — the
operator finds the right frame and the first save persists the offset.

Downgrade: drops both columns. The served ``stand_clip_url`` / ``aim_clip_url``
are unaffected.
"""
import sqlalchemy as sa
from alembic import op


revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "lineup",
        sa.Column("stand_clip_offset_s", sa.Float(), nullable=True),
    )
    op.add_column(
        "lineup",
        sa.Column("aim_clip_offset_s", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("lineup", "aim_clip_offset_s")
    op.drop_column("lineup", "stand_clip_offset_s")
