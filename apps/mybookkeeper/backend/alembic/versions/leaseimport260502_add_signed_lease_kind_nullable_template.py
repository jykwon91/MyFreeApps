"""Make signed_leases.template_id nullable; add signed_leases.kind column.

Phase 1.5 of the lease feature. Allows hosts to import externally-signed
PDFs without going through the generate-from-template flow.

Changes:
1. Drop NOT NULL constraint on ``signed_leases.template_id`` (RESTRICT FK
   behaviour is preserved — generated leases still point at a template, and
   the template can't be deleted while they do).
2. Add ``signed_leases.kind varchar(20) NOT NULL`` with a server default of
   ``'generated'`` so the backfill of existing rows is automatic at migration
   time. The server default is then dropped (the service layer sets kind
   explicitly going forward).
3. Add CHECK constraint ``kind IN ('generated', 'imported')``.

Downgrade restores NOT NULL on template_id and drops the kind column.

Revision ID: leaseimport260502
Revises: lease260502
Create Date: 2026-05-02 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.lease_enums import LEASE_KINDS_SQL

revision: str = "leaseimport260502"
down_revision: Union[str, None] = "lease260502"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Drop NOT NULL on template_id — existing rows already have a value,
    #    so this is a metadata-only change on PostgreSQL.
    op.alter_column(
        "signed_leases",
        "template_id",
        existing_type=sa.dialects.postgresql.UUID(as_uuid=True),
        nullable=True,
    )

    # 2. Add kind column with a temporary server default so existing rows get
    #    backfilled to 'generated' automatically.
    op.add_column(
        "signed_leases",
        sa.Column(
            "kind",
            sa.String(20),
            nullable=False,
            server_default="generated",
        ),
    )

    # 3. Add CHECK constraint.
    op.create_check_constraint(
        "chk_signed_lease_kind",
        "signed_leases",
        f"kind IN {LEASE_KINDS_SQL}",
    )

    # 4. Remove server default — kind must be set explicitly by the service.
    op.alter_column(
        "signed_leases",
        "kind",
        server_default=None,
    )


def downgrade() -> None:
    # Restore NOT NULL on template_id.  This will fail if any row has
    # template_id = NULL (i.e. imported leases exist).  Drop imported rows
    # first if needed.
    op.drop_constraint(
        "chk_signed_lease_kind",
        "signed_leases",
        type_="check",
    )
    op.drop_column("signed_leases", "kind")
    op.alter_column(
        "signed_leases",
        "template_id",
        existing_type=sa.dialects.postgresql.UUID(as_uuid=True),
        nullable=False,
    )
