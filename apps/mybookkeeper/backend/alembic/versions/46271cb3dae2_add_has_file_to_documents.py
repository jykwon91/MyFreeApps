"""add_has_file_to_documents

Revision ID: 46271cb3dae2
Revises: 186c7b93cdc7
Create Date: 2026-03-16 19:09:47.288976

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '46271cb3dae2'
down_revision: Union[str, None] = '186c7b93cdc7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('documents', sa.Column('has_file', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.execute("UPDATE documents SET has_file = true WHERE file_content IS NOT NULL")
    op.alter_column('documents', 'has_file', server_default=None)

    op.execute("""
        CREATE OR REPLACE FUNCTION sync_has_file()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.has_file := (NEW.file_content IS NOT NULL);
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        CREATE TRIGGER trg_sync_has_file
        BEFORE INSERT OR UPDATE OF file_content ON documents
        FOR EACH ROW
        EXECUTE FUNCTION sync_has_file();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_sync_has_file ON documents")
    op.execute("DROP FUNCTION IF EXISTS sync_has_file()")
    op.drop_column('documents', 'has_file')
