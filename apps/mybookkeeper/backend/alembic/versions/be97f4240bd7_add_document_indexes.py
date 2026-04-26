"""add_document_indexes

Revision ID: be97f4240bd7
Revises: dfad38288858
Create Date: 2026-03-16 21:02:22.741885

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'be97f4240bd7'
down_revision: Union[str, None] = 'dfad38288858'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_documents_user_created", "documents", ["user_id", "created_at"], postgresql_using="btree")
    op.create_index("ix_documents_user_date", "documents", ["user_id", "date"], postgresql_using="btree")
    op.create_index("ix_documents_user_category", "documents", ["user_id", "category"], postgresql_using="btree")
    op.create_index("ix_documents_user_status", "documents", ["user_id", "status"], postgresql_using="btree")
    op.create_index("ix_documents_user_property", "documents", ["user_id", "property_id"], postgresql_using="btree")


def downgrade() -> None:
    op.drop_index("ix_documents_user_property")
    op.drop_index("ix_documents_user_status")
    op.drop_index("ix_documents_user_category")
    op.drop_index("ix_documents_user_date")
    op.drop_index("ix_documents_user_created")
