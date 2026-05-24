"""Add lineup.aim_ts + lineup.aim_localized_at for the AIM-localizer

Revision ID: 0018
Revises: 0017
Create Date: 2026-05-24 16:30:00.000000

Adds two nullable columns to ``lineup`` so the AIM micro-clip can be
anchored on a content-aware timestamp instead of the fixed
``release_ts − _AIM_PRE_RELEASE_SECONDS`` heuristic. Same shape as the
STAND-localizer added in 0017 — operator pushback 2026-05-24: the AIM
clip was showing the END of the throw animation because
``[release − 0.8, release + 0.2]`` straddles the release frame, and the
heuristic shape (fixed pre-release offset) cannot generalise across
utilities whose windups vary in length (HE ~0.4s vs Molotov ~0.9s).

The AIM-localizer is a separate Claude code path
(``classification/aim_timing_classifier.py`` +
``ingestion/aim_localizer.py``) that finds the frame demonstrating the
LOCKED AIM — looking at target, utility ready in hand, before any
windup motion begins.

  * ``aim_ts`` — seconds-into-source-video of the localized AIM
    demonstration frame. NULL when the localizer has not yet run for
    this lineup, OR when ``aim_localized_at`` is set and the localizer
    confidently judged no aim-demo exists in the chapter.
  * ``aim_localized_at`` — when the localizer last ran for this
    lineup. NULL = never tried; set = tried (``aim_ts`` carries the
    verdict — float for a demo, NULL for "no demo found"). The
    backfill loop uses this to avoid re-burning Claude on confirmed-
    no-demo lineups.

Backfill: nothing on upgrade. Existing accepted lineups have both
columns NULL; the next run of ``backfill-micro-clips`` localizes them
and persists the result.

Downgrade: drops both columns. The served ``aim_clip_url`` is
unaffected (already populated rows keep their clip; future re-cuts
would fall back to whatever anchor the generator uses by then).
"""
import sqlalchemy as sa
from alembic import op


revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "lineup",
        sa.Column("aim_ts", sa.Float(), nullable=True),
    )
    op.add_column(
        "lineup",
        sa.Column(
            "aim_localized_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("lineup", "aim_localized_at")
    op.drop_column("lineup", "aim_ts")
