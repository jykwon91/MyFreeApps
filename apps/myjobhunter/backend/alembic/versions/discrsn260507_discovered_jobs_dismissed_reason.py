"""Add ``discovered_jobs.dismissed_reason`` column.

Captures the operator's reason when they dismiss a posting. Used as a
teaching signal for future scoring iterations (Phase D) so MJH can
weight similar postings down without the operator re-typing exclusion
rules.

Phase C — coexists with Phase B's ``profiles.discovery_defaults``.

Allowed values (CHECK constraint):
    wrong_stack, too_small_company, wrong_sector, wrong_comp,
    not_remote, not_interested, other

Reversible: downgrade drops the column + constraint.

Revision ID: discrsn260507
Revises: discdef260507
Create Date: 2026-05-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "discrsn260507"
down_revision: Union[str, None] = "discdef260507"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_REASONS = (
    "wrong_stack",
    "too_small_company",
    "wrong_sector",
    "wrong_comp",
    "not_remote",
    "not_interested",
    "other",
)


def _quoted(values: tuple[str, ...]) -> str:
    return ",".join(f"'{v}'" for v in values)


def upgrade() -> None:
    op.add_column(
        "discovered_jobs",
        sa.Column("dismissed_reason", sa.String(30), nullable=True),
    )
    op.create_check_constraint(
        "chk_discovered_dismissed_reason",
        "discovered_jobs",
        f"dismissed_reason IS NULL OR dismissed_reason IN ({_quoted(_REASONS)})",
    )


def downgrade() -> None:
    op.drop_constraint(
        "chk_discovered_dismissed_reason",
        "discovered_jobs",
        type_="check",
    )
    op.drop_column("discovered_jobs", "dismissed_reason")
