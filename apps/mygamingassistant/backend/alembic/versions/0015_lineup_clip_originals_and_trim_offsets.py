"""Add clip *_original keys + trim offsets to lineup (pane-editor PR4)

Revision ID: 0015
Revises: 0014
Create Date: 2026-05-21 14:30:00.000000

Adds six nullable columns to ``lineup`` so the per-pane Trim editor can cut
from a preserved source clip on every Apply, allowing the operator to widen
the trim window past whatever the previous trim left behind:

  * ``clip_url_original`` + ``landing_clip_url_original`` — bare MinIO key
    for the un-trimmed source on each trimmable pane (THROW / LANDING).
  * ``clip_trim_start_s``  + ``clip_trim_end_s``  — current trim window
    inside ``clip_url_original`` (NULL = pane is untrimmed; serve the full
    original).
  * ``landing_clip_trim_start_s`` + ``landing_clip_trim_end_s`` — same for
    LANDING.

Replace + ingest write both ``clip_url`` AND ``clip_url_original`` to the
new key (and NULL out the offset pair — a fresh upload starts untrimmed).
Trim writes only ``clip_url`` + the offsets — ``*_original`` is preserved
so the next trim can again start from the full source. See
``services/game/pane_trim_service.py`` and ``repositories/game/lineup_repo``.

Backfill: every existing row with a non-NULL clip column gets
``*_original := *_url`` so the editor opens with valid bounds (= the
current clip's duration). The trim offset pair stays NULL — historical
trims pre-PR4 have no recoverable source, so we honestly admit "we don't
know where in the original this came from" and let the operator re-trim
from full when they next open the editor.

Downgrade: drops all six columns unconditionally. Trims made post-PR4 lose
the operator's ability to widen past the bound; the trimmed ``clip_url``
itself is unaffected.
"""
import sqlalchemy as sa
from alembic import op


revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "lineup",
        sa.Column("clip_url_original", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "lineup",
        sa.Column("clip_trim_start_s", sa.Float(), nullable=True),
    )
    op.add_column(
        "lineup",
        sa.Column("clip_trim_end_s", sa.Float(), nullable=True),
    )
    op.add_column(
        "lineup",
        sa.Column("landing_clip_url_original", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "lineup",
        sa.Column("landing_clip_trim_start_s", sa.Float(), nullable=True),
    )
    op.add_column(
        "lineup",
        sa.Column("landing_clip_trim_end_s", sa.Float(), nullable=True),
    )

    # Backfill — existing rows treat the current clip AS the original. The
    # offset pair stays NULL (the editor reads NULL as "untrimmed" and opens
    # with thumbs at [0, original_duration], which is the most faithful
    # representation we can offer for a row whose trim history pre-dates PR4).
    op.execute(
        "UPDATE lineup "
        "SET clip_url_original = clip_url "
        "WHERE clip_url IS NOT NULL AND clip_url_original IS NULL"
    )
    op.execute(
        "UPDATE lineup "
        "SET landing_clip_url_original = landing_clip_url "
        "WHERE landing_clip_url IS NOT NULL AND landing_clip_url_original IS NULL"
    )


def downgrade() -> None:
    op.drop_column("lineup", "landing_clip_trim_end_s")
    op.drop_column("lineup", "landing_clip_trim_start_s")
    op.drop_column("lineup", "landing_clip_url_original")
    op.drop_column("lineup", "clip_trim_end_s")
    op.drop_column("lineup", "clip_trim_start_s")
    op.drop_column("lineup", "clip_url_original")
