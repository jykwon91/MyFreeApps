"""inquiries: replace lease_length_months with move_out_date

The public inquiry form previously asked for a duration in months
(``lease_length_months: int``); operator wants prospects to specify a
specific move-out date instead so the host can prorate billing for
short stays without mentally converting "6 months" to a date.

Migration steps:
1. Add ``move_out_date`` (nullable Date).
2. Backfill: for rows with both ``move_in_date`` and
   ``lease_length_months`` set, compute the move-out as
   ``move_in_date + interval '<n> months'``. Postgres handles month-
   boundary arithmetic correctly (March 31 + 1 month = April 30).
3. Drop the ``lease_length_months`` column and its CheckConstraint.

Forward-only — once we drop the column, the source duration is gone.
Downgrade re-creates the column nullable but cannot reconstruct it
from move_out_date - move_in_date because the original months value
may have been an integer truncation (e.g. a 45-day stay was stored
as 1 month, but our reverse arithmetic would yield ~1.5).

Revision ID: moveout260507
Revises: legtenp260507
Create Date: 2026-05-07 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "moveout260507"
down_revision: Union[str, None] = "legtenp260507"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add the new date column.
    op.add_column(
        "inquiries",
        sa.Column("move_out_date", sa.Date(), nullable=True),
    )

    # 2. Backfill from move_in_date + lease_length_months. Postgres
    # ``+ interval '<n> months'`` handles end-of-month edge cases
    # safely (May 31 + 1 month → June 30, not July 1). Casts the
    # SmallInteger to text to interpolate into the interval literal.
    op.execute(
        """
        UPDATE inquiries
        SET move_out_date = (move_in_date + (lease_length_months || ' months')::interval)::date
        WHERE move_in_date IS NOT NULL
          AND lease_length_months IS NOT NULL
        """,
    )

    # 3. Drop the old column + its CheckConstraint.
    op.drop_constraint("chk_inquiry_lease_length_months", "inquiries", type_="check")
    op.drop_column("inquiries", "lease_length_months")


def downgrade() -> None:
    op.add_column(
        "inquiries",
        sa.Column("lease_length_months", sa.SmallInteger(), nullable=True),
    )
    op.create_check_constraint(
        "chk_inquiry_lease_length_months",
        "inquiries",
        "lease_length_months IS NULL OR (lease_length_months BETWEEN 1 AND 24)",
    )
    op.drop_column("inquiries", "move_out_date")
