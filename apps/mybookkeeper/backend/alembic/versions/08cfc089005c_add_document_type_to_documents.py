"""backfill document_type from extractions

Revision ID: 08cfc089005c
Revises: c3d4e5f6g7h8
Create Date: 2026-03-28 13:54:32.144932

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '08cfc089005c'
down_revision: Union[str, None] = 'c3d4e5f6g7h8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # documents.document_type was originally added by dfad38288858 as NOT NULL,
    # then dropped by c5d6e7f8a9b0 ("documents are file-storage only" cutover).
    # This migration re-adds it as nullable and backfills from the extractions
    # table. IF NOT EXISTS keeps the op idempotent against any DB that still
    # has the column (e.g. one that skipped c5d6e7f8a9b0 via manual intervention).
    op.execute("ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_type VARCHAR(50)")

    # Normalize to nullable — covers the case where the column pre-existed as
    # NOT NULL from dfad38288858 on a DB that never ran c5d6e7f8a9b0.
    op.alter_column('documents', 'document_type', nullable=True)

    # Backfill from the most recent completed extraction for each document.
    op.execute("""
        UPDATE documents d
        SET document_type = e.document_type
        FROM (
            SELECT DISTINCT ON (document_id) document_id, document_type
            FROM extractions
            WHERE status = 'completed'
            ORDER BY document_id, created_at DESC
        ) e
        WHERE d.id = e.document_id
    """)

    # Clear the legacy 'invoice' default on documents that have no extraction
    # (only relevant on DBs where the column pre-existed with that default).
    op.execute("""
        UPDATE documents d
        SET document_type = NULL
        WHERE NOT EXISTS (
            SELECT 1 FROM extractions e
            WHERE e.document_id = d.id AND e.status = 'completed'
        )
        AND d.document_type = 'invoice'
        AND d.status != 'completed'
    """)


def downgrade() -> None:
    # Restore NOT NULL with 'invoice' as fill for any nulls — matches the
    # column's original shape from dfad38288858.
    op.execute("UPDATE documents SET document_type = 'invoice' WHERE document_type IS NULL")
    op.alter_column('documents', 'document_type', nullable=False)
