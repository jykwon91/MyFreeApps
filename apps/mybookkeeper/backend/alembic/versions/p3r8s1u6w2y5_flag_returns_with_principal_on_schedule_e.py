"""Flag unfiled tax returns that may still include mortgage principal.

Changing a category used to leave the old Schedule E line behind, so a
transaction moved from mortgage interest to principal stayed on line 12 and was
deducted. Schedule E now skips principal whatever line a row carries, but saved
returns keep their old figures until they are recomputed.

The lines themselves are left alone: a row can be real interest that was moved
to principal by mistake, and its line is the only sign of that. Filed returns
are not flagged.

Revision ID: p3r8s1u6w2y5
Revises: k7m2p9q4t1v8
"""
from alembic import op

revision = "p3r8s1u6w2y5"
down_revision = "k7m2p9q4t1v8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE tax_returns AS tr SET needs_recompute = true
        WHERE tr.status <> 'filed'
          AND EXISTS (
            SELECT 1 FROM transactions AS t
            WHERE t.organization_id = tr.organization_id
              AND t.tax_year = tr.tax_year
              AND t.category = 'mortgage_principal'
              AND t.schedule_e_line IS NOT NULL
              AND t.deleted_at IS NULL
          )
        """
    )


def downgrade() -> None:
    """Asking for a recompute changes nothing that needs undoing."""
