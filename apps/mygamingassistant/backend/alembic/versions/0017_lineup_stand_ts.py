"""Add lineup.stand_ts + lineup.stand_localized_at for the STAND-localizer

Revision ID: 0017
Revises: 0016
Create Date: 2026-05-23 19:00:00.000000

Adds two nullable columns to ``lineup`` so the STAND micro-clip can be
anchored on a content-aware timestamp instead of a fixed
``release_ts − constant`` heuristic. The earlier heuristic could not
generalize across tutorial styles — see project_mga_plan.md /
operator pushback 2026-05-23 ("the stand and the throw are nearly
identical"). The STAND-localizer is a separate Claude code path
(``classification/stand_timing_classifier.py`` +
``ingestion/stand_localizer.py``) that finds the frame the narrator
DEMONSTRATES where to stand — composition-emphasis cue, not
player-stationary cue.

  * ``stand_ts`` — seconds-into-source-video of the localized STAND
    demonstration frame. NULL when the localizer has not yet run for
    this lineup, OR when ``stand_localized_at`` is set and the
    localizer confidently judged no stand-demo exists in the chapter.
  * ``stand_localized_at`` — when the localizer last ran for this
    lineup. NULL = never tried; set = tried (``stand_ts`` carries the
    verdict — float for a demo, NULL for "no demo found"). The
    backfill loop uses this to avoid re-burning Claude on confirmed-
    no-demo lineups.

Backfill: nothing on upgrade. Existing accepted lineups have both
columns NULL; the next run of ``backfill-micro-clips`` localizes them
and persists the result.

Downgrade: drops both columns. The served ``stand_clip_url`` is
unaffected (already populated rows keep their clip; future re-cuts
would fall back to whatever anchor the generator uses by then).
"""
import sqlalchemy as sa
from alembic import op


revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "lineup",
        sa.Column("stand_ts", sa.Float(), nullable=True),
    )
    op.add_column(
        "lineup",
        sa.Column(
            "stand_localized_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("lineup", "stand_localized_at")
    op.drop_column("lineup", "stand_ts")
