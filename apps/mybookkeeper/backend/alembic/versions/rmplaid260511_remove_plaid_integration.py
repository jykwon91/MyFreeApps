"""Remove Plaid integration — drop ``plaid_items`` + ``plaid_accounts`` tables.

Operator decided 2026-05-11 to remove Plaid entirely from MBK; the router
was already disabled in earlier PRs and the code/dependencies are now
gone. This migration completes the removal by dropping the two tables
and clearing any remaining Plaid rows from the shared ``integrations``
table.

**This migration is intentionally irreversible.** The downgrade is a
no-op stub — re-introducing Plaid would mean re-deriving the schema and
re-implementing the integration from scratch. The original tables were
created in revision ``p1a2d3i4n5t6`` (2026-03-19); their definitions
remain in version control for archaeological reference.

What stays:

- The ``integrations`` table itself (Gmail and any future provider use it).
- ``transactions.external_id`` / ``transactions.external_source`` /
  ``transactions.is_pending`` — these were added alongside the original
  Plaid migration but are generic external-source columns and remain
  useful for future imports (e.g. bank CSV). Past Plaid-imported
  transaction rows are preserved as-is; the ``external_source='plaid'``
  marker becomes informational only.
- ``auth_events`` / ``audit_logs`` rows referencing past Plaid usage —
  per the project's audit-log preservation policy, history is never
  rewritten.

Revision ID: rmplaid260511
Revises: dropce260510
Create Date: 2026-05-11 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = "rmplaid260511"
down_revision: Union[str, None] = "dropce260510"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Order matters: drop the FK-referencing child first.
    op.drop_table("plaid_accounts")
    op.drop_table("plaid_items")
    # Clear any leftover Plaid rows from the shared integrations table.
    # Gmail rows (provider='gmail') are untouched.
    op.execute("DELETE FROM integrations WHERE provider = 'plaid'")


def downgrade() -> None:
    # Irreversible by design — see module docstring.
    pass
