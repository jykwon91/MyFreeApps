"""give hand-entered transactions saved before #1771 their Schedule E line

Before #1771 a transaction added by hand was saved with no Schedule E line, so
it was left out of the Schedule E report and tax return totals. #1771 gives new
ones the line for their category; this fills in the ones saved before it
deployed (2026-11-07 19:16:43 UTC), using the category-to-line map as it stood
then (frozen here, so a later change to the map can't change what this did).

Only hand-entered rows with no line, created before the cutoff, whose category
has a Schedule E line, are touched. A row someone gave a line is left alone.
Unfiled tax returns of every organization with a filled row are marked for
recompute, as saving a transaction with a line does.

The downgrade does nothing: a filled line can't be told apart from one a user
set afterwards, so clearing them could erase real choices.

Revision ID: schedebf261108
Revises: intgcleanup261106
Create Date: 2026-11-08
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "schedebf261108"
down_revision: str | None = "intgcleanup261106"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_CUTOFF = "2026-11-07 19:16:43+00"

_CATEGORY_LINES = """
    (VALUES
        ('rental_revenue', 'line_3_rents_received'),
        ('cleaning_fee_revenue', 'line_3_rents_received'),
        ('advertising', 'line_5_advertising'),
        ('travel', 'line_6_auto_travel'),
        ('cleaning_expense', 'line_7_cleaning_maintenance'),
        ('maintenance', 'line_7_cleaning_maintenance'),
        ('management_fee', 'line_8_commissions'),
        ('channel_fee', 'line_8_commissions'),
        ('insurance', 'line_9_insurance'),
        ('legal_professional', 'line_10_legal_professional'),
        ('mortgage_interest', 'line_12_mortgage_interest'),
        ('contract_work', 'line_14_repairs'),
        ('taxes', 'line_16_taxes'),
        ('utilities', 'line_17_utilities'),
        ('furnishings', 'line_19_other'),
        ('other_expense', 'line_19_other')
    ) AS line_for(category, line)
"""

_BACKFILL = sa.text(
    f"""
    WITH filled AS (
        UPDATE transactions t
        SET schedule_e_line = line_for.line
        FROM {_CATEGORY_LINES}
        WHERE t.category = line_for.category
          AND t.is_manual
          AND t.schedule_e_line IS NULL
          AND t.created_at < '{_CUTOFF}'
        RETURNING t.organization_id
    ), flagged AS (
        UPDATE tax_returns r
        SET needs_recompute = true
        WHERE r.status <> 'filed'
          AND r.organization_id IN (SELECT organization_id FROM filled)
        RETURNING 1
    )
    SELECT (SELECT count(*) FROM filled), (SELECT count(*) FROM flagged)
    """
)


def upgrade() -> None:
    filled, flagged = op.get_bind().execute(_BACKFILL).one()
    print(f"schedebf261108: gave {filled} hand-entered transaction(s) a Schedule E line; flagged {flagged} unfiled return(s) for recompute")


def downgrade() -> None:
    pass  # Irreversible by design — see module docstring.
