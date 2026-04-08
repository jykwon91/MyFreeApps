"""backfill document_type from extractions

Revision ID: 08cfc089005c
Revises: c3d4e5f6g7h8
Create Date: 2026-03-28 13:54:32.144932

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '08cfc089005c'
down_revision: Union[str, None] = 'c3d4e5f6g7h8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Column already exists from migration dfad38288858 (NOT NULL, default 'invoice').
    # Make it nullable so documents without extractions don't need a fake default.
    op.alter_column('documents', 'document_type', nullable=True)

    # Backfill from the most recent completed extraction for each document,
    # overwriting the old 'invoice' default with the actual extracted type.
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

    # Clear the fake 'invoice' default on documents that have no extraction
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
    # Restore NOT NULL with 'invoice' as fill for any nulls
    op.execute("UPDATE documents SET document_type = 'invoice' WHERE document_type IS NULL")
    op.alter_column('documents', 'document_type', nullable=False)
