"""Add signing-state columns to signed_lease_attachments.

The host can now mark a lease attachment as signed by the tenant, the
landlord, or both. The columns drive the friendly download filename
("Lease Agreement - tenant signed.pdf" / "- fully signed.pdf") so a
downloaded file is self-describing instead of a bare GUID.

Both columns default to NULL — every existing row migrates as
"unsigned by either party", which is the correct retroactive label for
attachments uploaded before this PR. Forward-only data migration; no
backfill required.

Revision ID: leasesign260507
Revises: datehide260507
Create Date: 2026-05-07 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "leasesign260507"
down_revision: Union[str, None] = "datehide260507"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "signed_lease_attachments",
        sa.Column(
            "signed_by_tenant_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "signed_lease_attachments",
        sa.Column(
            "signed_by_landlord_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("signed_lease_attachments", "signed_by_landlord_at")
    op.drop_column("signed_lease_attachments", "signed_by_tenant_at")
