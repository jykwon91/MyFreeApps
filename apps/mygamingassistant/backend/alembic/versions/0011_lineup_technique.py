"""Add technique to lineup

Revision ID: 0011
Revises: 0010
Create Date: 2026-05-18 00:00:03.000000

Adds a nullable ``technique`` column to the ``lineup`` table — the compact
throw-mechanic phrase ("Jumpthrow + LMB", "E + 2-charge + 1-bounce") rendered
in the glance-board tile footer (PR3).

Open-vocabulary display text, NOT a closed enum, so NO CheckConstraint — same
posture as ``notes`` and ``chapter_title``. Deliberately NOT included in
``ck_lineup_accepted_classified``: manual uploads have no source video and are
accepted with ``technique`` NULL, so a constraint would be unsatisfiable.

Additive: all existing rows default to NULL. No backfill in the migration —
the operator runs ``python -m app.cli backfill-technique`` once post-deploy to
populate accepted ingested lineups (idempotent; see the PR's operational
migration note). The app is fully functional without the backfill — new
ingests auto-populate and old rows simply show no technique footer.

Downgrade: drops the column unconditionally. Data loss is expected and
acceptable on rollback.
"""
import sqlalchemy as sa
from alembic import op


revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("lineup", sa.Column("technique", sa.String(length=80), nullable=True))


def downgrade() -> None:
    op.drop_column("lineup", "technique")
