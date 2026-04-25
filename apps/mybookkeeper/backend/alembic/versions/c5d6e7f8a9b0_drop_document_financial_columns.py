"""drop_document_financial_columns

Revision ID: c5d6e7f8a9b0
Revises: b4c5d6e7f8a9
Create Date: 2026-03-19 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "c5d6e7f8a9b0"
down_revision: Union[str, None] = "b4c5d6e7f8a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop trigger that references has_file column
    op.execute("DROP TRIGGER IF EXISTS trg_sync_has_file ON documents")
    op.execute("DROP FUNCTION IF EXISTS sync_has_file()")

    # Drop indexes that reference financial columns
    op.drop_index("ix_documents_user_status", table_name="documents")
    op.drop_index("ix_documents_user_date", table_name="documents")
    op.drop_index("ix_documents_summary", table_name="documents")

    # Drop financial columns from documents table
    op.drop_column("documents", "date")
    op.drop_column("documents", "vendor")
    op.drop_column("documents", "amount")
    op.drop_column("documents", "description")
    op.drop_column("documents", "tax_relevant")
    op.drop_column("documents", "channel")
    op.drop_column("documents", "address")
    op.drop_column("documents", "document_type")
    op.drop_column("documents", "tags")
    op.drop_column("documents", "line_items")
    op.drop_column("documents", "raw_extracted")
    op.drop_column("documents", "confidence")
    op.drop_column("documents", "has_file")


def downgrade() -> None:
    op.add_column("documents", sa.Column("has_file", sa.Boolean(), nullable=True, server_default=sa.text("false")))
    op.add_column("documents", sa.Column("confidence", sa.String(20), nullable=True))
    op.add_column("documents", sa.Column("raw_extracted", postgresql.JSONB(), nullable=True))
    op.add_column("documents", sa.Column("line_items", postgresql.JSONB(), nullable=True))
    op.add_column("documents", sa.Column("tags", postgresql.JSONB(), nullable=True))
    op.add_column("documents", sa.Column("document_type", sa.String(50), nullable=True, server_default=sa.text("'invoice'")))
    op.add_column("documents", sa.Column("address", sa.String(500), nullable=True))
    op.add_column("documents", sa.Column("channel", sa.String(100), nullable=True))
    op.add_column("documents", sa.Column("tax_relevant", sa.Boolean(), nullable=True, server_default=sa.text("false")))
    op.add_column("documents", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("documents", sa.Column("amount", sa.Numeric(12, 2), nullable=True))
    op.add_column("documents", sa.Column("vendor", sa.String(255), nullable=True))
    op.add_column("documents", sa.Column("date", sa.DateTime(timezone=True), nullable=True))

    op.create_index("ix_documents_user_status", "documents", ["user_id", "status"])
    op.create_index("ix_documents_user_date", "documents", ["user_id", "date"])
    op.execute("""
        CREATE INDEX ix_documents_summary
        ON documents (user_id, date)
        WHERE status = 'approved' AND amount IS NOT NULL
    """)
