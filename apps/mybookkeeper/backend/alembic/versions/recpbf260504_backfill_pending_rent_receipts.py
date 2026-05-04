"""backfill pending_rent_receipts for already-attributed income transactions

Until this PR, attribution_service.maybe_attribute_payment / confirm_review /
attribute_manually all set transaction.applicant_id but NEVER created a
pending_rent_receipts row, so the Receipts page was empty even when
payments had been auto-attributed. The new code wires the receipt creation
in-session for all three paths going forward; this migration retroactively
creates rows for any historical attributed transactions that don't have one.

The query is org-scoped and idempotent (NOT EXISTS guard against a real
PendingRentReceipt row for the same transaction_id). Period defaults to
the calendar month of the transaction_date — same convention as
``receipt_service._default_period`` for new attributions.

Revision ID: recpbf260504
Revises: synfun260504
Create Date: 2026-05-04 21:30:00.000000
"""
from typing import Sequence, Union

from alembic import op


revision: str = "recpbf260504"
down_revision: Union[str, None] = "synfun260504"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO pending_rent_receipts (
            id, user_id, organization_id, transaction_id, applicant_id,
            signed_lease_id, period_start_date, period_end_date, status,
            created_at, updated_at
        )
        SELECT
            gen_random_uuid(),
            t.user_id,
            t.organization_id,
            t.id,
            t.applicant_id,
            (
                SELECT sl.id FROM signed_leases sl
                 WHERE sl.applicant_id    = t.applicant_id
                   AND sl.organization_id = t.organization_id
                   AND sl.deleted_at IS NULL
                 ORDER BY sl.created_at DESC
                 LIMIT 1
            ),
            DATE_TRUNC('month', t.transaction_date)::date,
            (DATE_TRUNC('month', t.transaction_date) + INTERVAL '1 month - 1 day')::date,
            'pending',
            NOW(),
            NOW()
          FROM transactions t
         WHERE t.applicant_id IS NOT NULL
           AND t.transaction_type = 'income'
           AND t.deleted_at IS NULL
           AND NOT EXISTS (
               SELECT 1 FROM pending_rent_receipts prr
                WHERE prr.transaction_id  = t.id
                  AND prr.organization_id = t.organization_id
           );
        """
    )


def downgrade() -> None:
    # Conservative: leave backfilled rows in place. They are normal
    # pending receipts at this point and indistinguishable from rows
    # the application would have created on attribution.
    pass
