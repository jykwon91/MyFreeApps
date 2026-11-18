"""Record the hash of the zip a batch of documents was unpacked from.

``documents.batch_content_hash`` holds the SHA-256 of the uploaded zip on every
document unpacked from it. Sending the same zip again (the phone resends a file
whose answer was lost) finds the earlier batch instead of creating a second set
of documents, the way a single file is already matched on ``content_hash``.

Existing batches stay NULL: the zip's bytes were never kept, so there is no
hash to backfill.

Revision ID: zipbatchhash261117
Revises: leasetplver261110
Create Date: 2026-11-17 00:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "zipbatchhash261117"
down_revision: str | None = "leasetplver261110"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("SET LOCAL lock_timeout = '5s'")
    op.add_column("documents", sa.Column("batch_content_hash", sa.String(64), nullable=True))
    op.create_index(
        "ix_documents_batch_content_hash",
        "documents",
        ["organization_id", "batch_content_hash"],
    )


def downgrade() -> None:
    op.drop_index("ix_documents_batch_content_hash", table_name="documents")
    op.drop_column("documents", "batch_content_hash")
