"""signed_leases: flip auto_email_tenant default from true → false

Operator preferred manual control over every tenant email instead of
opt-out automation. Two changes:

1. Flip the column ``server_default`` so new rows default to FALSE.
2. Backfill existing rows where ``last_emailed_to_tenant_at IS NULL``
   to FALSE — i.e. leases that haven't already triggered an
   auto-email won't suddenly fire on the next regenerate.

Leases that already auto-emailed (``last_emailed_to_tenant_at IS NOT
NULL``) are left alone — their ``auto_email_tenant`` value is now
moot anyway since the idempotency gate prevents a second send.

Revision ID: noaut260507
Revises: leasemail260507
Create Date: 2026-05-07 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "noaut260507"
down_revision: Union[str, None] = "leasemail260507"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "signed_leases",
        "auto_email_tenant",
        server_default=sa.false(),
    )
    op.execute(
        sa.text(
            "UPDATE signed_leases "
            "SET auto_email_tenant = false "
            "WHERE auto_email_tenant = true "
            "  AND last_emailed_to_tenant_at IS NULL"
        ),
    )


def downgrade() -> None:
    op.alter_column(
        "signed_leases",
        "auto_email_tenant",
        server_default=sa.true(),
    )
