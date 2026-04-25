"""add_performance_indexes

Revision ID: cf24c8782091
Revises: 884ad5d6f846
Create Date: 2026-03-18 00:28:41.300113

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cf24c8782091'
down_revision: Union[str, None] = '884ad5d6f846'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_documents_user_status ON documents (user_id, status)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_documents_user_date ON documents (user_id, date)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_documents_status_created ON documents (status, created_at)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_documents_user_vendor_date ON documents (user_id, lower(vendor), date)"))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_documents_user_vendor_date"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_documents_status_created"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_documents_user_date"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_documents_user_status"))
