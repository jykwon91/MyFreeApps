"""Add auto-email-tenant columns to signed_leases.

Two new columns drive the "automatically email the rendered lease to the
tenant on first generate" behaviour:

* ``auto_email_tenant`` (BOOLEAN NOT NULL DEFAULT TRUE) — host can flip
  this off via ``PATCH /signed-leases/{id}`` for leases they don't want
  auto-mailed (e.g. they want to physically hand over the document).
* ``last_emailed_to_tenant_at`` (TIMESTAMPTZ NULL) — stamped the first
  time the auto-email path runs successfully. The auto-email gate
  checks this column so Regenerate does NOT re-send (idempotent on the
  user-visible action). The host can still manually re-send via
  ``POST /signed-leases/{id}/email-tenant``.

Forward-only; existing rows migrate to ``auto_email_tenant=TRUE``,
``last_emailed_to_tenant_at=NULL``, which means any lease that was
generated before this PR will auto-email on the NEXT generate / regenerate
if the host's contact_email is set. That's the desired behaviour — the
feature is opt-out, not opt-in.

Revision ID: leasemail260507
Revises: leasesign260507
Create Date: 2026-05-07 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "leasemail260507"
down_revision: Union[str, None] = "leasesign260507"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "signed_leases",
        sa.Column(
            "auto_email_tenant",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.add_column(
        "signed_leases",
        sa.Column(
            "last_emailed_to_tenant_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("signed_leases", "last_emailed_to_tenant_at")
    op.drop_column("signed_leases", "auto_email_tenant")
