"""clamp pending rent receipt periods to the tenant's lease term

Until this PR the receipt period defaulted to the whole calendar month of
the transaction date and never consulted the lease, so a payment made in a
move-in or move-out month produced a receipt overstating the coverage — a
tenant whose term ended Aug 9 got "Aug 1 – Aug 31".

The service now clips the default to the lease term. This migration applies
the same clipping to receipts already sitting in the queue.

Deliberately narrow. It only touches rows that are:
  - still ``pending`` (never sent, so no PDF has gone out with these dates)
  - still holding the *exact* untouched calendar-month default, so a host
    who already edited the period in the dialog keeps their edit
  - covered by a lease whose term actually clips the month

Revision ID: rcptclamp260809
Revises: txnusage260807
Create Date: 2026-08-09 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op


revision: str = "rcptclamp260809"
down_revision: Union[str, None] = "txnusage260807"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE pending_rent_receipts prr
           SET period_start_date = GREATEST(prr.period_start_date, sl.starts_on),
               period_end_date   = LEAST(prr.period_end_date, sl.ends_on),
               updated_at        = NOW()
          FROM transactions t
          JOIN LATERAL (
                SELECT s.starts_on, s.ends_on
                  FROM signed_leases s
                 WHERE s.applicant_id    = t.applicant_id
                   AND s.organization_id = t.organization_id
                   AND s.deleted_at IS NULL
                   AND s.starts_on IS NOT NULL
                   AND s.ends_on   IS NOT NULL
                   AND s.starts_on <= t.transaction_date
                   AND s.ends_on   >= t.transaction_date
                 ORDER BY s.created_at DESC
                 LIMIT 1
               ) sl ON TRUE
         WHERE prr.transaction_id = t.id
           AND prr.status = 'pending'
           AND prr.deleted_at IS NULL
           -- Only rows still holding the untouched calendar-month default.
           AND prr.period_start_date = DATE_TRUNC('month', t.transaction_date)::date
           AND prr.period_end_date =
               (DATE_TRUNC('month', t.transaction_date)
                + INTERVAL '1 month - 1 day')::date
           -- Only when the term genuinely clips the month.
           AND (sl.starts_on > prr.period_start_date
                OR sl.ends_on < prr.period_end_date)
           -- Never write an inverted range.
           AND GREATEST(prr.period_start_date, sl.starts_on)
               <= LEAST(prr.period_end_date, sl.ends_on);
        """
    )


def downgrade() -> None:
    # Conservative: leave the clamped periods in place. Re-widening them to
    # the calendar month is indistinguishable from clobbering a host's own
    # edit, and the clamped values are the correct ones either way.
    pass
