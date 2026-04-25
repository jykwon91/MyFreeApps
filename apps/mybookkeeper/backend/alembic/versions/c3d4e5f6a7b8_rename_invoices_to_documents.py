"""rename_invoices_to_documents

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-03-15 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.rename_table("invoices", "documents")
    op.execute("ALTER TABLE documents RENAME CONSTRAINT uq_invoice_external TO uq_document_external")


def downgrade() -> None:
    op.execute("ALTER TABLE documents RENAME CONSTRAINT uq_document_external TO uq_invoice_external")
    op.rename_table("documents", "invoices")
