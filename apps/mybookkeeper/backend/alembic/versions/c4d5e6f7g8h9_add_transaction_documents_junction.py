"""add transaction_documents junction table for dedup

Revision ID: c4d5e6f7g8h9
Revises: b3c4d5e6f7g8
Create Date: 2026-03-29 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = 'c4d5e6f7g8h9'
down_revision: Union[str, None] = 'b3c4d5e6f7g8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "transaction_documents",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("transaction_id", UUID(as_uuid=True), sa.ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_id", UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("extraction_id", UUID(as_uuid=True), sa.ForeignKey("extractions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("link_type", sa.String(20), nullable=False, server_default="duplicate_source"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_unique_constraint("uq_txn_doc", "transaction_documents", ["transaction_id", "document_id"])
    op.create_check_constraint(
        "chk_txn_doc_link_type", "transaction_documents",
        "link_type IN ('duplicate_source', 'corroborating', 'manual')",
    )
    op.create_index("ix_txn_doc_transaction", "transaction_documents", ["transaction_id"])
    op.create_index("ix_txn_doc_document", "transaction_documents", ["document_id"])


def downgrade() -> None:
    op.drop_table("transaction_documents")
