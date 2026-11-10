"""Record which lease files went out in a tenant email.

``signed_leases.last_emailed_to_tenant_at`` is lease-wide, and an extension
addendum email sets it too, so it cannot say which files the tenant was given.
Each attachment now carries its own ``emailed_to_tenant_at``.

Backfill (conservative, a known limitation): every ``rendered_original`` and
``signed_lease`` file uploaded at or before the lease's last email is stamped
with that time. That is exactly the set the old "uploaded at or before the last
email" rule locked, so nothing that was locked becomes removable. It cannot be
made exact: the lease column keeps only the latest email of either kind, the
``lease_email_sent`` events record only a lease id and an attachment count
(not which files, nor whether it was the documents email or an addendum), and
an extension does not record whether or when its addendum was emailed. So a
signed copy uploaded before an addendum-only email stays locked, as it was
before this migration. Correcting one by hand: set its
``emailed_to_tenant_at`` back to NULL once it is confirmed the tenant was
never sent that file.

Revision ID: leasefileemail261110
Revises: taxfieldempty261109
Create Date: 2026-11-10 00:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "leasefileemail261110"
down_revision: str | None = "taxfieldempty261109"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

BACKFILL = (
    "UPDATE signed_lease_attachments AS a"
    " SET emailed_to_tenant_at = l.last_emailed_to_tenant_at"
    " FROM signed_leases l"
    " WHERE l.id = a.lease_id"
    " AND l.last_emailed_to_tenant_at IS NOT NULL"
    " AND a.uploaded_at <= l.last_emailed_to_tenant_at"
    " AND a.kind IN ('rendered_original', 'signed_lease')"
)


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("SET LOCAL lock_timeout = '5s'")
    op.add_column(
        "signed_lease_attachments",
        sa.Column("emailed_to_tenant_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute(BACKFILL)


def downgrade() -> None:
    op.drop_column("signed_lease_attachments", "emailed_to_tenant_at")
