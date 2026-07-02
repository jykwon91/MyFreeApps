"""work_history.is_current — persist the "Present" flag explicitly.

"Present" used to be derived from ``end_date IS NULL`` everywhere a work
history row was rendered. That conflates two different states: "this role
is ongoing" and "this role's end date is unknown". Claude's resume
extraction already returns an ``is_current`` flag per role, but the mapper
discarded it because there was no column to store it in — so a past role
whose end date didn't parse rendered as "Present".

Backfill sets ``is_current = TRUE`` where ``end_date IS NULL`` so existing
rows keep rendering exactly as they did before this migration; users fix
genuinely-wrong rows in the Profile UI.

The check constraint enforces the invariant that a current role cannot
also carry an end date, mirroring the extraction prompt's contract
(``ends_on`` is null for current roles).

Revision ID: iscur260702
Revises: prep260702
Create Date: 2026-07-02
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "iscur260702"
down_revision: Union[str, None] = "prep260702"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "work_history",
        sa.Column(
            "is_current",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    # Preserve pre-migration rendering: rows without an end date were
    # displayed as "Present", so they start out flagged current.
    op.execute("UPDATE work_history SET is_current = TRUE WHERE end_date IS NULL")
    op.create_check_constraint(
        "chk_work_history_current_no_end_date",
        "work_history",
        "NOT (is_current AND end_date IS NOT NULL)",
    )


def downgrade() -> None:
    op.drop_constraint(
        "chk_work_history_current_no_end_date",
        "work_history",
        type_="check",
    )
    op.drop_column("work_history", "is_current")
