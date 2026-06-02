"""promote already-attributed unverified transactions to approved

Revision ID: attrverify260602
Revises: payerhandle260530
Create Date: 2026-06-02

One-time data backfill paired with the attribution-verifies fix.

The dashboard sums only ``status='approved'`` transactions. Before this change,
auto-attribution (learned payer alias / exact name match / Airbnb-auto) linked a
payment to a tenant + property but never promoted its status, and the manual
attribution paths only began promoting in the prior PR. As a result, payments
that were genuinely attributed (``attribution_source IS NOT NULL``) but extracted
from a non-trusted email sender (e.g. a bank-routed Zelle alert) stayed
``unverified`` and never reached the dashboard.

This migration promotes those rows to ``approved``. It is scoped to rows that
already carry an ``attribution_source`` — i.e. the host (or the auto-pipeline)
already decided whose payment this is — so it only verifies payments an explicit
attribution had already vouched for. Pending review-queue rows (no
``attribution_source``) are untouched and still require host review.

Idempotent: re-running matches nothing once the rows are approved. Engine-
agnostic SQL so it behaves identically on SQLite (tests) and PostgreSQL (prod).
"""
from typing import Sequence, Union

from alembic import op

revision: str = "attrverify260602"
down_revision: Union[str, None] = "payerhandle260530"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE transactions SET status = 'approved' "
        "WHERE status = 'unverified' "
        "AND attribution_source IS NOT NULL "
        "AND deleted_at IS NULL"
    )


def downgrade() -> None:
    # No-op: this is a forward-only data correction. The set of rows promoted
    # here is indistinguishable after the fact from rows that were always
    # approved, so reverting would wrongly re-hide legitimately attributed
    # payments from the dashboard.
    pass
